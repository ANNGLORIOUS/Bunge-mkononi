from __future__ import annotations

from datetime import date, timedelta
from io import StringIO
from pathlib import Path
from unittest.mock import Mock, patch
from typing import Any, Protocol, cast

from django.contrib.admin.sites import AdminSite
from django.contrib.auth import get_user_model
from django.core.management import call_command
import requests
from django.test import RequestFactory, TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIRequestFactory, force_authenticate

from .admin import BillAdmin
from apps.legislative.representative_scrapers import (
    MP_URL,
    MP_URL_ALTERNATES,
    _parse_member_cards,
    scrape_representatives as scrape_member_representatives,
)
from apps.legislative.ai import (
    _cohere_post,
    _parse_json_object,
    build_bill_ai_source_hash,
)
from apps.legislative.document_processing import analyze_pdf_document

from .models import (
    Bill,
    BillStatus,
    LogEventType,
    MessageLanguage,
    OutboundMessage,
    OutboundMessageStatus,
    OutboundMessageType,
    Representative,
    RepresentativeVote,
    Subscription,
    SubscriptionFrequency,
    SubscriptionScope,
    SubscriptionStatus,
    SystemLog,
    VoteChoice,
)
from .services import ensure_bill_document_processed, process_bill_document
from .views import (
    BillProcessingAdminAPIView,
    BillViewSet,
    BillVoteSummaryAPIView,
    BillVotesAPIView,
    RepresentativeViewSet,
    SmsInboundAPIView,
    SubscriptionViewSet,
    UssdCallbackAPIView,
)
from .scrapers import parse_bills_html, upsert_bills
from .services import (
    create_subscription,
    dispatch_outbound_message,
    queue_outbound_message,
    record_sms_delivery_report,
    update_bill_status,
)


class SupportsCommitCallbacks(Protocol):
    def captureOnCommitCallbacks(self, *, execute: bool = False) -> Any: ...


class CommitCallbacksMixin:
    def capture_on_commit_callbacks(self, execute: bool = False) -> Any:
        testcase = cast(SupportsCommitCallbacks, self)
        return testcase.captureOnCommitCallbacks(execute=execute)


def response_data(response: Any) -> Any:
    return cast(Any, response).data


class BillStatusNotificationTests(CommitCallbacksMixin, TestCase):
    def setUp(self):
        self.bill = Bill.objects.create(
            id="test-bill",
            title="Test Bill",
            summary="A short summary for testing SMS notifications.",
            status=BillStatus.FIRST_READING,
            category="Finance",
            date_introduced=date(2026, 1, 1),
            is_hot=False,
        )

    def test_update_bill_status_queues_automatic_sms_broadcast(self):
        with patch("apps.legislative.services.broadcast_bill_update") as broadcast_mock:
            with self.capture_on_commit_callbacks(execute=True):
                update_bill_status(
                    self.bill,
                    BillStatus.SECOND_READING,
                    previous_status=BillStatus.FIRST_READING,
                    actor="admin",
                )

        broadcast_mock.assert_called_once()
        _, message = broadcast_mock.call_args.args
        self.assertIn(self.bill.title, message)
        self.assertIn("First Reading -> Second Reading", message)

    def test_scraper_upsert_triggers_status_change_hook(self):
        with patch("apps.legislative.scrapers.update_bill_status") as status_mock:
            summary = upsert_bills(
                [
                    {
                        "id": self.bill.id,
                        "title": self.bill.title,
                        "summary": self.bill.summary,
                        "status": BillStatus.SECOND_READING,
                        "category": self.bill.category,
                        "date_introduced": self.bill.date_introduced,
                        "is_hot": self.bill.is_hot,
                        "parliament_url": "https://example.com/bill",
                        "key_points": [],
                        "timeline": [],
                    }
                ]
            )

        self.assertEqual(summary["updated"], 1)
        status_mock.assert_called_once()
        call_args = status_mock.call_args
        self.assertEqual(call_args.args[0].pk, self.bill.pk)
        self.assertEqual(call_args.args[1], BillStatus.SECOND_READING)
        self.assertEqual(call_args.kwargs["previous_status"], BillStatus.FIRST_READING)
        self.assertEqual(call_args.kwargs["actor"], "scrape")

    def test_scraper_upsert_leaves_document_processing_for_runtime(self):
        progress_messages: list[str] = []

        summary = upsert_bills(
            [
                {
                    "id": "skip-doc-bill",
                    "title": "Skip Document Bill",
                    "summary": "A bill used to test runtime document processing after scrape.",
                    "status": BillStatus.FIRST_READING,
                    "category": "Finance",
                    "date_introduced": date(2026, 3, 20),
                    "is_hot": False,
                    "full_text_url": "https://www.parliament.go.ke/sites/default/files/2026-03/skip-doc.pdf",
                }
            ],
            progress_callback=progress_messages.append,
        )

        self.assertEqual(summary["created"], 1)
        self.assertTrue(any("Upserting Skip Document Bill" in message for message in progress_messages))
        scraped_bill = Bill.objects.get(pk="skip-doc-bill")
        self.assertIsNone(scraped_bill.document_processed_at)
        self.assertEqual(scraped_bill.document_status, "unavailable")


class ScrapeBillsCommandTests(TestCase):
    def test_command_passes_progress_and_max_pages_options(self):
        output = StringIO()

        with patch("apps.legislative.management.commands.scrape_bills.scrape_parliament_bills") as scrape_mock:
            scrape_mock.return_value = {
                "bills_found": 0,
                "pages_fetched": 0,
                "created": 0,
                "updated": 0,
                "documents_processed": False,
                "processed_bills": [],
                "errors": [],
            }
            call_command("scrape_bills", "--max-pages=3", stdout=output)

        self.assertEqual(scrape_mock.call_args.kwargs["max_pages"], 3)
        self.assertTrue(callable(scrape_mock.call_args.kwargs["progress_callback"]))


class CohereResilienceTests(TestCase):
    @override_settings(
        COHERE_API_KEY="test-key",
        COHERE_REQUEST_MAX_RETRIES=2,
        COHERE_REQUEST_RETRY_BASE_DELAY=0.25,
    )
    def test_cohere_post_retries_with_exponential_backoff_on_timeout(self):
        success_response = Mock()
        success_response.ok = True
        success_response.json.return_value = {"ok": True}

        with patch(
            "apps.legislative.ai.requests.post",
            side_effect=[
                requests.ReadTimeout("first timeout"),
                requests.ReadTimeout("second timeout"),
                success_response,
            ],
        ) as post_mock:
            with patch("apps.legislative.ai.time.sleep") as sleep_mock:
                payload = _cohere_post("/v2/chat", {"message": "test"})

        self.assertEqual(payload, {"ok": True})
        self.assertEqual(post_mock.call_count, 3)
        self.assertEqual(sleep_mock.call_count, 2)
        self.assertEqual(sleep_mock.call_args_list[0].args[0], 0.25)
        self.assertEqual(sleep_mock.call_args_list[1].args[0], 0.5)

    def test_parse_json_object_accepts_wrapped_fenced_json(self):
        payload = _parse_json_object(
            """
            Here is the JSON you requested:

            ```json
            {"bills":[{"title":"Wrapped Bill"}]}
            ```
            """
        )

        self.assertEqual(payload["bills"][0]["title"], "Wrapped Bill")


