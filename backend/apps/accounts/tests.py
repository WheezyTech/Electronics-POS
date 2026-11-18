from types import SimpleNamespace
from unittest.mock import patch

from django.test import SimpleTestCase

from .serializers import CustomTokenObtainPairSerializer


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
