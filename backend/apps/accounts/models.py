
from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):

    class Role(models.TextChoices):
        ADMINISTRATOR = "ADMINISTRATOR", "Administrator"
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

    created_at = models.DateTimeField(auto_now_add=True)

    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.username} - {self.get_role_display()}"