class BillScraperParsingTests(TestCase):
    def test_parse_bills_html_extracts_table_bill_metadata(self):
        html = """
        <table>
            <tr><th>Bill</th><th>Sponsor</th><th>Stage</th><th>Date</th></tr>
            <tr>
                <td><a href="/bill/ntsa-amendment">National Transport and Safety Authority (Amendment) Bill, 2022</a></td>
                <td>Hon. Jane Doe</td>
                <td>Second Reading</td>
                <td>12 March 2026</td>
            </tr>
        </table>
        """

        bills = parse_bills_html(html, base_url="https://www.parliament.go.ke/the-national-assembly/house-business/bills")

        self.assertEqual(len(bills), 1)
        self.assertEqual(bills[0]["title"], "National Transport and Safety Authority (Amendment) Bill, 2022")
        self.assertEqual(bills[0]["sponsor"], "Hon. Jane Doe")
        self.assertEqual(bills[0]["status"], BillStatus.SECOND_READING)
        self.assertEqual(bills[0]["parliament_url"], "https://www.parliament.go.ke/bill/ntsa-amendment")
        self.assertEqual(bills[0]["full_text_url"], "https://www.parliament.go.ke/bill/ntsa-amendment")

    def test_parse_bills_html_uses_title_href_as_document_url(self):
        html = """
        <table>
            <tr><th>Bill</th><th>Sponsor</th><th>Stage</th><th>Date</th></tr>
            <tr>
                <td><a href="/sites/default/files/2026-03/special-economic-zones.pdf">The Special Economic Zones (Amendment) Bill, 2026</a></td>
                <td>Hon. Jane Doe</td>
                <td>Second Reading</td>
                <td>12 March 2026</td>
            </tr>
        </table>
        """

        bills = parse_bills_html(
            html,
            base_url="https://www.parliament.go.ke/the-national-assembly/house-business/bills",
        )

        self.assertEqual(len(bills), 1)
        self.assertEqual(
            bills[0]["full_text_url"],
            "https://www.parliament.go.ke/sites/default/files/2026-03/special-economic-zones.pdf",
        )
        self.assertEqual(
            bills[0]["parliament_url"],
            "https://www.parliament.go.ke/sites/default/files/2026-03/special-economic-zones.pdf",
        )

    def test_parse_bills_html_handles_committee_stage_entries(self):
        html = """
        <table>
            <tr><th>Bill</th><th>Sponsor</th><th>Stage</th><th>Date</th></tr>
            <tr>
                <td><a href="/bill/iebc-amendment">Independent Electoral and Boundaries Commission (Amendment) Bill, 2022</a></td>
                <td>Hon. Electoral Reform</td>
                <td>Committee Stage</td>
                <td>2026-03-15</td>
            </tr>
        </table>
        """

        bills = parse_bills_html(html, base_url="https://www.parliament.go.ke/the-national-assembly/house-business/bills")

        self.assertEqual(len(bills), 1)
        self.assertEqual(bills[0]["title"], "Independent Electoral and Boundaries Commission (Amendment) Bill, 2022")
        self.assertEqual(bills[0]["sponsor"], "Hon. Electoral Reform")
        self.assertEqual(bills[0]["status"], BillStatus.COMMITTEE)
        self.assertEqual(bills[0]["full_text_url"], "https://www.parliament.go.ke/bill/iebc-amendment")


class BillDocumentProcessingTests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.bill = Bill.objects.create(
            id="document-bill",
            title="Document Bill",
            summary="A bill used to test extracted document storage.",
            status=BillStatus.FIRST_READING,
            category="Justice",
            date_introduced=date(2026, 1, 15),
            is_hot=False,
            full_text_url="https://www.parliament.go.ke/sites/default/files/2025-09/example.pdf",
        )

    def test_process_bill_document_persists_structured_content(self):
        with patch("apps.legislative.services.analyze_pdf_document") as analyze_mock:
            analyze_mock.return_value = {
                "status": "ready",
                "method": "text",
                "sourceUrl": self.bill.full_text_url,
                "sourceFingerprint": "fingerprint-1",
                "text": "An Act of Parliament to make provision for testing.",
                "pages": [
                    {
                        "pageNumber": 1,
                        "blocks": [
                            {"type": "heading", "text": "AN ACT", "level": 1},
                            {"type": "paragraph", "text": "An Act of Parliament to make provision for testing."},
                        ],
                    }
                ],
                "pageCount": 1,
                "wordCount": 9,
                "error": "",
            }

            result = process_bill_document(self.bill, force=True)

        self.bill = Bill.objects.get(pk=self.bill.pk)
        self.assertEqual(result["status"], "ready")
        self.assertEqual(self.bill.document_status, "ready")
        self.assertEqual(self.bill.document_method, "text")
        self.assertEqual(self.bill.document_source_url, self.bill.full_text_url)
        self.assertEqual(self.bill.document_source_fingerprint, "fingerprint-1")
        self.assertEqual(self.bill.document_page_count, 1)
        self.assertEqual(self.bill.document_word_count, 9)
        self.assertEqual(self.bill.document_pages[0]["pageNumber"], 1)
        self.assertIn("testing", self.bill.document_text)

    def test_bill_detail_endpoint_includes_document_fields(self):
        self.bill.document_status = "ready"
        self.bill.document_method = "text"
        self.bill.document_source_url = self.bill.full_text_url
        self.bill.document_source_fingerprint = "fingerprint-1"
        self.bill.document_text = "Structured bill text"
        self.bill.ai_summary = "AI summary for the document bill."
        self.bill.ai_key_points = ["AI point one", "AI point two"]
        self.bill.ai_timeline = [{"label": "Current stage", "description": "The bill is in first reading."}]
        self.bill.document_pages = [
            {
                "pageNumber": 1,
                "blocks": [{"type": "paragraph", "text": "Structured bill text"}],
            }
        ]
        self.bill.document_processed_at = timezone.now()
        self.bill.document_error = ""
        self.bill.document_page_count = 1
        self.bill.document_word_count = 3
        self.bill.save(
            update_fields=[
                "document_status",
                "document_method",
                "document_source_url",
                "document_source_fingerprint",
                "document_text",
                "ai_summary",
                "ai_key_points",
                "ai_timeline",
                "document_pages",
                "document_processed_at",
                "document_error",
                "document_page_count",
                "document_word_count",
            ]
        )

        request = self.factory.get(f"/api/bills/{self.bill.pk}/")
        response = BillViewSet.as_view({"get": "retrieve"})(request, pk=self.bill.pk)
        data = response_data(response)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(data["documentStatus"], "ready")
        self.assertEqual(data["documentMethod"], "text")
        self.assertEqual(data["aiSummary"], "AI summary for the document bill.")
        self.assertEqual(data["aiKeyPoints"][0], "AI point one")
        self.assertIn("documentPages", data)
        self.assertEqual(data["documentPages"][0]["pageNumber"], 1)

    @override_settings(COHERE_API_KEY="test-key")
    def test_process_bill_document_generates_ai_fields_when_enabled(self):
        with patch("apps.legislative.services.analyze_pdf_document") as analyze_mock:
            analyze_mock.return_value = {
                "status": "ready",
                "method": "text",
                "sourceUrl": self.bill.full_text_url,
                "sourceFingerprint": "fingerprint-1",
                "text": "An Act of Parliament to make provision for testing.",
                "pages": [
                    {
                        "pageNumber": 1,
                        "blocks": [
                            {"type": "paragraph", "text": "An Act of Parliament to make provision for testing."},
                        ],
                    }
                ],
                "pageCount": 1,
                "wordCount": 9,
                "error": "",
            }
            with patch("apps.legislative.services.generate_bill_ai_artifacts") as ai_mock:
                ai_mock.return_value = {
                    "sourceHash": "abc123",
                    "summary": "AI generated summary.",
                    "keyPoints": ["Point one", "Point two"],
                    "timeline": [{"label": "Current stage", "description": "First Reading"}],
                }
                process_bill_document(self.bill, force=True)

        self.bill.refresh_from_db()
        self.assertEqual(self.bill.ai_summary, "AI generated summary.")
        self.assertEqual(self.bill.ai_key_points, ["Point one", "Point two"])
        self.assertEqual(self.bill.ai_timeline[0]["label"], "Current stage")
        self.assertEqual(self.bill.ai_source_hash, "abc123")
        self.assertEqual(self.bill.ai_error, "")

    @override_settings(COHERE_API_KEY="test-key")
    def test_ai_hash_only_changes_when_document_content_changes(self):
        self.bill.document_source_url = self.bill.full_text_url
        self.bill.document_source_fingerprint = "fingerprint-1"
        self.bill.document_text = "Original extracted text."
        self.bill.document_page_count = 1
        self.bill.document_word_count = 3
        self.bill.save(
            update_fields=[
                "document_source_url",
                "document_source_fingerprint",
                "document_text",
                "document_page_count",
                "document_word_count",
            ]
        )

        baseline_hash = build_bill_ai_source_hash(self.bill)

        self.bill.summary = "Completely new human summary."
        self.bill.sponsor = "Hon. Someone Else"
        self.bill.status = BillStatus.SECOND_READING
        self.bill.save(update_fields=["summary", "sponsor", "status"])
        self.bill.refresh_from_db()

        self.assertEqual(build_bill_ai_source_hash(self.bill), baseline_hash)

    @override_settings(COHERE_API_KEY="test-key")
    def test_process_bill_document_skips_reprocessing_when_pdf_fingerprint_is_unchanged(self):
        self.bill.document_status = "ready"
        self.bill.document_method = "ai"
        self.bill.document_source_url = self.bill.full_text_url
        self.bill.document_source_fingerprint = "fingerprint-1"
        self.bill.document_text = "Existing extracted text."
        self.bill.document_processed_at = timezone.now()
        self.bill.ai_summary = "Existing AI summary."
        self.bill.ai_key_points = ["Existing point"]
        self.bill.ai_source_hash = build_bill_ai_source_hash(self.bill)
        self.bill.save(
            update_fields=[
                "document_status",
                "document_method",
                "document_source_url",
                "document_source_fingerprint",
                "document_text",
                "document_processed_at",
                "ai_summary",
                "ai_key_points",
                "ai_source_hash",
            ]
        )

        with patch("apps.legislative.services.fetch_pdf_source_fingerprint", return_value="fingerprint-1"):
            with patch("apps.legislative.services.analyze_pdf_document") as analyze_mock:
                with patch("apps.legislative.services.generate_bill_ai_artifacts") as ai_mock:
                    result = process_bill_document(self.bill, force=False)

        analyze_mock.assert_not_called()
        ai_mock.assert_not_called()
        self.assertEqual(result["sourceFingerprint"], "fingerprint-1")
        self.assertEqual(result["text"], "Existing extracted text.")

    @override_settings(COHERE_API_KEY="test-key")
    def test_ensure_bill_document_processed_refreshes_missing_ai_for_ready_document(self):
        self.bill.document_status = "ready"
        self.bill.document_method = "text"
        self.bill.document_source_url = self.bill.full_text_url
        self.bill.document_source_fingerprint = "fingerprint-1"
        self.bill.document_text = "Existing extracted text."
        self.bill.document_processed_at = timezone.now()
        self.bill.ai_summary = ""
        self.bill.ai_key_points = []
        self.bill.ai_source_hash = ""
        self.bill.save(
            update_fields=[
                "document_status",
                "document_method",
                "document_source_url",
                "document_source_fingerprint",
                "document_text",
                "document_processed_at",
                "ai_summary",
                "ai_key_points",
                "ai_source_hash",
            ]
        )

        with patch("apps.legislative.services.process_bill_document", return_value={}) as process_mock:
            processed = ensure_bill_document_processed(self.bill, force=False)

        self.assertTrue(processed)
        process_mock.assert_called_once_with(self.bill, force=False)


