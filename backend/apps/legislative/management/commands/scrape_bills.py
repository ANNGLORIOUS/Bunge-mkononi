"""
Django management command for scraping parliament bills.
"""

from django.core.management.base import BaseCommand, CommandError

from apps.legislative.scrapers import (
    DEFAULT_PARLIAMENT_URL,
    DEFAULT_TIMEOUT,
    fetch_bill_pages,
    parse_bill_pages,
    scrape_parliament_bills,
)


class Command(BaseCommand):
    help = "Scrape bills from the Kenyan Parliament website and upsert them into the database."

    def add_arguments(self, parser):
        parser.add_argument(
            "--url",
            default=DEFAULT_PARLIAMENT_URL,
            help=f"Parliament bills page URL (default: {DEFAULT_PARLIAMENT_URL})",
        )
        parser.add_argument(
            "--timeout",
            type=int,
            default=DEFAULT_TIMEOUT,
            help=f"HTTP request timeout in seconds (default: {DEFAULT_TIMEOUT})",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            default=False,
            help="Parse and print bills without writing to the database.",
        )

    def handle(self, *args, **options):
        url = options["url"]
        timeout = options["timeout"]
        dry_run = options["dry_run"]

        self.stdout.write(self.style.MIGRATE_HEADING(f"Scraping bills from: {url}"))

        if dry_run:
            self.stdout.write(self.style.WARNING("DRY RUN - no database writes."))
            try:
                pages, fetch_errors = fetch_bill_pages(url, timeout=timeout)
                bills = parse_bill_pages(pages)
            except Exception as exc:  # noqa: BLE001
                raise CommandError(f"Scrape failed: {exc}") from exc

            if not pages:
                raise CommandError(f"Scrape failed: unable to fetch any pages from {url}")

            self.stdout.write(self.style.SUCCESS(f"Fetched {len(pages)} page(s)."))

            if fetch_errors:
                self.stdout.write(self.style.WARNING(f"Encountered {len(fetch_errors)} page fetch warning(s):"))
                for err in fetch_errors:
                    self.stdout.write(self.style.WARNING(f"  {err}"))

            if not bills:
                self.stdout.write(self.style.WARNING("No bills found on the page."))
                return

            self.stdout.write(f"Found {len(bills)} bill(s) across {len(pages)} page(s):\n")
            for bill in bills:
                self.stdout.write(
                    f"  [{bill['status']:20s}] {bill['title'][:60]}  - {bill.get('sponsor', '?')}"
                )
            return

        try:
            summary = scrape_parliament_bills(url=url, timeout=timeout)
        except Exception as exc:  # noqa: BLE001
            raise CommandError(f"Scrape failed: {exc}") from exc

        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS(f"bills found on page : {summary['bills_found']}"))
        pages_fetched = summary.get("pages_fetched")
        if pages_fetched is not None:
            self.stdout.write(self.style.SUCCESS(f"pages fetched       : {pages_fetched}"))
        self.stdout.write(self.style.SUCCESS(f"created             : {summary['created']}"))
        self.stdout.write(self.style.SUCCESS(f"updated             : {summary['updated']}"))

        processed_bills = summary.get("processed_bills", [])
        if processed_bills:
            self.stdout.write(self.style.SUCCESS("processed bills:"))
            for bill in processed_bills:
                sponsor = bill.get("sponsor", "")
                sponsor_suffix = f" - {sponsor}" if sponsor else ""
                self.stdout.write(
                    self.style.SUCCESS(
                        f"    [{bill['action']:8s}] {bill['title']}{sponsor_suffix}"
                    )
                )

        if summary["errors"]:
            self.stdout.write(self.style.ERROR(f"errors ({len(summary['errors'])}):"))
            for err in summary["errors"]:
                self.stdout.write(self.style.ERROR(f"    {err}"))
        else:
            self.stdout.write(self.style.SUCCESS("no errors"))
