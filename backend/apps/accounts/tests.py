import uuid
from datetime import timedelta
from urllib.parse import parse_qs, urlparse
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core import mail
from django.contrib.auth.tokens import default_token_generator
from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken, RefreshToken

from .serializers import CustomTokenObtainPairSerializer
from .models import Device, OfflineAuthorization
from .email_tokens import email_verification_token

User = get_user_model()


class CustomTokenObtainPairSerializerTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="cashier",
            email="cashier@example.com",
            password="SecurePassword123!",
            role=User.Role.CASHIER,
        )
        self.device_sync_id = uuid.uuid4()
        self.device_fields = {
            "device_sync_id": str(self.device_sync_id),
            "device_name": "Test device",
            "device_platform": Device.Platform.DESKTOP,
        }

    def test_authenticates_with_username(self):
        serializer = CustomTokenObtainPairSerializer(data={
            "username": "cashier",
            "password": "SecurePassword123!",
            **self.device_fields,
        })

        self.assertTrue(serializer.is_valid(), serializer.errors)
        self.assertEqual(
            serializer.validated_data["user"]["id"],
            self.user.id,
        )
        access = AccessToken(serializer.validated_data["access"])
        self.assertEqual(
            access["device_sync_id"],
            str(self.device_sync_id),
        )
        self.assertEqual(
            serializer.validated_data["device"]["sync_id"],
            str(self.device_sync_id),
        )

    def test_rejects_email_as_login(self):
        serializer = CustomTokenObtainPairSerializer(data={
            "email": "cashier@example.com",
            "password": "SecurePassword123!",
            **self.device_fields,
        })

        self.assertFalse(serializer.is_valid())
        self.assertIn("username", serializer.errors)

    def test_rejects_login_from_deactivated_device(self):
        Device.objects.create(
            sync_id=self.device_sync_id,
            name="Test device",
            platform=Device.Platform.DESKTOP,
            is_active=False,
        )
        serializer = CustomTokenObtainPairSerializer(data={
            "username": "cashier",
            "password": "SecurePassword123!",
            **self.device_fields,
        })

        self.assertFalse(serializer.is_valid())
        self.assertIn("device_sync_id", serializer.errors)


class AdministratorModelPermissionTests(TestCase):
    def test_administrator_role_has_all_model_permissions(self):
        admin = User.objects.create_user(
            username="permission-admin",
            email="permission-admin@example.com",
            password="SecurePassword123!",
            role=User.Role.ADMINISTRATOR,
            is_staff=True,
        )

        self.assertTrue(admin.has_perm("sales.change_sale"))
        self.assertTrue(admin.has_perm("sales.delete_salereturn"))
        self.assertTrue(admin.has_module_perms("inventory"))

    def test_other_roles_do_not_receive_administrator_permissions(self):
        cashier = User.objects.create_user(
            username="permission-cashier",
            email="permission-cashier@example.com",
            password="SecurePassword123!",
            role=User.Role.CASHIER,
        )

        self.assertFalse(cashier.has_perm("sales.change_sale"))
        self.assertFalse(cashier.has_module_perms("inventory"))