class BillDocumentAutomationTests(CommitCallbacksMixin, TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.request_factory = RequestFactory()
        self.staff_user = get_user_model().objects.create_user(
            username="staff-user",
            password="test-pass-123",
            is_staff=True,
        )
        self.bill = Bill.objects.create(
            id="auto-bill",
            title="Automated Pipeline Bill",
            summary="A bill used to verify automatic document processing.",
            status=BillStatus.FIRST_READING,
            category="Finance",
            date_introduced=date(2026, 3, 1),
            is_hot=False,
            full_text_url="https://www.parliament.go.ke/sites/default/files/2026-03/automated.pdf",
        )

    def test_bill_detail_endpoint_schedules_document_processing_in_background(self):
        request = self.factory.get(f"/api/bills/{self.bill.pk}/")

        with patch("apps.legislative.views.schedule_bill_document_processing", return_value=True) as schedule_mock:
            response = BillViewSet.as_view({"get": "retrieve"})(request, pk=self.bill.pk)

        self.assertEqual(response.status_code, 200)
        schedule_mock.assert_called_once()
        self.assertEqual(schedule_mock.call_args.args[0].pk, self.bill.pk)

    def test_bill_list_endpoint_returns_metadata_without_processing_documents(self):
        request = self.factory.get("/api/bills/")

        with patch("apps.legislative.views.schedule_bill_document_processing") as schedule_mock:
            response = BillViewSet.as_view({"get": "list"})(request)

        self.assertEqual(response.status_code, 200)
        schedule_mock.assert_not_called()
        self.assertEqual(response_data(response)["results"][0]["id"], self.bill.pk)

    def test_bill_create_schedules_document_processing_after_commit(self):
        request = self.factory.post(
            "/api/bills/",
            {
                "id": "created-bill",
                "title": "Created Bill",
                "summary": "A bill created through the API.",
                "status": BillStatus.FIRST_READING,
                "category": "Finance",
                "dateIntroduced": "2026-03-03",
                "fullTextUrl": "https://www.parliament.go.ke/sites/default/files/2026-03/created.pdf",
            },
            format="json",
        )
        force_authenticate(request, user=self.staff_user)

        with patch("apps.legislative.views.schedule_bill_document_processing", return_value=True) as schedule_mock:
            with self.capture_on_commit_callbacks(execute=True):
                response = BillViewSet.as_view({"post": "create"})(request)

        self.assertEqual(response.status_code, 201)
        schedule_mock.assert_called_once()
        self.assertEqual(schedule_mock.call_args.args[0].pk, "created-bill")
        self.assertTrue(schedule_mock.call_args.kwargs["check_for_updates"])

    def test_bill_partial_update_schedules_document_processing_after_commit(self):
        request = self.factory.patch(
            f"/api/bills/{self.bill.pk}/",
            {
                "fullTextUrl": "https://www.parliament.go.ke/sites/default/files/2026-03/updated.pdf",
            },
            format="json",
        )
        force_authenticate(request, user=self.staff_user)

        with patch("apps.legislative.views.schedule_bill_document_processing", return_value=True) as schedule_mock:
            with self.capture_on_commit_callbacks(execute=True):
                response = BillViewSet.as_view({"patch": "partial_update"})(request, pk=self.bill.pk)

        self.assertEqual(response.status_code, 200)
        schedule_mock.assert_called_once()
        self.assertEqual(schedule_mock.call_args.args[0].pk, self.bill.pk)
        self.assertTrue(schedule_mock.call_args.kwargs["check_for_updates"])

    def test_bill_ask_endpoint_auto_processes_before_answering(self):
        request = self.factory.post(
            f"/api/bills/{self.bill.pk}/ask/",
            {"question": "What does this bill do?"},
            format="json",
        )

        with patch("apps.legislative.views.ensure_bill_document_processed", return_value=True) as ensure_mock:
            with patch("apps.legislative.views.answer_bill_question") as answer_mock:
                answer_mock.return_value = {
                    "question": "What does this bill do?",
                    "answer": "It updates the automated processing workflow.",
                    "excerpts": [],
                }
                response = BillViewSet.as_view({"post": "ask"})(request, pk=self.bill.pk)

        self.assertEqual(response.status_code, 200)
        ensure_mock.assert_called_once()
        answer_mock.assert_called_once()

    def test_bill_admin_save_schedules_document_processing_after_commit(self):
        request = self.request_factory.post("/admin/legislative/bill/add/")
        request.user = self.staff_user
        admin = BillAdmin(Bill, AdminSite())
        bill = Bill(
            id="admin-bill",
            title="Admin Added Bill",
            summary="A bill saved through the Django admin.",
            status=BillStatus.FIRST_READING,
            category="Finance",
            date_introduced=date(2026, 3, 5),
            is_hot=False,
            full_text_url="https://www.parliament.go.ke/sites/default/files/2026-03/admin.pdf",
        )

        with patch("apps.legislative.admin.schedule_bill_document_processing", return_value=True) as schedule_mock:
            with self.capture_on_commit_callbacks(execute=True):
                admin.save_model(request, bill, form=None, change=False)

        self.assertTrue(Bill.objects.filter(pk="admin-bill").exists())
        schedule_mock.assert_called_once()
        self.assertEqual(schedule_mock.call_args.args[0].pk, "admin-bill")
        self.assertTrue(schedule_mock.call_args.kwargs["check_for_updates"])


class BillProcessingAdminApiTests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.staff_user = get_user_model().objects.create_user(
            username="ai-admin",
            password="test-pass-123",
            is_staff=True,
        )
        Bill.objects.create(
            id="missing-doc",
            title="Missing Document Bill",
            summary="Needs background document extraction.",
            status=BillStatus.FIRST_READING,
            category="Finance",
            date_introduced=date(2026, 3, 10),
            is_hot=False,
            full_text_url="https://www.parliament.go.ke/sites/default/files/2026-03/missing-doc.pdf",
            document_status="unavailable",
        )
        Bill.objects.create(
            id="missing-ai",
            title="Missing AI Bill",
            summary="Has document text but no AI summary yet.",
            status=BillStatus.SECOND_READING,
            category="Justice",
            date_introduced=date(2026, 3, 11),
            is_hot=False,
            full_text_url="https://www.parliament.go.ke/sites/default/files/2026-03/missing-ai.pdf",
            document_status="ready",
            document_method="text",
            document_source_url="https://www.parliament.go.ke/sites/default/files/2026-03/missing-ai.pdf",
            document_text="Existing extracted text",
            document_processed_at=timezone.now(),
            ai_summary="",
        )
        Bill.objects.create(
            id="failed-doc",
            title="Failed Document Bill",
            summary="Previously failed extraction.",
            status=BillStatus.COMMITTEE,
            category="Health",
            date_introduced=date(2026, 3, 12),
            is_hot=False,
            full_text_url="https://www.parliament.go.ke/sites/default/files/2026-03/failed-doc.pdf",
            document_status="failed",
            document_source_url="https://www.parliament.go.ke/sites/default/files/2026-03/failed-doc.pdf",
            document_processed_at=timezone.now(),
        )
        Bill.objects.create(
            id="ready-ai",
            title="Ready AI Bill",
            summary="Already processed fully.",
            status=BillStatus.THIRD_READING,
            category="Education",
            date_introduced=date(2026, 3, 13),
            is_hot=False,
            full_text_url="https://www.parliament.go.ke/sites/default/files/2026-03/ready-ai.pdf",
            document_status="ready",
            document_method="text",
            document_source_url="https://www.parliament.go.ke/sites/default/files/2026-03/ready-ai.pdf",
            document_text="Existing extracted text",
            document_processed_at=timezone.now(),
            ai_summary="Already summarized.",
            ai_key_points=["Existing point"],
            ai_processed_at=timezone.now(),
        )

    @override_settings(COHERE_API_KEY="test-key")
    def test_get_returns_bill_processing_status_counts(self):
        request = self.factory.get("/api/bills/process/")
        force_authenticate(request, user=self.staff_user)

        with patch("apps.legislative.views.get_scheduled_bill_document_job_count", return_value=3):
            response = BillProcessingAdminAPIView.as_view()(request)

        data = response_data(response)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(data["aiEnabled"])
        self.assertEqual(data["totalBills"], 4)
        self.assertEqual(data["eligibleBills"], 4)
        self.assertEqual(data["readyDocuments"], 2)
        self.assertEqual(data["missingDocuments"], 1)
        self.assertEqual(data["missingAi"], 1)
        self.assertEqual(data["failedDocuments"], 1)
        self.assertEqual(data["queuedJobs"], 3)

    def test_get_returns_ready_document_detail_results(self):
        request = self.factory.get("/api/bills/process/", {"detail": "ready", "limit": 10})
        force_authenticate(request, user=self.staff_user)

        response = BillProcessingAdminAPIView.as_view()(request)

        data = response_data(response)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(data["scope"], "ready")
        self.assertEqual(data["count"], 2)
        self.assertEqual(data["limit"], 10)
        self.assertEqual([item["id"] for item in data["results"]], ["ready-ai", "missing-ai"])

    def test_get_returns_queued_job_detail_results(self):
        request = self.factory.get("/api/bills/process/", {"detail": "queued"})
        force_authenticate(request, user=self.staff_user)

        with patch(
            "apps.legislative.views.get_scheduled_bill_document_job_ids",
            return_value=["missing-ai", "failed-doc"],
        ):
            response = BillProcessingAdminAPIView.as_view()(request)

        data = response_data(response)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(data["scope"], "queued")
        self.assertEqual(data["count"], 2)
        self.assertEqual([item["id"] for item in data["results"]], ["failed-doc", "missing-ai"])

    def test_post_queues_matching_bills_for_requested_scope(self):
        Bill.objects.create(
            id="missing-doc-2",
            title="Missing Document Bill Two",
            summary="Also needs document extraction.",
            status=BillStatus.FIRST_READING,
            category="Finance",
            date_introduced=date(2026, 3, 9),
            is_hot=False,
            full_text_url="https://www.parliament.go.ke/sites/default/files/2026-03/missing-doc-2.pdf",
            document_status="unavailable",
        )
        request = self.factory.post("/api/bills/process/", {"scope": "missing_documents"}, format="json")
        force_authenticate(request, user=self.staff_user)

        with patch(
            "apps.legislative.views.schedule_bill_document_processing",
            side_effect=[True, False],
        ) as schedule_mock:
            with patch("apps.legislative.views.get_scheduled_bill_document_job_count", return_value=1):
                response = BillProcessingAdminAPIView.as_view()(request)

        data = response_data(response)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(data["scope"], "missing_documents")
        self.assertEqual(data["matchedBills"], 2)
        self.assertEqual(data["queuedBills"], 1)
        self.assertEqual(data["alreadyQueuedBills"], 1)
        self.assertEqual(data["queuedJobs"], 1)
        self.assertEqual(schedule_mock.call_count, 2)

    def test_delete_clears_queued_jobs(self):
        request = self.factory.delete("/api/bills/process/")
        force_authenticate(request, user=self.staff_user)

        with patch(
            "apps.legislative.views.clear_scheduled_bill_document_jobs",
            return_value={"dequeuedJobs": 3, "activeJobs": 1, "queuedJobs": 1},
        ) as clear_mock:
            response = BillProcessingAdminAPIView.as_view()(request)

        data = response_data(response)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(data["dequeuedJobs"], 3)
        self.assertEqual(data["activeJobs"], 1)
        self.assertEqual(data["queuedJobs"], 1)
        self.assertIn("Dequeued 3 waiting bill jobs.", data["message"])
        clear_mock.assert_called_once()


class BillAiVisionExtractionTests(TestCase):
    def test_analyze_pdf_document_uses_ai_vision_before_ocr(self):
        fake_pdf_path = Path("/tmp/fake-bill.pdf")

        with patch("apps.legislative.document_processing.fetch_pdf_source_fingerprint", return_value="fingerprint-vision"):
            with patch("apps.legislative.document_processing._download_pdf", return_value=(fake_pdf_path, "content-hash-1")):
                with patch("apps.legislative.document_processing._extract_pdf_page_count", return_value=2):
                    with patch("apps.legislative.document_processing._extract_pdf_text", return_value=""):
                        with patch(
                            "apps.legislative.document_processing._render_pdf_pages_to_pngs",
                            return_value=[(1, b"page-one"), (2, b"page-two")],
                        ):
                            with patch(
                                "apps.legislative.document_processing.extract_text_from_page_images",
                                side_effect=[
                                    [{"pageNumber": 1, "text": "Page one text"}, {"pageNumber": 2, "text": "Page two text"}]
                                ],
                            ):
                                result = analyze_pdf_document("https://example.com/test.pdf")

        self.assertEqual(result["status"], "ready")
        self.assertEqual(result["method"], "ai")
        self.assertEqual(result["sourceFingerprint"], "fingerprint-vision")
        self.assertEqual(result["pageCount"], 2)
        self.assertGreater(result["wordCount"], 0)
        self.assertEqual(result["pages"][0]["pageNumber"], 1)
        self.assertIn("Page one text", result["text"])


class BillSearchTests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.bill = Bill.objects.create(
            id="searchable-bill",
            title="Completely Different Title",
            summary="Another unrelated summary for bill search tests.",
            status=BillStatus.COMMITTEE,
            category="Environment",
            sponsor="Hon. Alice Wanjiku",
            date_introduced=date(2026, 2, 1),
            is_hot=False,
        )

    def test_bill_list_search_matches_multiple_bill_fields(self):
        search_terms = [
            ("searchable-bill", "id"),
            ("committee", "status"),
            ("environment", "category"),
            ("wanjiku", "sponsor"),
            ("unrelated summary", "summary"),
        ]

        for term, field_name in search_terms:
            with self.subTest(field=field_name):
                request = self.factory.get("/api/bills/", {"search": term})
                response = BillViewSet.as_view({"get": "list"})(request)
                data = response_data(response)

                self.assertEqual(response.status_code, 200)
                result_ids = [item["id"] for item in data["results"]]
                self.assertIn(self.bill.pk, result_ids)

    def test_bill_list_search_uses_semantic_ranking_when_available(self):
        request = self.factory.get("/api/bills/", {"search": "local county livelihoods"})

        with patch("apps.legislative.views.semantic_rank_bills", return_value=[self.bill.pk]):
            response = BillViewSet.as_view({"get": "list"})(request)

        data = response_data(response)
        self.assertEqual(response.status_code, 200)
        self.assertEqual([item["id"] for item in data["results"]], [self.bill.pk])


class BillQuestionApiTests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.bill = Bill.objects.create(
            id="qa-bill",
            title="Question Answer Bill",
            summary="A bill used to test question answering.",
            status=BillStatus.SECOND_READING,
            category="Finance",
            date_introduced=date(2026, 2, 20),
            is_hot=False,
            document_status="ready",
            document_text="This bill creates a new county fund and reporting obligations.",
            document_pages=[
                {
                    "pageNumber": 1,
                    "blocks": [{"type": "paragraph", "text": "This bill creates a new county fund and reporting obligations."}],
                }
            ],
        )

    def test_bill_ask_endpoint_returns_answer_and_excerpts(self):
        request = self.factory.post(
            f"/api/bills/{self.bill.pk}/ask/",
            {"question": "What new obligations does it create?"},
            format="json",
        )

        with patch("apps.legislative.views.answer_bill_question") as answer_mock:
            answer_mock.return_value = {
                "question": "What new obligations does it create?",
                "answer": "It creates a county fund and reporting obligations.",
                "excerpts": [{"pageNumber": 1, "text": "This bill creates a new county fund and reporting obligations.", "score": 0.98}],
            }
            response = BillViewSet.as_view({"post": "ask"})(request, pk=self.bill.pk)

        data = response_data(response)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(data["billId"], self.bill.pk)
        self.assertIn("reporting obligations", data["answer"])
        self.assertEqual(data["excerpts"][0]["pageNumber"], 1)


class PublicSubscriptionManagementApiTests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.bill = Bill.objects.create(
            id="watch-bill",
            title="County Watch Bill",
            summary="A bill used to test public subscription lookup and updates.",
            status=BillStatus.COMMITTEE,
            category="Environment",
            sponsor="Hon. Alice Wanjiku",
            date_introduced=date(2026, 2, 15),
            is_hot=True,
        )
        self.phone_number = "+254700000000"

        self.bill_subscription, _, _ = create_subscription(
            self.bill,
            self.phone_number,
            "sms",
            language=MessageLanguage.EN,
            cadence=SubscriptionFrequency.INSTANT,
        )
        self.county_subscription, _, _ = create_subscription(
            None,
            self.phone_number,
            "sms",
            scope=SubscriptionScope.COUNTY,
            target_value="Nairobi",
            language=MessageLanguage.EN,
            cadence=SubscriptionFrequency.DAILY,
            status=SubscriptionStatus.PAUSED,
        )
        self.unsubscribed_subscription, _, _ = create_subscription(
            None,
            self.phone_number,
            "sms",
            scope=SubscriptionScope.SPONSOR,
            target_value="Hon. Alice Wanjiku",
            language=MessageLanguage.EN,
            cadence=SubscriptionFrequency.WEEKLY,
            status=SubscriptionStatus.UNSUBSCRIBED,
        )

    def test_lookup_returns_active_and_paused_subscriptions_for_phone(self):
        request = self.factory.post(
            "/api/subscriptions/lookup/",
            {"phoneNumber": "0700 000 000"},
            format="json",
        )

        response = SubscriptionViewSet.as_view({"post": "lookup"})(request)
        data = response_data(response)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(data["phoneNumber"], self.phone_number)
        self.assertEqual(data["count"], 2)
        returned_ids = {item["id"] for item in data["subscriptions"]}
        self.assertIn(self.bill_subscription.pk, returned_ids)
        self.assertIn(self.county_subscription.pk, returned_ids)
        self.assertNotIn(self.unsubscribed_subscription.pk, returned_ids)

    def test_manage_updates_status_language_and_cadence_for_matching_phone(self):
        request = self.factory.post(
            f"/api/subscriptions/{self.bill_subscription.pk}/manage/",
            {
                "phoneNumber": self.phone_number,
                "status": SubscriptionStatus.PAUSED,
                "language": MessageLanguage.SW,
                "cadence": SubscriptionFrequency.WEEKLY,
            },
            format="json",
        )

        response = SubscriptionViewSet.as_view({"post": "manage"})(request, pk=self.bill_subscription.pk)
        data = response_data(response)

        self.assertEqual(response.status_code, 200)
        self.bill_subscription.refresh_from_db()
        self.assertEqual(self.bill_subscription.status, SubscriptionStatus.PAUSED)
        self.assertEqual(self.bill_subscription.language, MessageLanguage.SW)
        self.assertEqual(self.bill_subscription.cadence, SubscriptionFrequency.WEEKLY)
        self.assertEqual(data["status"], SubscriptionStatus.PAUSED)
        self.assertEqual(data["language"], MessageLanguage.SW)
        self.assertEqual(data["cadence"], SubscriptionFrequency.WEEKLY)

    def test_manage_rejects_mismatched_phone_numbers(self):
        request = self.factory.post(
            f"/api/subscriptions/{self.bill_subscription.pk}/manage/",
            {
                "phoneNumber": "+254711111111",
                "status": SubscriptionStatus.UNSUBSCRIBED,
            },
            format="json",
        )

        response = SubscriptionViewSet.as_view({"post": "manage"})(request, pk=self.bill_subscription.pk)

        self.assertEqual(response.status_code, 403)
        self.bill_subscription.refresh_from_db()
        self.assertEqual(self.bill_subscription.status, SubscriptionStatus.ACTIVE)


class RepresentativeVotingApiTests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.bill = Bill.objects.create(
            id="vote-bill",
            title="Vote Bill",
            summary="A bill used to test vote endpoints.",
            status=BillStatus.SECOND_READING,
            category="Justice",
            date_introduced=date(2026, 3, 1),
            is_hot=False,
        )
        self.mp = Representative.objects.create(
            id="hon-wanjiku",
            name="Hon. Alice Wanjiku",
            role="MP",
            constituency="Westlands",
            county="Nairobi",
            party="UDA",
            image_url="",
        )
        self.senator = Representative.objects.create(
            id="sen-kimani",
            name="Hon. Brian Kimani",
            role="Senator",
            constituency="Nairobi",
            county="Nairobi",
            party="ODM",
            image_url="",
        )
        RepresentativeVote.objects.create(representative=self.mp, bill=self.bill, vote=VoteChoice.YES)
        RepresentativeVote.objects.create(representative=self.senator, bill=self.bill, vote=VoteChoice.NO)

    def test_representative_list_filters_by_role_and_bill(self):
        request = self.factory.get("/api/representatives/", {"role": "MP", "billId": self.bill.pk})
        response = RepresentativeViewSet.as_view({"get": "list"})(request)
        data = response_data(response)

        self.assertEqual(response.status_code, 200)
        result_ids = [item["id"] for item in data["results"]]
        self.assertEqual(result_ids, [self.mp.id])

    def test_bill_votes_endpoint_filters_and_enriches_representatives(self):
        request = self.factory.get(f"/api/bills/{self.bill.pk}/votes/", {"vote": "Yes"})
        response = BillVotesAPIView.as_view()(request, bill_id=self.bill.pk)
        data = response_data(response)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(data["billId"], self.bill.pk)
        self.assertEqual(data["totalVotes"], 1)
        vote = data["votes"][0]
        self.assertEqual(vote["vote"], "Yes")
        self.assertEqual(vote["representative"]["role"], "MP")
        self.assertEqual(vote["representative"]["county"], "Nairobi")

    def test_bill_vote_summary_endpoint_aggregates_by_county_and_party(self):
        request = self.factory.get(f"/api/bills/{self.bill.pk}/votes/summary/")
        response = BillVoteSummaryAPIView.as_view()(request, bill_id=self.bill.pk)
        data = response_data(response)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(data["billId"], self.bill.pk)
        self.assertEqual(data["yes"], 1)
        self.assertEqual(data["no"], 1)
        self.assertEqual(data["abstain"], 0)
        self.assertEqual(data["byCounty"][0]["county"], "Nairobi")
        self.assertIn("UDA", data["byParty"])
        self.assertIn("ODM", data["byParty"])


class RepresentativeScraperParsingTests(TestCase):
    def test_views_row_title_attribute_is_used_for_name_and_constituency(self):
        html = """
            <html>
                <body>
                    <div class="views-row">
                        <div class="views-field views-field-title">
                            <a href="/member/hon-jane-doe" title="Hon. Jane Doe, Westlands, UDA">More Info</a>
                        </div>
                        <div class="views-field views-field-field-constituency">Westlands</div>
                        <div class="views-field views-field-field-party">UDA</div>
                        <div class="views-field views-field-field-status">Elected</div>
                    </div>
                </body>
            </html>
        """

        members = _parse_member_cards(html, base_url=MP_URL, role="MP")

        self.assertEqual(len(members), 1)
        self.assertEqual(members[0]["name"], "Hon. Jane Doe")
        self.assertEqual(members[0]["constituency"], "Westlands")
        self.assertEqual(members[0]["county"], "Nairobi")
        self.assertEqual(members[0]["party"], "UDA")

    def test_mp_scraper_falls_back_to_index_php_url_when_primary_404s(self):
        primary_url = MP_URL
        fallback_url = MP_URL_ALTERNATES[1]
        html = """
            <html>
                <body>
                    <div class="views-row">
                        <div class="views-field views-field-title">
                            <a href="/member/hon-jane-doe" title="Hon. Jane Doe, Westlands, UDA">More Info</a>
                        </div>
                        <div class="views-field views-field-field-constituency">Westlands</div>
                        <div class="views-field views-field-field-party">UDA</div>
                    </div>
                </body>
            </html>
        """

        parsed_members = [
            {
                "id": "hon-jane-doe",
                "name": "Hon. Jane Doe",
                "role": "MP",
                "constituency": "Westlands",
                "county": "Nairobi",
                "party": "UDA",
                "image_url": "",
            }
        ]

        def fetch_side_effect(url: str, timeout: int, progress=None):
            if url == primary_url:
                return [], [f"Failed to fetch {primary_url}: 404"]
            if url == fallback_url:
                return [(fallback_url, html)], []
            self.fail(f"Unexpected URL requested: {url}")

        with patch("representative_scrapers._fetch_all_pages", side_effect=fetch_side_effect) as fetch_mock:
            with patch("representative_scrapers._parse_member_cards", return_value=parsed_members):
                with patch(
                    "representative_scrapers._upsert_representatives",
                    return_value={
                        "created": 1,
                        "updated": 0,
                        "errors": [],
                        "processed": [{"id": "hon-jane-doe", "name": "Hon. Jane Doe", "action": "created"}],
                    },
                ):
                    summary = scrape_member_representatives(role="MP", timeout=1)

        self.assertEqual(summary["url"], fallback_url)
        self.assertEqual(summary["members_found"], 1)
        self.assertGreaterEqual(fetch_mock.call_count, 2)
        self.assertEqual(fetch_mock.call_args_list[0].args[0], primary_url)
        self.assertEqual(fetch_mock.call_args_list[1].args[0], fallback_url)


class UssdMenuTests(CommitCallbacksMixin, TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.bills = []
        for index in range(1, 7):
            self.bills.append(
                Bill.objects.create(
                    id=f"bill-{index}",
                    title=f"Very long parliamentary bill title number {index} that needs truncation",
                    summary="A short summary for testing USSD pagination.",
                    status=BillStatus.FIRST_READING,
                    category="Finance",
                    date_introduced=date(2026, 1, 1) + timedelta(days=index),
                    is_hot=False,
                )
            )

    def test_ussd_active_bills_returns_short_confirmation_and_sends_sms(self):
        request = self.factory.post(
            "/api/ussd/",
            {"sessionId": "ussd-active-bills", "text": "1", "phoneNumber": "+254700000000"},
            format="json",
        )

        with patch("apps.legislative.services.send_sms_reply") as send_sms_reply_mock:
            with self.capture_on_commit_callbacks(execute=True):
                response = UssdCallbackAPIView.as_view()(request)

        body = response.content.decode()
        self.assertIn("Active bills are being sent by SMS", body)
        send_sms_reply_mock.assert_called_once()
        message, recipients = send_sms_reply_mock.call_args.args[:2]
        self.assertIn("Bunge Mkononi active bills", message)
        self.assertIn("bill-", message)
        self.assertIn("STATUS", message)
        self.assertIn("TRACK", message)
        self.assertEqual(recipients, ["+254700000000"])
        self.assertEqual(send_sms_reply_mock.call_args.kwargs.get("link_id"), "")

    def test_ussd_featured_bill_returns_short_confirmation_and_sends_sms(self):
        request = self.factory.post(
            "/api/ussd/",
            {"sessionId": "ussd-featured-bill", "text": "2", "phoneNumber": "+254700000000"},
            format="json",
        )

        with patch("apps.legislative.services.send_sms_reply") as send_sms_reply_mock:
            with self.capture_on_commit_callbacks(execute=True):
                response = UssdCallbackAPIView.as_view()(request)

        body = response.content.decode()
        self.assertIn("Featured bill details are being sent by SMS", body)
        send_sms_reply_mock.assert_called_once()
        message, recipients = send_sms_reply_mock.call_args.args[:2]
        self.assertIn("Featured bill", message)
        self.assertIn("Bill ID: bill-", message)
        self.assertIn("TRACK bill-", message)
        self.assertEqual(recipients, ["+254700000000"])
        self.assertEqual(send_sms_reply_mock.call_args.kwargs.get("link_id"), "")

    def test_ussd_subscription_sends_confirmation_sms(self):
        bill = self.bills[0]

        with patch("apps.legislative.services.send_sms") as send_sms_mock:
            with self.capture_on_commit_callbacks(execute=True):
                subscription, created, reactivated = create_subscription(bill, "+254700000000", "ussd")

        self.assertTrue(created)
        self.assertFalse(reactivated)
        self.assertIsNotNone(subscription.bill)
        self.assertEqual(subscription.bill.pk, bill.pk)
        send_sms_mock.assert_called_once()
        message, recipients = send_sms_mock.call_args.args[:2]
        self.assertIn(bill.title, message)
        self.assertIn(f"STATUS {bill.id}", message)
        self.assertEqual(recipients, [subscription.phone_number])

    def test_ussd_follow_all_bills_creates_watchlist_subscription(self):
        request = self.factory.post("/api/ussd/", {"text": "3*5", "phoneNumber": "+254700000000"}, format="json")

        with patch("apps.legislative.services.send_sms") as send_sms_mock:
            with self.capture_on_commit_callbacks(execute=True):
                response = UssdCallbackAPIView.as_view()(request)

        body = response.content.decode()
        self.assertIn("SMS confirmation", body)
        subscription = Subscription.objects.get(phone_number="+254700000000", scope=SubscriptionScope.ALL)
        self.assertEqual(subscription.status, SubscriptionStatus.ACTIVE)
        self.assertEqual(subscription.target_value, "")
        send_sms_mock.assert_called_once()


class SmsWebhookTests(CommitCallbacksMixin, TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.bill = Bill.objects.create(
            id="sms-bill",
            title="SMS Bill",
            summary="A bill used to test SMS webhook idempotency.",
            status=BillStatus.FIRST_READING,
            category="Finance",
            date_introduced=date(2026, 4, 1),
            is_hot=False,
        )

    def test_sms_inbound_webhook_is_idempotent(self):
        payload = {"from": "+254700000000", "text": f"DOCUMENT {self.bill.pk}"}

        first_request = self.factory.post("/api/sms/inbound/", payload, format="json")
        second_request = self.factory.post("/api/sms/inbound/", payload, format="json")

        first_response = SmsInboundAPIView.as_view()(first_request)
        second_response = SmsInboundAPIView.as_view()(second_request)

        self.assertEqual(first_response.status_code, 200)
        self.assertEqual(first_response.content, second_response.content)
        self.assertIn("Bill ID: sms-bill", first_response.content.decode())

    def test_sms_inbound_webhook_queues_and_dispatches_reply_message(self):
        payload = {
            "from": "+254700000000",
            "text": f"STATUS {self.bill.pk}",
            "messageId": "msg-123",
            "linkId": "link-123",
        }
        reply_response = {
            "SMSMessageData": {
                "Message": "Sent to 1/1 Total Cost: KES 0.8000",
                "Recipients": [
                    {
                        "number": "+254700000000",
                        "messageId": "ATPid-inbound-reply",
                        "status": "Success",
                        "statusCode": 101,
                        "cost": "KES 0.8000",
                    }
                ],
            }
        }

        request = self.factory.post("/api/sms/inbound/", payload, format="json")
        with patch("apps.legislative.services.send_sms_reply", return_value=reply_response) as send_reply_mock:
            with self.capture_on_commit_callbacks(execute=True):
                response = SmsInboundAPIView.as_view()(request)

        self.assertEqual(response.status_code, 200)
        outbound = OutboundMessage.objects.get(message_type=OutboundMessageType.REPLY)
        self.assertEqual(outbound.status, OutboundMessageStatus.ACCEPTED)
        self.assertEqual(outbound.provider_message_id, "ATPid-inbound-reply")
        self.assertEqual(outbound.metadata.get("linkId"), "link-123")
        self.assertEqual(outbound.metadata.get("sourceCommand"), "status")
        send_reply_mock.assert_called_once_with(
            outbound.message,
            [outbound.recipient_phone_number],
            link_id="link-123",
        )


class OutboundMessageDispatchTests(TestCase):
    def setUp(self):
        self.bill = Bill.objects.create(
            id="dispatch-bill",
            title="Dispatch Bill",
            summary="A bill used to test outbound message state handling.",
            status=BillStatus.FIRST_READING,
            category="Finance",
            date_introduced=date(2026, 4, 2),
            is_hot=False,
        )

    def _queue_message(self) -> OutboundMessage:
        return queue_outbound_message(
            recipient_phone_number="+254700000000",
            message="Dispatch test message",
            message_type="broadcast",
            language=MessageLanguage.EN,
            bill=self.bill,
            dedupe_parts=[self.bill.pk, timezone.now().isoformat()],
            send_immediately=False,
        )

    def test_dispatch_persists_provider_acceptance_details(self):
        outbound = self._queue_message()
        response = {
            "SMSMessageData": {
                "Message": "Sent to 1/1 Total Cost: KES 0.8000",
                "Recipients": [
                    {
                        "number": outbound.recipient_phone_number,
                        "messageId": "ATPid-accepted",
                        "status": "Success",
                        "statusCode": 101,
                        "cost": "KES 0.8000",
                    }
                ],
            }
        }

        with patch("apps.legislative.services.send_sms", return_value=response):
            dispatch_outbound_message(outbound.pk)

        outbound.refresh_from_db()
        self.assertEqual(outbound.status, OutboundMessageStatus.ACCEPTED)
        self.assertEqual(outbound.provider_message_id, "ATPid-accepted")
        self.assertEqual(outbound.initial_provider_status, "Success")
        self.assertEqual(outbound.initial_provider_status_code, "101")
        self.assertEqual(outbound.initial_provider_message, "Sent to 1/1 Total Cost: KES 0.8000")
        self.assertEqual(outbound.last_error, "")

        log = SystemLog.objects.filter(event_type=LogEventType.MESSAGE_OUTBOUND).order_by("-created_at").first()
        self.assertIsNotNone(log)
        self.assertIn("accepted", str(log.message).lower())
        self.assertEqual(log.metadata.get("providerStatus"), "Success")
        self.assertEqual(log.metadata.get("providerStatusCode"), "101")

    def test_dispatch_surfaces_provider_rejection_reason(self):
        outbound = self._queue_message()
        response = {
            "SMSMessageData": {
                "Message": "Rejected by gateway",
                "Recipients": [
                    {
                        "number": outbound.recipient_phone_number,
                        "messageId": "",
                        "status": "Rejected by gateway",
                        "statusCode": 406,
                        "cost": "KES 0.0000",
                    }
                ],
            }
        }

        with patch("apps.legislative.services.send_sms", return_value=response):
            dispatch_outbound_message(outbound.pk)

        outbound.refresh_from_db()
        self.assertEqual(outbound.status, OutboundMessageStatus.FAILED)
        self.assertEqual(outbound.initial_provider_status, "Rejected by gateway")
        self.assertEqual(outbound.initial_provider_status_code, "406")
        self.assertIn("Rejected by gateway", outbound.last_error)
        self.assertIn("406", outbound.last_error)

        log = SystemLog.objects.filter(event_type=LogEventType.MESSAGE_OUTBOUND).order_by("-created_at").first()
        self.assertIsNotNone(log)
        self.assertIn("rejected", str(log.message).lower())
        self.assertEqual(log.metadata.get("error"), outbound.last_error)

    def test_reply_dispatch_uses_inbound_link_id(self):
        outbound = queue_outbound_message(
            recipient_phone_number="+254700000000",
            message="Reply test message",
            message_type=OutboundMessageType.REPLY,
            language=MessageLanguage.EN,
            bill=self.bill,
            dedupe_parts=[self.bill.pk, "reply-link"],
            metadata={"linkId": "reply-link"},
            send_immediately=False,
        )
        response = {
            "SMSMessageData": {
                "Message": "Sent to 1/1 Total Cost: KES 0.8000",
                "Recipients": [
                    {
                        "number": outbound.recipient_phone_number,
                        "messageId": "ATPid-reply",
                        "status": "Success",
                        "statusCode": 101,
                        "cost": "KES 0.8000",
                    }
                ],
            }
        }

        with patch("apps.legislative.services.send_sms_reply", return_value=response) as send_reply_mock:
            with patch("apps.legislative.services.send_sms") as send_sms_mock:
                dispatch_outbound_message(outbound.pk)

        outbound.refresh_from_db()
        self.assertEqual(outbound.status, OutboundMessageStatus.ACCEPTED)
        self.assertEqual(outbound.provider_message_id, "ATPid-reply")
        send_reply_mock.assert_called_once_with(
            outbound.message,
            [outbound.recipient_phone_number],
            link_id="reply-link",
        )
        send_sms_mock.assert_not_called()

    def test_reply_dispatch_uses_shortcode_path_for_ussd_followup(self):
        outbound = queue_outbound_message(
            recipient_phone_number="+254700000000",
            message="USSD follow-up message",
            message_type=OutboundMessageType.REPLY,
            language=MessageLanguage.EN,
            bill=self.bill,
            dedupe_parts=[self.bill.pk, "ussd-follow-up"],
            metadata={"sourceChannel": "ussd", "sourceContext": "active_bills"},
            send_immediately=False,
        )
        response = {
            "SMSMessageData": {
                "Message": "Sent to 1/1 Total Cost: KES 0.8000",
                "Recipients": [
                    {
                        "number": outbound.recipient_phone_number,
                        "messageId": "ATPid-ussd-followup",
                        "status": "Success",
                        "statusCode": 101,
                        "cost": "KES 0.8000",
                    }
                ],
            }
        }

        with patch("apps.legislative.services.send_sms_reply", return_value=response) as send_reply_mock:
            with patch("apps.legislative.services.send_sms") as send_sms_mock:
                dispatch_outbound_message(outbound.pk)

        outbound.refresh_from_db()
        self.assertEqual(outbound.status, OutboundMessageStatus.ACCEPTED)
        self.assertEqual(outbound.provider_message_id, "ATPid-ussd-followup")
        send_reply_mock.assert_called_once_with(
            outbound.message,
            [outbound.recipient_phone_number],
            link_id="",
        )
        send_sms_mock.assert_not_called()

    def test_delivery_report_keeps_sent_pending_until_final_delivery(self):
        outbound = self._queue_message()
        response = {
            "SMSMessageData": {
                "Message": "Sent to 1/1 Total Cost: KES 0.8000",
                "Recipients": [
                    {
                        "number": outbound.recipient_phone_number,
                        "messageId": "ATPid-pending",
                        "status": "Success",
                        "statusCode": 101,
                        "cost": "KES 0.8000",
                    }
                ],
            }
        }

        with patch("apps.legislative.services.send_sms", return_value=response):
            dispatch_outbound_message(outbound.pk)

        record_sms_delivery_report(
            {
                "messageId": "ATPid-pending",
                "phoneNumber": outbound.recipient_phone_number,
                "status": "Sent",
                "statusCode": "102",
            }
        )
        outbound.refresh_from_db()
        self.assertEqual(outbound.status, OutboundMessageStatus.ACCEPTED)
        self.assertEqual(outbound.delivery_status, "Sent")
        self.assertEqual(outbound.delivery_status_code, "102")

        record_sms_delivery_report(
            {
                "messageId": "ATPid-pending",
                "phoneNumber": outbound.recipient_phone_number,
                "status": "Delivered",
                "statusCode": "103",
            }
        )
        outbound.refresh_from_db()
        self.assertEqual(outbound.status, OutboundMessageStatus.SENT)
        self.assertEqual(outbound.delivery_status, "Delivered")
        self.assertEqual(outbound.delivery_status_code, "103")
        self.assertEqual(outbound.last_error, "")

    def test_delivery_report_surfaces_exact_failure_reason(self):
        outbound = self._queue_message()
        response = {
            "SMSMessageData": {
                "Message": "Sent to 1/1 Total Cost: KES 0.8000",
                "Recipients": [
                    {
                        "number": outbound.recipient_phone_number,
                        "messageId": "ATPid-failure",
                        "status": "Success",
                        "statusCode": 101,
                        "cost": "KES 0.8000",
                    }
                ],
            }
        }

        with patch("apps.legislative.services.send_sms", return_value=response):
            dispatch_outbound_message(outbound.pk)

        record_sms_delivery_report(
            {
                "messageId": "ATPid-failure",
                "phoneNumber": outbound.recipient_phone_number,
                "status": "Failed",
                "statusCode": "500",
                "failureReason": "User in blacklist",
            }
        )

        outbound.refresh_from_db()
        self.assertEqual(outbound.status, OutboundMessageStatus.UNDELIVERED)
        self.assertEqual(outbound.delivery_status, "Failed")
        self.assertEqual(outbound.delivery_status_code, "500")
        self.assertIn("User in blacklist", outbound.last_error)
        self.assertIn("500", outbound.last_error)
