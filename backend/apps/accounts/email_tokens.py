from django.contrib.auth.tokens import PasswordResetTokenGenerator
from django.conf import settings
from django.core.mail import send_mail
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


def send_email_verification(user):
    token = email_verification_token.make_token(user)
    link = _account_link(user, "verify-email", token)
    send_mail(
        "Verify your Electronics POS email",
        f"Hello {user.username},\n\n"
        f"Verify your email address using this link:\n{link}\n\n"
        "If you did not expect this message, contact your administrator.",
        settings.DEFAULT_FROM_EMAIL,
        [user.email],
        fail_silently=False,
    )


def send_password_reset(user):
    from django.contrib.auth.tokens import default_token_generator

    token = default_token_generator.make_token(user)
    link = _account_link(user, "reset-password", token)
    send_mail(
        "Reset your Electronics POS password",
        f"Hello {user.username},\n\n"
        f"Reset your password using this link:\n{link}\n\n"
        "If you did not request a reset, you can ignore this message.",
        settings.DEFAULT_FROM_EMAIL,
        [user.email],
        fail_silently=False,
    )