@override_settings(
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    FRONTEND_URL="https://pos.example.test",
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
        self.assertFalse(response.data["email_verification_sent"])
        self.assertIn("RESEND_API_KEY", response.data["email_verification_error"])
        cashier = User.objects.get(username="new-cashier")
        self.assertEqual(cashier.role, User.Role.CASHIER)
        self.assertFalse(cashier.is_staff)
        self.assertTrue(cashier.check_password("Secure-cashier-password-928!"))
        self.assertFalse(cashier.email_verified)

    @patch("apps.accounts.views.send_email_verification")
    def test_manager_registration_reports_successful_email_delivery(self, send_email):
        response = self.client.post(
            reverse("users-list"),
            {
                "username": "email-cashier",
                "email": "email-cashier@example.com",
                "password": "Secure-cashier-password-928!",
                "role": User.Role.CASHIER,
            },
        )

        self.assertEqual(response.status_code, 201)
        self.assertTrue(response.data["email_verification_sent"])
        send_email.assert_called_once()

    def test_manager_can_register_accountants_and_auditors(self):
        for role, username in (
            (User.Role.ACCOUNTANT, "new-accountant"),
            (User.Role.AUDITOR, "new-auditor"),
        ):
            with self.subTest(role=role):
                response = self.client.post(
                    reverse("users-list"),
                    {
                        "username": username,
                        "email": f"{username}@example.com",
                        "password": "Secure-role-password-928!",
                        "role": role,
                    },
                )
                self.assertEqual(response.status_code, 201)
                self.assertEqual(User.objects.get(username=username).role, role)

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

        response = self.client.post(
            reverse("users-list"),
            {
                "username": "new-admin",
                "email": "new-admin@example.com",
                "password": "Secure-new-admin-password-928!",
                "role": User.Role.ADMINISTRATOR,
            },
        )
        self.assertEqual(response.status_code, 400)
        self.assertFalse(User.objects.filter(username="new-admin").exists())

    def test_manager_list_includes_only_roles_they_can_create(self):
        for role in (
            User.Role.CASHIER,
            User.Role.ACCOUNTANT,
            User.Role.AUDITOR,
            User.Role.ADMINISTRATOR,
        ):
            User.objects.create_user(
                username=role.lower(),
                email=f"{role.lower()}@example.com",
                password="Secure-list-password-928!",
                role=role,
            )

        response = self.client.get(reverse("users-list"))

        self.assertEqual(response.status_code, 200)
        self.assertCountEqual(
            [user["role"] for user in response.data],
            [
                User.Role.CASHIER,
                User.Role.ACCOUNTANT,
                User.Role.AUDITOR,
            ],
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


@override_settings(
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    FRONTEND_URL="https://pos.example.test",
)
class AccountEmailTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="reset-cashier",
            email="reset-cashier@example.com",
            password="Secure-original-password-928!",
            role=User.Role.CASHIER,
        )

    def test_existing_users_can_request_a_verification_link(self):
        response = self.client.post(
            reverse("email-verification-request"),
            {"email": self.user.email},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("verify-email", mail.outbox[0].body)

    def test_password_reset_is_sent_only_to_verified_email(self):
        response = self.client.post(
            reverse("password-reset"),
            {"email": self.user.email},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(mail.outbox), 0)

        self.user.email_verified = True
        self.user.save(update_fields=["email_verified"])
        response = self.client.post(
            reverse("password-reset"),
            {"email": self.user.email},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(mail.outbox), 1)
        link = next(
            line for line in mail.outbox[0].body.splitlines()
            if line.startswith("https://")
        )
        query = parse_qs(urlparse(link).query)
        confirm_response = self.client.post(
            reverse("password-reset-confirm"),
            {
                "uid": query["uid"][0],
                "token": query["token"][0],
                "password": "New-Reset-Password-92847!",
            },
        )

        self.assertEqual(confirm_response.status_code, 200)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("New-Reset-Password-92847!"))

    def test_email_verification_requires_valid_token(self):
        uid = urlsafe_base64_encode(force_bytes(self.user.pk))
        token = email_verification_token.make_token(self.user)
        response = self.client.post(
            reverse("email-verification"),
            {"uid": uid, "token": "invalid"},
        )
        self.assertEqual(response.status_code, 400)
        self.user.refresh_from_db()
        self.assertFalse(self.user.email_verified)

        response = self.client.post(
            reverse("email-verification"),
            {"uid": uid, "token": token},
        )
        self.assertEqual(response.status_code, 200)
        self.user.refresh_from_db()
        self.assertTrue(self.user.email_verified)


@override_settings(
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    FRONTEND_URL="https://pos.example.test",
)
class AdministratorUserManagementTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_user(
            username="user-admin",
            email="user-admin@example.com",
            password="Secure-user-admin-password-928!",
            role=User.Role.ADMINISTRATOR,
        )
        self.client.force_authenticate(user=self.admin)

    @patch("apps.accounts.views.send_email_verification")
    def test_administrator_can_register_manager(self, send_email):
        response = self.client.post(
            reverse("users-list"),
            {
                "username": "new-manager",
                "email": "new-manager@example.com",
                "password": "Secure-new-manager-password-928!",
                "role": User.Role.STORE_MANAGER,
            },
        )

        self.assertEqual(response.status_code, 201)
        self.assertTrue(response.data["email_verification_sent"])
        self.assertEqual(
            User.objects.get(username="new-manager").role,
            User.Role.STORE_MANAGER,
        )
        send_email.assert_called_once()


class AccountantAuditorAccessTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_accountant_and_auditor_can_read_sales_but_cannot_create_them(self):
        for role in (User.Role.ACCOUNTANT, User.Role.AUDITOR):
            user = User.objects.create_user(
                username=role.lower(),
                email=f"{role.lower()}@example.com",
                password="Secure-readonly-password-928!",
                role=role,
            )
            self.client.force_authenticate(user=user)
            with self.subTest(role=role):
                read_response = self.client.get(reverse("sales-list"))
                create_response = self.client.post(reverse("sales-list"), {})
                self.assertEqual(read_response.status_code, 200)
                self.assertEqual(create_response.status_code, 403)


class DeviceManagementTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.cashier = User.objects.create_user(
            username="device-cashier",
            email="device-cashier@example.com",
            password="Secure-device-cashier-password-928!",
            role=User.Role.CASHIER,
        )
        self.admin = User.objects.create_user(
            username="device-admin",
            email="device-admin@example.com",
            password="Secure-device-admin-password-928!",
            role=User.Role.ADMINISTRATOR,
        )

    def test_authenticated_user_registers_unique_device_identity(self):
        self.client.force_authenticate(user=self.cashier)

        first_response = self.client.post(
            reverse("devices-list"),
            {"name": "Front counter", "platform": Device.Platform.DESKTOP},
        )
        second_response = self.client.post(
            reverse("devices-list"),
            {"name": "Android tablet", "platform": Device.Platform.ANDROID},
        )

        self.assertEqual(first_response.status_code, 201)
        self.assertEqual(second_response.status_code, 201)
        first_device = Device.objects.get(name="Front counter")
        second_device = Device.objects.get(name="Android tablet")
        self.assertEqual(first_device.registered_by, self.cashier)
        self.assertNotEqual(first_device.sync_id, second_device.sync_id)
        self.assertTrue(first_device.is_active)

    def test_only_administrator_can_deactivate_device(self):
        device = Device.objects.create(
            name="Lost tablet",
            platform=Device.Platform.ANDROID,
            registered_by=self.cashier,
        )
        deactivate_url = reverse(
            "devices-deactivate",
            args=[device.sync_id],
        )

        self.client.force_authenticate(user=self.cashier)
        response = self.client.post(deactivate_url)

        self.assertEqual(response.status_code, 403)
        device.refresh_from_db()
        self.assertTrue(device.is_active)
        self.assertIsNone(device.deactivated_at)

        self.client.force_authenticate(user=self.admin)
        response = self.client.post(deactivate_url)

        self.assertEqual(response.status_code, 200)
        device.refresh_from_db()
        self.assertFalse(device.is_active)
        self.assertIsNotNone(device.deactivated_at)
        self.assertEqual(device.deactivated_by, self.admin)

    def test_users_only_list_their_devices_and_admin_lists_all(self):
        own_device = Device.objects.create(
            name="Cashier device",
            platform=Device.Platform.DESKTOP,
            registered_by=self.cashier,
        )
        Device.objects.create(
            name="Admin device",
            platform=Device.Platform.WEB,
            registered_by=self.admin,
        )

        self.client.force_authenticate(user=self.cashier)
        response = self.client.get(reverse("devices-list"))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            [device["sync_id"] for device in response.data],
            [str(own_device.sync_id)],
        )

        self.client.force_authenticate(user=self.admin)
        response = self.client.get(reverse("devices-list"))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 2)


class DeviceAuthenticationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.cashier = User.objects.create_user(
            username="bound-cashier",
            email="bound-cashier@example.com",
            password="Secure-bound-cashier-password-928!",
            role=User.Role.CASHIER,
        )
        self.device_sync_id = uuid.uuid4()
        self.login_data = {
            "username": self.cashier.username,
            "password": "Secure-bound-cashier-password-928!",
            "device_sync_id": str(self.device_sync_id),
            "device_name": "Bound desktop",
            "device_platform": Device.Platform.DESKTOP,
        }

    def test_device_deactivation_rejects_access_refresh_and_new_login(self):
        login_response = self.client.post(
            reverse("login"),
            self.login_data,
        )
        self.assertEqual(login_response.status_code, 200)

        device = Device.objects.get(sync_id=self.device_sync_id)
        administrator = User.objects.create_user(
            username="bound-admin",
            email="bound-admin@example.com",
            password="Secure-bound-admin-password-928!",
            role=User.Role.ADMINISTRATOR,
        )
        admin_client = APIClient()
        admin_client.force_authenticate(user=administrator)
        response = admin_client.post(
            reverse("devices-deactivate", args=[device.sync_id])
        )
        self.assertEqual(response.status_code, 200)

        self.client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {login_response.data['access']}"
        )
        response = self.client.get(reverse("users-me"))
        self.assertEqual(response.status_code, 401)

        response = self.client.post(
            reverse("token_refresh"),
            {"refresh": login_response.data["refresh"]},
        )
        self.assertEqual(response.status_code, 400)

        response = self.client.post(reverse("login"), self.login_data)
        self.assertEqual(response.status_code, 400)
        self.assertIn("device_sync_id", response.data)

    def test_rejects_legacy_unbound_access_tokens(self):
        token = RefreshToken.for_user(self.cashier).access_token
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

        response = self.client.get(reverse("users-me"))

        self.assertEqual(response.status_code, 401)


class OfflineAuthorizationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_user(
            username="grant-admin",
            email="grant-admin@example.com",
            password="Secure-grant-admin-password-928!",
            role=User.Role.ADMINISTRATOR,
        )
        self.cashier = User.objects.create_user(
            username="grant-cashier",
            email="grant-cashier@example.com",
            password="Secure-grant-cashier-password-928!",
            role=User.Role.CASHIER,
        )
        self.device = Device.objects.create(
            name="Grant test device",
            platform=Device.Platform.DESKTOP,
            registered_by=self.admin,
        )
        self.grant_payload = {
            "user": self.cashier.id,
            "device": self.device.id,
            "operation": OfflineAuthorization.Operation.CASH_SALE,
        }

    def test_administrator_issues_twelve_hour_device_bound_grant(self):
        self.client.force_authenticate(user=self.admin)

        response = self.client.post(
            reverse("offline-authorizations-list"),
            self.grant_payload,
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        grant = OfflineAuthorization.objects.get(pk=response.data["id"])
        self.assertEqual(grant.authorized_by, self.admin)
        self.assertEqual(grant.user, self.cashier)
        self.assertEqual(grant.device, self.device)
        self.assertEqual(
            (grant.expires_at - grant.granted_at).total_seconds(),
            12 * 60 * 60,
        )

    def test_issuing_grant_revokes_previous_active_grant(self):
        self.client.force_authenticate(user=self.admin)
        first_response = self.client.post(
            reverse("offline-authorizations-list"),
            self.grant_payload,
            format="json",
        )
        second_response = self.client.post(
            reverse("offline-authorizations-list"),
            self.grant_payload,
            format="json",
        )

        self.assertEqual(first_response.status_code, 201)
        self.assertEqual(second_response.status_code, 201)
        first_grant = OfflineAuthorization.objects.get(
            pk=first_response.data["id"]
        )
        self.assertIsNotNone(first_grant.revoked_at)
        self.assertEqual(first_grant.revoked_by, self.admin)

    def test_cashier_cannot_issue_or_revoke_grants(self):
        self.client.force_authenticate(user=self.cashier)
        issue_response = self.client.post(
            reverse("offline-authorizations-list"),
            self.grant_payload,
            format="json",
        )
        self.assertEqual(issue_response.status_code, 403)

        grant = OfflineAuthorization.objects.create(
            user=self.cashier,
            device=self.device,
            operation=OfflineAuthorization.Operation.CASH_SALE,
            authorized_by=self.admin,
            granted_at=timezone.now(),
            expires_at=timezone.now() + timedelta(hours=12),
        )
        revoke_response = self.client.post(
            reverse("offline-authorizations-revoke", args=[grant.id])
        )
        self.assertEqual(revoke_response.status_code, 403)
        grant.refresh_from_db()
        self.assertIsNone(grant.revoked_at)

    def test_login_and_profile_return_current_device_grants(self):
        self.client.force_authenticate(user=self.admin)
        grant_response = self.client.post(
            reverse("offline-authorizations-list"),
            self.grant_payload,
            format="json",
        )
        self.assertEqual(grant_response.status_code, 201)
        grant_id = grant_response.data["id"]

        login_response = self.client.post(
            reverse("login"),
            {
                "username": self.cashier.username,
                "password": "Secure-grant-cashier-password-928!",
                "device_sync_id": str(self.device.sync_id),
                "device_name": self.device.name,
                "device_platform": self.device.platform,
            },
            format="json",
        )
        self.assertEqual(login_response.status_code, 200)
        self.assertEqual(
            [grant["id"] for grant in login_response.data["offline_authorizations"]],
            [grant_id],
        )

        self.client.force_authenticate(user=None)
        self.client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {login_response.data['access']}"
        )
        profile_response = self.client.get(reverse("users-me"))
        self.assertEqual(profile_response.status_code, 200)
        self.assertEqual(
            [grant["id"] for grant in profile_response.data["offline_authorizations"]],
            [grant_id],
        )
