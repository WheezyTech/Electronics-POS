from types import SimpleNamespace
from unittest.mock import patch

from django.test import SimpleTestCase
from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from .serializers import CustomTokenObtainPairSerializer

User = get_user_model()


class CustomTokenObtainPairSerializerTests(SimpleTestCase):
    def setUp(self):
        self.user = SimpleNamespace(
            id=1,
            username="cashier",
            email="cashier@example.com",
            role="CASHIER",
            first_name="",
            last_name="",
            phone_number="",
            is_staff=False,
            is_superuser=False,
            is_active=True,
        )

    def test_authenticates_with_email(self):
        with (
            patch("apps.accounts.serializers.User.objects.filter") as find_user,
            patch(
                "rest_framework_simplejwt.serializers.authenticate",
                return_value=self.user,
            ),
        ):
            find_user.return_value.values_list.return_value.first.return_value = (
                self.user.username
            )
            serializer = CustomTokenObtainPairSerializer(data={
                "email": "CASHIER@example.com",
                "password": "SecurePassword123!",
            })

            self.assertTrue(serializer.is_valid(), serializer.errors)
            self.assertEqual(
                serializer.validated_data["user"]["id"],
                self.user.id,
            )

    def test_keeps_username_login_compatibility(self):
        with patch(
            "rest_framework_simplejwt.serializers.authenticate",
            return_value=self.user,
        ):
            serializer = CustomTokenObtainPairSerializer(data={
                "username": "cashier",
                "password": "SecurePassword123!",
            })

            self.assertTrue(serializer.is_valid(), serializer.errors)
            self.assertEqual(
                serializer.validated_data["user"]["id"],
                self.user.id,
            )


class StoreManagerUserManagementTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.manager = User.objects.create_user(
            username="manager",
            email="manager@example.com",
            password="Secure-manager-password-928!",
            role=User.Role.STORE_MANAGER,
        )
        self.client.force_authenticate(user=self.manager)

    def test_manager_can_register_cashier(self):
        response = self.client.post(
            reverse("users-list"),
            {
                "username": "new-cashier",
                "email": "cashier@example.com",
                "password": "Secure-cashier-password-928!",
                "role": User.Role.CASHIER,
            },
        )

        self.assertEqual(response.status_code, 201)
        cashier = User.objects.get(username="new-cashier")
        self.assertEqual(cashier.role, User.Role.CASHIER)
        self.assertFalse(cashier.is_staff)
        self.assertTrue(cashier.check_password("Secure-cashier-password-928!"))

    def test_manager_cannot_register_privileged_role(self):
        response = self.client.post(
            reverse("users-list"),
            {
                "username": "new-manager",
                "email": "new-manager@example.com",
                "password": "Secure-new-manager-password-928!",
                "role": User.Role.STORE_MANAGER,
            },
        )

        self.assertEqual(response.status_code, 400)
        self.assertFalse(User.objects.filter(username="new-manager").exists())

    def test_manager_list_only_includes_cashiers(self):
        User.objects.create_user(
            username="cashier",
            email="cashier@example.com",
            password="Secure-cashier-password-928!",
            role=User.Role.CASHIER,
        )

        response = self.client.get(reverse("users-list"))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            [user["role"] for user in response.data],
            [User.Role.CASHIER],
        )

    def test_manager_cannot_update_cashier(self):
        cashier = User.objects.create_user(
            username="cashier",
            email="cashier@example.com",
            password="Secure-cashier-password-928!",
            role=User.Role.CASHIER,
        )

        response = self.client.patch(
            reverse("users-detail", args=[cashier.pk]),
            {"first_name": "Updated"},
        )

        self.assertEqual(response.status_code, 403)

    def test_manager_and_cashier_can_load_their_own_profile(self):
        cashier = User.objects.create_user(
            username="cashier",
            email="cashier@example.com",
            password="Secure-cashier-password-928!",
            role=User.Role.CASHIER,
        )

        for user in (self.manager, cashier):
            with self.subTest(role=user.role):
                self.client.force_authenticate(user=user)
                response = self.client.get(reverse("users-me"))

                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.data["role"], user.role)
