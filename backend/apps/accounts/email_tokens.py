
import json
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

from django.conf import settings
from django.contrib.auth.tokens import PasswordResetTokenGenerator
from django.core.exceptions import ImproperlyConfigured
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode


class EmailVerificationTokenGenerator(PasswordResetTokenGenerator):
    def _make_hash_value(self, user, timestamp):
        return (
            f"{super()._make_hash_value(user, timestamp)}"
            f"{user.email_verified}"
        )


email_verification_token = EmailVerificationTokenGenerator()


def _account_link(user, route, token):
    uid = urlsafe_base64_encode(force_bytes(user.pk))
    return (
        f"{settings.FRONTEND_URL}/{route}"
        f"?uid={uid}&token={token}"
    )


def _send_resend_email(subject, message, recipient):
    api_key = getattr(settings, "RESEND_API_KEY", "")

    if not api_key:
        raise ImproperlyConfigured(
            "RESEND_API_KEY is missing from environment variables."
        )

    payload = {
        "from": settings.DEFAULT_FROM_EMAIL,
        "to": [recipient],
        "subject": subject,
        "text": message,
    }

    request = Request(
        "https://api.resend.com/emails",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urlopen(request, timeout=30) as response:
            result = json.loads(response.read().decode("utf-8"))
            return result

    except HTTPError as error:
        error_details = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(
            f"Resend email delivery failed: {error_details}"
        ) from error

    except URLError as error:
        raise RuntimeError(
            f"Could not connect to Resend: {error.reason}"
        ) from error


def send_email_verification(user):
    token = email_verification_token.make_token(user)
    link = _account_link(user, "verify-email", token)

    message = (
        f"Hello {user.username},\n\n"
        f"Verify your email address using this link:\n{link}\n\n"
        "If you did not expect this message, contact your administrator."
    )

    return _send_resend_email(
        "Verify your Electronics POS email",
        message,
        user.email,
    )


def send_password_reset(user):
    from django.contrib.auth.tokens import default_token_generator

    token = default_token_generator.make_token(user)
    link = _account_link(user, "reset-password", token)

    message = (
        f"Hello {user.username},\n\n"
        f"Reset your password using this link:\n{link}\n\n"
        "If you did not request a reset, you can ignore this message."
    )

    return _send_resend_email(
        "Reset your Electronics POS password",
        message,
        user.email,
    )


def send_contact_message(*, name, email, phone, subject, message):
    recipient = getattr(settings, "CONTACT_TO_EMAIL", "")
    if not recipient:
        raise ImproperlyConfigured(
            "CONTACT_TO_EMAIL is missing from environment variables."
        )

    body = (
        f"Name: {name}\n"
        f"Email: {email}\n"
        f"Phone: {phone or 'Not provided'}\n"
        f"Subject: {subject}\n\n"
        f"{message}"
    )
    return _send_resend_email(
        f"Electronics POS website: {subject}",
        body,
        recipient,
    )
