
import base64
from datetime import datetime

import requests
from django.conf import settings
from django.utils import timezone


class MpesaRequestError(Exception):
    pass


def get_mpesa_base_url():
    environment = settings.MPESA_ENVIRONMENT.lower()

    if environment == "sandbox":
        return "https://sandbox.safaricom.co.ke"

    if environment == "production":
        return "https://api.safaricom.co.ke"

    raise ValueError("Invalid MPESA_ENVIRONMENT setting.")


def normalize_mpesa_phone(phone):
    phone = "".join(char for char in str(phone) if char.isdigit())

    if phone.startswith("0") and len(phone) == 10:
        phone = "254" + phone[1:]
    elif phone.startswith("7") or phone.startswith("1"):
        if len(phone) == 9:
            phone = "254" + phone
    elif len(phone) == 12 and phone.startswith("254"):
        pass
    else:
        raise ValueError("Enter a valid Kenyan M-Pesa phone number.")

    if len(phone) != 12 or not phone.startswith("254"):
        raise ValueError("Enter a valid Kenyan M-Pesa phone number.")

    return phone


def get_mpesa_access_token():
    required = [
        settings.MPESA_CONSUMER_KEY,
        settings.MPESA_CONSUMER_SECRET,
    ]

    if not all(required):
        raise ValueError("Daraja Consumer Key or Secret is missing.")

    url = (
        f"{get_mpesa_base_url()}"
        "/oauth/v1/generate?grant_type=client_credentials"
    )

    response = requests.get(
        url,
        auth=(
            settings.MPESA_CONSUMER_KEY,
            settings.MPESA_CONSUMER_SECRET,
        ),
        timeout=30,
    )
    response.raise_for_status()

    token = response.json().get("access_token")

    if not token:
        raise ValueError("Daraja did not return an access token.")

    return token


def initiate_stk_push(*, phone, amount, account_reference):
    if not all([
        settings.MPESA_SHORTCODE,
        settings.MPESA_PASSKEY,
        settings.MPESA_CALLBACK_URL,
    ]):
        raise ValueError("Daraja shortcode, passkey or callback URL is missing.")

    timestamp = timezone.localtime().strftime("%Y%m%d%H%M%S")

    password_string = (
        f"{settings.MPESA_SHORTCODE}"
        f"{settings.MPESA_PASSKEY}"
        f"{timestamp}"
    )

    password = base64.b64encode(
        password_string.encode("utf-8")
    ).decode("utf-8")

    token = get_mpesa_access_token()

    payload = {
        "BusinessShortCode": settings.MPESA_SHORTCODE,
        "Password": password,
        "Timestamp": timestamp,
        "TransactionType": settings.MPESA_TRANSACTION_TYPE,
        "Amount": int(amount),
        "PartyA": phone,
        "PartyB": settings.MPESA_SHORTCODE,
        "PhoneNumber": phone,
        "CallBackURL": settings.MPESA_CALLBACK_URL,
        "AccountReference": account_reference[:12],
        "TransactionDesc": "Electronics POS payment",
    }

    url = (
        f"{get_mpesa_base_url()}"
        "/mpesa/stkpush/v1/processrequest"
    )

    try:
        response = requests.post(
            url,
            json=payload,
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
            timeout=30,
        )
    except requests.RequestException as exc:
        raise MpesaRequestError(
            "Could not connect to Daraja STK Push service."
        ) from exc

    try:
        result = response.json()
    except ValueError as exc:
        if not response.ok:
            raise MpesaRequestError(
                "Daraja rejected the STK Push request "
                f"(HTTP {response.status_code}) without a JSON error response."
            ) from exc
        raise MpesaRequestError(
            "Daraja returned an invalid STK Push response."
        ) from exc

    if not isinstance(result, dict):
        raise MpesaRequestError(
            "Daraja returned an invalid STK Push response."
        )

    if not response.ok:
        error_code = result.get("errorCode", "")
        error_message = result.get("errorMessage", "")
        details = ": ".join(
            value for value in (error_code, error_message) if value
        )
        raise MpesaRequestError(
            f"Daraja rejected the STK Push request "
            f"(HTTP {response.status_code})"
            + (f": {details}" if details else ".")
        )

    return result
