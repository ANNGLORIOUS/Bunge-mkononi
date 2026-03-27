from __future__ import annotations

from functools import lru_cache
from typing import Any
import warnings

from django.conf import settings


class AfricaTalkingError(RuntimeError):
    pass


class AfricaTalkingConfigurationError(AfricaTalkingError):
    pass


@lru_cache(maxsize=1)
def _get_sms_service():
    try:
        import africastalking
    except ImportError as exc:  # pragma: no cover - handled in runtime checks
        raise AfricaTalkingConfigurationError(
            "Africa's Talking SDK is not installed. Run `pip install -r backend/requirements.txt`."
        ) from exc

    username = getattr(settings, "AFRICASTALKING_USERNAME", "").strip()
    api_key = getattr(settings, "AFRICASTALKING_API_KEY", "").strip()

    if not username or not api_key:
        raise AfricaTalkingConfigurationError("Africa's Talking credentials are not configured.")

    with warnings.catch_warnings():
        warnings.filterwarnings(
            "ignore",
            message="Sandbox is currently not available for the Whatsapp service.",
            category=UserWarning,
            module=r"africastalking\.Whatsapp",
        )
        africastalking.initialize(username, api_key)
    return africastalking.SMS


def send_sms(message: str, recipients: list[str], *, sender_id: str | None = None, enqueue: bool = True) -> dict[str, Any]:
    recipients = [recipient.strip() for recipient in recipients if recipient and recipient.strip()]
    if not recipients:
        raise AfricaTalkingError("No SMS recipients were provided.")

    if not message.strip():
        raise AfricaTalkingError("SMS message cannot be empty.")

    sms = _get_sms_service()

    try:
        sender_id = (sender_id or getattr(settings, "AFRICASTALKING_SENDER_ID", "")).strip()
        send_kwargs: dict[str, Any] = {"enqueue": enqueue}
        if sender_id:
            send_kwargs["sender_id"] = sender_id
        response = sms.send(message, recipients, **send_kwargs)
    except Exception as exc:  # noqa: BLE001
        raise AfricaTalkingError(str(exc)) from exc

    if not response:
        raise AfricaTalkingError("Africa's Talking returned an empty SMS response.")

    return response


def send_sms_reply(
    message: str,
    recipients: list[str],
    *,
    link_id: str,
    short_code: str | None = None,
) -> dict[str, Any]:
    recipients = [recipient.strip() for recipient in recipients if recipient and recipient.strip()]
    if not recipients:
        raise AfricaTalkingError("No SMS recipients were provided.")

    if not message.strip():
        raise AfricaTalkingError("SMS message cannot be empty.")

    link_id = str(link_id or "").strip()
    if not link_id:
        raise AfricaTalkingError("Inbound SMS replies require a valid linkId.")

    sms = _get_sms_service()
    short_code = (
        short_code
        or getattr(settings, "AFRICASTALKING_SHORT_CODE", "")
        or getattr(settings, "AFRICASTALKING_SENDER_ID", "")
    ).strip()
    if not short_code:
        raise AfricaTalkingConfigurationError(
            "Africa's Talking inbound replies require AFRICASTALKING_SHORT_CODE or AFRICASTALKING_SENDER_ID."
        )

    try:
        try:
            response = sms.send_premium(message, short_code, recipients, link_id=link_id)
        except TypeError:
            response = sms.send_premium(message, short_code, recipients, link_id)
    except Exception as exc:  # noqa: BLE001
        raise AfricaTalkingError(str(exc)) from exc

    if not response:
        raise AfricaTalkingError("Africa's Talking returned an empty SMS reply response.")

    return response


def summarize_sms_response(response: Any) -> dict[str, Any]:
    summary = {
        "provider": "africastalking",
        "providerMessage": "",
        "recipientCount": 0,
        "successfulCount": 0,
        "failedCount": 0,
        "recipients": [],
    }

    if not isinstance(response, dict):
        return summary

    sms_data = response.get("SMSMessageData")
    if not isinstance(sms_data, dict):
        return summary

    summary["providerMessage"] = str(sms_data.get("Message") or "")
    recipients = sms_data.get("Recipients")
    if not isinstance(recipients, list):
        return summary

    summary["recipientCount"] = len(recipients)
    successful = 0
    normalized_recipients: list[dict[str, Any]] = []
    for recipient in recipients:
        if isinstance(recipient, dict):
            status = str(recipient.get("status") or "")
            normalized_recipients.append(
                {
                    "number": str(recipient.get("number") or recipient.get("phoneNumber") or ""),
                    "messageId": str(recipient.get("messageId") or recipient.get("message_id") or ""),
                    "status": status,
                    "statusCode": recipient.get("statusCode"),
                    "cost": str(recipient.get("cost") or ""),
                }
            )
            if status.lower() == "success":
                successful += 1
        else:
            normalized_recipients.append(
                {
                    "number": "",
                    "messageId": "",
                    "status": "",
                    "statusCode": None,
                    "cost": "",
                }
            )

    summary["successfulCount"] = successful
    summary["failedCount"] = max(len(recipients) - successful, 0)
    summary["recipients"] = normalized_recipients
    return summary
