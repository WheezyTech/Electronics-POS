
import json
import random
from datetime import timedelta
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

from django.conf import settings
from django.contrib.auth.tokens import PasswordResetTokenGenerator
from django.core.exceptions import ImproperlyConfigured
from django.template.loader import render_to_string
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


def _send_resend_email(subject, message, recipient, html_message=None):
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
    if html_message:
        payload["html"] = html_message

    request = Request(
        "https://api.resend.com/emails",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "User-Agent": "ElectronicsPOS/1.0",
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


def _render_email(template_name, context):
    return (
        render_to_string(f"emails/{template_name}.txt", context),
        render_to_string(f"emails/{template_name}.html", context),
    )


def send_email_verification(user):
    from django.utils import timezone

    otp = f"{random.SystemRandom().randint(100000, 999999)}"
    user.email_verification_otp = otp
    user.email_verification_otp_expires_at = (
        timezone.now() + timedelta(minutes=30)
    )
    user.save(update_fields=[
        "email_verification_otp",
        "email_verification_otp_expires_at",
    ])

    token = email_verification_token.make_token(user)
    link = _account_link(user, "verify-email", token)
    context = {
        "username": user.username,
        "action_url": link,
        "action_label": "Verify my email",
        "otp": otp,
        "expiry_note": "This verification code expires in 30 minutes.",
        "security_note": (
            "If you did not expect this message, contact your administrator."
        ),
    }
    message, html_message = _render_email("email_verification", context)

    return _send_resend_email(
        "Verify your Electronics POS email",
        message,
        user.email,
        html_message=html_message,
    )


def send_password_reset(user):
    from django.contrib.auth.tokens import default_token_generator

    token = default_token_generator.make_token(user)
    link = _account_link(user, "reset-password", token)
    expiry_hours = max(settings.PASSWORD_RESET_TIMEOUT // 3600, 1)
    context = {
        "username": user.username,
        "action_url": link,
        "action_label": "Reset my password",
        "expiry_note": (
            f"For your security, this link expires in {expiry_hours} hours."
        ),
        "security_note": (
            "If you did not request this password reset, you can safely "
            "ignore this email. Your account remains secure."
        ),
    }
    message, html_message = _render_email("password_reset", context)

    return _send_resend_email(
        "Reset your Electronics POS password",
        message,
        user.email,
        html_message=html_message,
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
