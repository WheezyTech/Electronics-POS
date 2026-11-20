
import uuid

from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):

    class Role(models.TextChoices):
        ADMINISTRATOR = "ADMINISTRATOR", "Administrator"
        ACCOUNTANT = "ACCOUNTANT", "Accountant"
        AUDITOR = "AUDITOR", "Auditor"
        CASHIER = "CASHIER", "Cashier"
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

    created_at = models.DateTimeField(auto_now_add=True)

    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.username} - {self.get_role_display()}"


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
