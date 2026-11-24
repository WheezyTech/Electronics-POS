import hashlib
import json
import secrets
from datetime import timedelta
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.utils import timezone


PHONE_OTP_EXPIRY = timedelta(minutes=5)
PHONE_RESEND_COOLDOWN = timedelta(seconds=60)
PHONE_MAX_ATTEMPTS = 5


def normalize_kenyan_phone(phone):
    digits = "".join(char for char in (phone or "") if char.isdigit())
    if digits.startswith("254") and len(digits) == 12:
        return f"+{digits}"
    if digits.startswith("0") and len(digits) == 10:
        return f"+254{digits[1:]}"
    if len(digits) == 9:
        return f"+254{digits}"
    raise ValueError(
        "Enter a valid Kenyan phone number, for example 0712345678 or +254712345678."
    )


def generate_phone_otp():
    return f"{secrets.randbelow(900000) + 100000}"


def hash_phone_otp(otp):
    return hashlib.sha256(str(otp).encode("utf-8")).hexdigest()


def send_phone_otp_sms(phone, otp):
    username = getattr(settings, "AFRICASTALKING_USERNAME", "")
    api_key = getattr(settings, "AFRICASTALKING_API_KEY", "")
    sender_id = getattr(settings, "AFRICASTALKING_SENDER_ID", "")

    if not username or not api_key:
        raise ImproperlyConfigured(
            "Africa's Talking credentials are missing from environment variables."
        )

    payload = {
        "username": username,
        "to": phone,
        "message": (
            f"Your Electronics POS phone verification OTP is {otp}. "
            "It expires in 5 minutes."
        ),
    }
    if sender_id:
        payload["from"] = sender_id

    request = Request(
        "https://api.africastalking.com/version1/messaging",
        data=urlencode(payload).encode("utf-8"),
        headers={
            "Accept": "application/json",
            "apiKey": api_key,
            "Content-Type": "application/x-www-form-urlencoded",
        },
        method="POST",
    )

    try:
        with urlopen(request, timeout=30) as response:
            result = json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        details = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(
            f"Africa's Talking SMS delivery failed: {details}"
        ) from error
    except URLError as error:
        raise RuntimeError(
            f"Could not connect to Africa's Talking: {error.reason}"
        ) from error

    recipients = (
        result.get("SMSMessageData", {}).get("Recipients", [])
        if isinstance(result, dict)
        else []
    )
    if not recipients:
        raise RuntimeError("Africa's Talking returned no SMS recipient result.")

    failed_statuses = {"Failed", "Rejected", "Invalid"}
    if any(recipient.get("status") in failed_statuses for recipient in recipients):
        raise RuntimeError("Africa's Talking rejected the SMS recipient.")
    return result
