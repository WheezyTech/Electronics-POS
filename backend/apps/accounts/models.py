
import uuid

from django.conf import settings
from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):

    class Role(models.TextChoices):
        ADMINISTRATOR = "ADMINISTRATOR", "Administrator"
        ACCOUNTANT = "ACCOUNTANT", "Accountant"
        AUDITOR = "AUDITOR", "Auditor"
        CASHIER = "CASHIER", "Cashier"
        ELECTRONICS_CASHIER = "ELECTRONICS_CASHIER", "Electronics Cashier"
        GAS_LPG_CASHIER = "GAS_LPG_CASHIER", "Gas & LPG Cashier"
        SUPERVISOR = "SUPERVISOR", "Supervisor"
        STORE_MANAGER = "STORE_MANAGER", "Store Manager"

    role = models.CharField(
        max_length=30,
        choices=Role.choices,
        default=Role.CASHIER
    )

    phone_number = models.CharField(
        max_length=20,
        blank=True,
        null=True
    )

    email = models.EmailField(
        unique=True
    )

    email_verified = models.BooleanField(default=False)
    email_verification_otp = models.CharField(
        max_length=6,
        blank=True,
        default=""
    )
    email_verification_otp_expires_at = models.DateTimeField(
        null=True,
        blank=True
    )
    phone_verified = models.BooleanField(default=False)
    phone_verification_otp_hash = models.CharField(
        max_length=64,
        blank=True,
        default=""
    )
    phone_verification_otp_expires_at = models.DateTimeField(
        null=True,
        blank=True
    )
    phone_verification_last_sent_at = models.DateTimeField(
        null=True,
        blank=True
    )
    phone_verification_attempts = models.PositiveSmallIntegerField(default=0)

    created_at = models.DateTimeField(auto_now_add=True)

    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.username} - {self.get_role_display()}"


class AccountVerificationAudit(models.Model):
    class Action(models.TextChoices):
        PHONE_OTP_SENT = "PHONE_OTP_SENT", "Phone OTP sent"
        PHONE_OTP_VERIFIED = "PHONE_OTP_VERIFIED", "Phone OTP verified"
        PHONE_OTP_FAILED = "PHONE_OTP_FAILED", "Phone OTP failed"
        PHONE_MANUAL_APPROVED = "PHONE_MANUAL_APPROVED", "Phone manually approved"

    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="verification_audits",
    )
    action = models.CharField(max_length=30, choices=Action.choices)
    details = models.CharField(max_length=255, blank=True, default="")
    performed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="performed_verification_audits",
    )
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.user_id} - {self.action}"


class Device(models.Model):

    class Platform(models.TextChoices):
        WEB = "WEB", "Web"
        DESKTOP = "DESKTOP", "Desktop"
        ANDROID = "ANDROID", "Android"

    sync_id = models.UUIDField(
        default=uuid.uuid4,
        unique=True,
        editable=False
    )

    name = models.CharField(max_length=100)
    platform = models.CharField(max_length=20, choices=Platform.choices)
    registered_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        related_name="registered_devices",
        null=True,
        blank=True,
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    last_seen_at = models.DateTimeField(null=True, blank=True)
    deactivated_at = models.DateTimeField(null=True, blank=True)
    deactivated_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        related_name="deactivated_devices",
        null=True,
        blank=True,
    )

    class Meta:
        ordering = ["name", "created_at"]

    def __str__(self):
        return f"{self.name} ({self.platform})"


class OfflineAuthorization(models.Model):

    class Operation(models.TextChoices):
        CASH_SALE = "CASH_SALE", "Offline cash sale"

    user = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name="offline_authorizations",
    )
    device = models.ForeignKey(
        Device,
        on_delete=models.PROTECT,
        related_name="offline_authorizations",
    )
    operation = models.CharField(max_length=30, choices=Operation.choices)
    authorized_by = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name="issued_offline_authorizations",
    )
    granted_at = models.DateTimeField()
    expires_at = models.DateTimeField()
    revoked_at = models.DateTimeField(null=True, blank=True)
    revoked_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        related_name="revoked_offline_authorizations",
        null=True,
        blank=True,
    )

    class Meta:
        ordering = ["-granted_at"]

    def permits(self, *, user, device_sync_id, operation, occurred_at):
        return (
            self.user_id == user.pk
            and str(self.device.sync_id) == str(device_sync_id)
            and self.operation == operation
            and self.granted_at <= occurred_at < self.expires_at
            and (
                self.revoked_at is None
                or occurred_at < self.revoked_at
            )
        )

    def __str__(self):
        return f"{self.user} - {self.device} - {self.operation}"
