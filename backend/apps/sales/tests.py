from decimal import Decimal
from datetime import timedelta
import uuid
from unittest.mock import Mock, patch

from django.contrib.auth import get_user_model
from django.test import SimpleTestCase, override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import AccessToken

from apps.accounts.models import Device, OfflineAuthorization
from apps.inventory.models import StockBalance, StockLocation
from apps.products.models import Category, Product, Unit
from .models import (
    Sale,
    SaleItem,
    SalePayment,
    SaleReturn,
    SaleReturnItem,
)
from .mpesa import MpesaRequestError, initiate_stk_push


class MpesaRequestTests(SimpleTestCase):
    @override_settings(
        MPESA_SHORTCODE="123456",
        MPESA_PASSKEY="test-passkey",
        MPESA_CALLBACK_URL="https://example.com/mpesa/callback/",
    )
    def test_stk_push_error_includes_daraja_response_details(self):
        response = Mock()
        response.json.return_value = {
            "errorCode": "400.002.02",
            "errorMessage": "Invalid callback URL",
        }
        response.ok = False
        response.status_code = 400

        with (
            patch(
                "apps.sales.mpesa.get_mpesa_access_token",
                return_value="test-access-token",
            ),
            patch(
                "apps.sales.mpesa.requests.post",
                return_value=response,
            ),
        ):
            with self.assertRaisesRegex(
                MpesaRequestError,
                "HTTP 400.*Invalid callback URL",
            ):
                initiate_stk_push(
                    phone="254712345678",
                    amount=Decimal("10.00"),
                    account_reference="SALE-TEST",
                )


class CashierShiftOpeningTests(APITestCase):
    def setUp(self):
        user_model = get_user_model()
        self.manager = user_model.objects.create_user(
            username="manager",
            email="manager@example.com",
            password="test-password",
            role="STORE_MANAGER",
        )
        self.cashier = user_model.objects.create_user(
            username="cashier",
            email="cashier@example.com",
            password="test-password",
            role="CASHIER",
        )
        self.location = StockLocation.objects.create(
            name="Test store",
            code="TEST-STORE",
        )

    def test_manager_can_open_a_shift_for_a_cashier(self):
        self.client.force_authenticate(user=self.manager)

        response = self.client.post(
            reverse("cashier-shifts-list"),
            {
                "cashier": self.cashier.id,
                "location": self.location.id,
                "opening_cash": "100.00",
                "notes": "",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["cashier"], self.cashier.id)

    def test_cashier_cannot_open_their_own_shift(self):
        self.client.force_authenticate(user=self.cashier)

        response = self.client.post(
            reverse("cashier-shifts-list"),
            {
                "cashier": self.cashier.id,
                "location": self.location.id,
                "opening_cash": "100.00",
                "notes": "",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 403)

    def test_cashier_list_is_only_available_to_managers(self):
        self.client.force_authenticate(user=self.manager)
        response = self.client.get(reverse("cashier-shifts-cashiers"))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            [cashier["id"] for cashier in response.data],
            [self.cashier.id],
        )

        self.client.force_authenticate(user=self.cashier)
        response = self.client.get(reverse("cashier-shifts-cashiers"))

        self.assertEqual(response.status_code, 403)


class SaleHistoryAccessTests(APITestCase):
    def setUp(self):
        user_model = get_user_model()
        self.manager = user_model.objects.create_user(
            username="manager",
            email="manager@example.com",
            password="test-password",
            role="STORE_MANAGER",
        )
        self.cashier = user_model.objects.create_user(
            username="cashier",
            email="cashier@example.com",
            password="test-password",
            role="CASHIER",
        )
        self.other_cashier = user_model.objects.create_user(
            username="other-cashier",
            email="other-cashier@example.com",
            password="test-password",
            role="CASHIER",
        )
        self.location = StockLocation.objects.create(
            name="Test store",
            code="TEST-STORE",
        )
        self.cashier_sale = Sale.objects.create(
            cashier=self.cashier,
            location=self.location,
        )
        self.other_sale = Sale.objects.create(
            cashier=self.other_cashier,
            location=self.location,
        )

    def test_cashier_sales_list_only_contains_their_own_sales(self):
        self.client.force_authenticate(user=self.cashier)

        response = self.client.get(reverse("sales-list"))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            [sale["id"] for sale in response.data],
            [self.cashier_sale.id],
        )

    def test_manager_can_view_sales_for_all_cashiers(self):
        self.client.force_authenticate(user=self.manager)

        response = self.client.get(reverse("sales-list"))

        self.assertEqual(response.status_code, 200)
        self.assertCountEqual(
            [sale["id"] for sale in response.data],
            [self.cashier_sale.id, self.other_sale.id],
        )


class SalePaymentEditTests(APITestCase):
    def setUp(self):
        user_model = get_user_model()
        self.admin = user_model.objects.create_user(
            username="payment-admin",
            email="payment-admin@example.com",
            password="Secure-admin-password-928!",
            role="ADMINISTRATOR",
        )
        self.manager = user_model.objects.create_user(
            username="payment-manager",
            email="payment-manager@example.com",
            password="Secure-manager-password-928!",
            role="STORE_MANAGER",
        )
        self.location = StockLocation.objects.create(
            name="Payment store",
            code="PAYMENT-STORE",
        )
        self.sale = Sale.objects.create(
            cashier=self.admin,
            location=self.location,
            subtotal=Decimal("10.00"),
            total_amount=Decimal("10.00"),
            status=Sale.Status.COMPLETED,
        )
        self.cash_payment = SalePayment.objects.create(
            sale=self.sale,
            payment_method=SalePayment.PaymentMethod.CASH,
            amount=Decimal("5.00"),
            received_by=self.admin,
        )
        self.card_payment = SalePayment.objects.create(
            sale=self.sale,
            payment_method=SalePayment.PaymentMethod.CARD,
            amount=Decimal("5.00"),
            received_by=self.admin,
        )

    def test_administrator_can_edit_payment_details_without_changing_total(self):
        self.client.force_authenticate(user=self.admin)

        response = self.client.put(
            reverse("sales-update-payments", args=[self.sale.id]),
            [
                {
                    "id": self.cash_payment.id,
                    "payment_method": "MPESA",
                    "amount": "6.00",
                    "transaction_reference": "ABC123",
                },
                {
                    "id": self.card_payment.id,
                    "payment_method": "CASH",
                    "amount": "4.00",
                    "transaction_reference": "",
                },
            ],
            format="json",
        )

        self.assertEqual(response.status_code, 200, response.data)
        self.cash_payment.refresh_from_db()
        self.card_payment.refresh_from_db()
        self.assertEqual(self.cash_payment.amount, Decimal("6.00"))
        self.assertEqual(
            self.cash_payment.transaction_reference,
            "ABC123",
        )
        self.assertEqual(self.card_payment.amount, Decimal("4.00"))

    def test_non_administrator_cannot_edit_sale_payments(self):
        self.client.force_authenticate(user=self.manager)

        response = self.client.put(
            reverse("sales-update-payments", args=[self.sale.id]),
            [
                {
                    "id": self.cash_payment.id,
                    "payment_method": "CASH",
                    "amount": "5.00",
                },
                {
                    "id": self.card_payment.id,
                    "payment_method": "CARD",
                    "amount": "5.00",
                },
            ],
            format="json",
        )

        self.assertEqual(response.status_code, 403)


class SplitPaymentCheckoutTests(APITestCase):
    def setUp(self):
        user_model = get_user_model()
        self.cashier = user_model.objects.create_user(
            username="split-cashier",
            email="split-cashier@example.com",
            password="test-password",
            role="CASHIER",
        )
        self.client.force_authenticate(user=self.cashier)
        self.location = StockLocation.objects.create(
            name="Split payment store",
            code="SPLIT-PAY",
        )
        category = Category.objects.create(name="Split payment products")
        unit = Unit.objects.create(name="Piece", abbreviation="pc")
        self.product = Product.objects.create(
            name="Split payment item",
            sku="SPLIT-PAY-ITEM",
            category=category,
            unit=unit,
            cost_price=Decimal("5.00"),
            selling_price=Decimal("10.00"),
            created_by=self.cashier,
        )
        StockBalance.objects.create(
            product=self.product,
            location=self.location,
            quantity_on_hand=Decimal("5.000"),
        )
        self.sale = Sale.objects.create(
            cashier=self.cashier,
            location=self.location,
        )
        SaleItem.objects.create(
            sale=self.sale,
            product=self.product,
            quantity=Decimal("2"),
            unit_price=Decimal("10.00"),
            cost_price=Decimal("5.00"),
        )

    def test_completes_sale_paid_by_cash_manual_mpesa_and_card(self):
        response = self.client.post(
            reverse("sales-checkout", args=[self.sale.id]),
            {
                "payments": [
                    {"payment_method": "CASH", "amount": "5.00"},
                    {
                        "payment_method": "MPESA",
                        "amount": "10.00",
                        "transaction_reference": "QWE123456",
                    },
                    {"payment_method": "CARD", "amount": "5.00"},
                ]
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200, response.data)
        self.sale.refresh_from_db()
        self.assertEqual(self.sale.status, Sale.Status.COMPLETED)
        self.assertEqual(
            list(
                self.sale.payments.order_by("payment_method")
                .values_list("payment_method", "amount")
            ),
            [
                (SalePayment.PaymentMethod.CARD, Decimal("5.00")),
                (SalePayment.PaymentMethod.CASH, Decimal("5.00")),
                (SalePayment.PaymentMethod.MPESA, Decimal("10.00")),
            ],
        )
        self.assertEqual(
            self.sale.payments.get(
                payment_method=SalePayment.PaymentMethod.MPESA
            ).transaction_reference,
            "QWE123456",
        )

    def test_split_payment_amounts_must_equal_sale_total(self):
        response = self.client.post(
            reverse("sales-checkout", args=[self.sale.id]),
            {
                "payments": [
                    {"payment_method": "CASH", "amount": "5.00"},
                    {
                        "payment_method": "MPESA",
                        "amount": "10.00",
                        "transaction_reference": "QWE123456",
                    },
                ]
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.sale.refresh_from_db()
        self.assertEqual(self.sale.status, Sale.Status.DRAFT)
        self.assertFalse(self.sale.payments.exists())

    def test_manual_mpesa_split_requires_transaction_reference(self):
        response = self.client.post(
            reverse("sales-checkout", args=[self.sale.id]),
            {
                "payments": [
                    {
                        "payment_method": "MPESA",
                        "amount": "20.00",
                    }
                ]
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertFalse(self.sale.payments.exists())


class OfflineReceiptReferenceTests(APITestCase):
    def setUp(self):
        user_model = get_user_model()
        self.cashier = user_model.objects.create_user(
            username="offline-cashier",
            email="offline-cashier@example.com",
            password="test-password",
            role="CASHIER",
        )
        self.other_cashier = user_model.objects.create_user(
            username="other-offline-cashier",
            email="other-offline-cashier@example.com",
            password="test-password",
            role="CASHIER",
        )
        self.location = StockLocation.objects.create(
            name="Offline test store",
            code="OFFLINE-TEST",
        )
        self.reference = "SALE-0123456789ABCDEF0123456789ABCDEF"

    def test_client_reference_is_idempotent_for_its_cashier(self):
        self.client.force_authenticate(user=self.cashier)
        payload = {
            "reference": self.reference,
            "location": self.location.id,
        }

        first_response = self.client.post(
            reverse("sales-list"),
            payload,
            format="json",
        )
        second_response = self.client.post(
            reverse("sales-list"),
            payload,
            format="json",
        )

        self.assertEqual(first_response.status_code, 201)
        self.assertEqual(second_response.status_code, 201)
        self.assertEqual(first_response.data["id"], second_response.data["id"])
        self.assertEqual(
            Sale.objects.filter(reference=self.reference).count(),
            1,
        )

    def test_receipt_serialization_marks_server_sale_synchronized(self):
        self.client.force_authenticate(user=self.cashier)
        sale = Sale.objects.create(
            cashier=self.cashier,
            location=self.location,
        )

        response = self.client.get(reverse("sales-detail", args=[sale.id]))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["sync_status"], "SYNCED")

    def test_client_completion_time_can_only_be_set_on_a_draft(self):
        self.client.force_authenticate(user=self.cashier)
        sale = Sale.objects.create(
            cashier=self.cashier,
            location=self.location,
        )
        completion_time = timezone.now()
        sale_url = reverse("sales-detail", args=[sale.id])

        response = self.client.patch(
            sale_url,
            {"client_completed_at": completion_time.isoformat()},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        sale.refresh_from_db()
        self.assertEqual(sale.client_completed_at, completion_time)

        sale.status = Sale.Status.COMPLETED
        sale.save(update_fields=["status"])
        response = self.client.patch(
            sale_url,
            {"client_completed_at": timezone.now().isoformat()},
            format="json",
        )

        self.assertEqual(response.status_code, 400)

    def test_receipt_reference_cannot_be_claimed_by_another_cashier(self):
        Sale.objects.create(
            cashier=self.cashier,
            location=self.location,
            reference=self.reference,
        )
        self.client.force_authenticate(user=self.other_cashier)

        response = self.client.post(
            reverse("sales-list"),
            {
                "reference": self.reference,
                "location": self.location.id,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            Sale.objects.filter(reference=self.reference).count(),
            1,
        )


class OfflineSaleAuthorizationTests(APITestCase):
    def setUp(self):
        user_model = get_user_model()
        self.cashier = user_model.objects.create_user(
            username="authorized-cashier",
            email="authorized-cashier@example.com",
            password="test-password",
            role="CASHIER",
        )
        self.device = Device.objects.create(
            name="Authorized sales device",
            platform=Device.Platform.DESKTOP,
            registered_by=self.cashier,
        )
        self.location = StockLocation.objects.create(
            name="Authorized sale store",
            code="AUTHORIZED-SALE",
        )
        now = timezone.now()
        self.grant = OfflineAuthorization.objects.create(
            user=self.cashier,
            device=self.device,
            operation=OfflineAuthorization.Operation.CASH_SALE,
            authorized_by=self.cashier,
            granted_at=now - timedelta(minutes=5),
            expires_at=now + timedelta(hours=12),
        )
        self.authenticate_device(self.device.sync_id)

    def authenticate_device(self, sync_id):
        token = AccessToken.for_user(self.cashier)
        token["device_sync_id"] = str(sync_id)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    def sync_sale(self, *, grant=None, occurred_at=None):
        return self.client.post(
            reverse("sales-list"),
            {
                "reference": f"SALE-{uuid.uuid4().hex.upper()}",
                "location": self.location.id,
                "client_completed_at": (
                    occurred_at or timezone.now()
                ).isoformat(),
                "offline_authorization": grant or self.grant.id,
            },
            format="json",
        )

    def test_accepts_sale_from_the_authorized_user_and_device(self):
        response = self.sync_sale()

        self.assertEqual(response.status_code, 201)
        sale = Sale.objects.get(pk=response.data["id"])
        self.assertEqual(sale.offline_authorization, self.grant)
        self.assertEqual(sale.cashier, self.cashier)

    def test_rejects_grant_used_from_another_device(self):
        other_device = Device.objects.create(
            name="Other authorized sales device",
            platform=Device.Platform.DESKTOP,
            registered_by=self.cashier,
        )
        self.authenticate_device(other_device.sync_id)

        response = self.sync_sale()

        self.assertEqual(response.status_code, 400)
        self.assertIn("offline_authorization", response.data)

    def test_rejects_sale_outside_grant_window(self):
        response = self.sync_sale(
            occurred_at=self.grant.expires_at
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("offline_authorization", response.data)

    def test_rejects_grant_used_by_another_user(self):
        other_cashier = get_user_model().objects.create_user(
            username="other-authorized-cashier",
            email="other-authorized-cashier@example.com",
            password="test-password",
            role="CASHIER",
        )
        token = AccessToken.for_user(other_cashier)
        token["device_sync_id"] = str(self.device.sync_id)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

        response = self.sync_sale()

        self.assertEqual(response.status_code, 400)
        self.assertIn("offline_authorization", response.data)

    def test_rejects_sale_after_grant_revocation(self):
        self.grant.revoked_at = timezone.now() - timedelta(minutes=1)
        self.grant.save(update_fields=["revoked_at"])

        response = self.sync_sale()

        self.assertEqual(response.status_code, 400)
        self.assertIn("offline_authorization", response.data)

    def test_offline_authorized_sale_rejects_non_cash_checkout(self):
        category = Category.objects.create(name="Offline sale products")
        unit = Unit.objects.create(
            name="Piece",
            abbreviation="pc",
        )
        product = Product.objects.create(
            name="Offline sale item",
            sku="OFFLINE-SALE-ITEM",
            category=category,
            unit=unit,
            cost_price=Decimal("5.00"),
            selling_price=Decimal("10.00"),
            created_by=self.cashier,
        )
        sale = Sale.objects.create(
            cashier=self.cashier,
            location=self.location,
            offline_authorization=self.grant,
        )
        SaleItem.objects.create(
            sale=sale,
            product=product,
            quantity=Decimal("1"),
            unit_price=Decimal("10.00"),
            cost_price=Decimal("5.00"),
        )
        sale.recalculate_totals()

        response = self.client.post(
            reverse("sales-checkout", args=[sale.id]),
            {
                "payments": [
                    {
                        "payment_method": "CARD",
                        "amount": "10.00",
                    }
                ]
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.data,
            ["Offline-authorized sales can only be paid in cash."],
        )


class SaleReturnCreateResponseTests(APITestCase):
    def setUp(self):
        user_model = get_user_model()
        self.cashier = user_model.objects.create_user(
            username="return-cashier",
            email="return-cashier@example.com",
            password="test-password",
            role="CASHIER",
        )
        self.location = StockLocation.objects.create(
            name="Return test store",
            code="RETURN-TEST",
        )
        self.sale = Sale.objects.create(
            cashier=self.cashier,
            location=self.location,
            status=Sale.Status.COMPLETED,
        )

    def test_create_response_contains_return_id(self):
        self.client.force_authenticate(user=self.cashier)

        response = self.client.post(
            reverse("sale-returns-list"),
            {
                "sale": self.sale.id,
                "reason": SaleReturn.Reason.DEFECTIVE,
                "notes": "",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertIn("id", response.data)


class SaleReturnApprovalPermissionTests(APITestCase):
    def setUp(self):
        user_model = get_user_model()
        self.manager = user_model.objects.create_user(
            username="return-manager",
            email="return-manager@example.com",
            password="test-password",
            role="STORE_MANAGER",
        )
        self.cashier = user_model.objects.create_user(
            username="return-requester",
            email="return-requester@example.com",
            password="test-password",
            role="CASHIER",
        )
        self.location = StockLocation.objects.create(
            name="Approval test store",
            code="APPROVAL-TEST",
        )
        self.sale = Sale.objects.create(
            cashier=self.cashier,
            location=self.location,
            status=Sale.Status.COMPLETED,
        )
        self.sale_return = SaleReturn.objects.create(
            sale=self.sale,
            reason=SaleReturn.Reason.DEFECTIVE,
            processed_by=self.cashier,
        )

    def complete_return(self):
        return self.client.post(
            reverse(
                "sale-returns-complete",
                args=[self.sale_return.id],
            ),
            {"refund_payments": []},
            format="json",
        )

    def test_cashier_cannot_approve_return(self):
        self.client.force_authenticate(user=self.cashier)

        response = self.complete_return()

        self.assertEqual(response.status_code, 403)

    def test_store_manager_can_reach_return_validation(self):
        self.client.force_authenticate(user=self.manager)

        response = self.complete_return()

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.data["error"],
            "Add at least one item before completing the return.",
        )


class SaleReturnDeletePermissionTests(APITestCase):
    def setUp(self):
        user_model = get_user_model()
        self.admin = user_model.objects.create_user(
            username="return-admin",
            email="return-admin@example.com",
            password="test-password",
            role="ADMINISTRATOR",
        )
        self.cashier = user_model.objects.create_user(
            username="return-delete-cashier",
            email="return-delete-cashier@example.com",
            password="test-password",
            role="CASHIER",
        )
        self.location = StockLocation.objects.create(
            name="Return deletion store",
            code="RETURN-DELETE",
        )
        category = Category.objects.create(name="Return deletion products")
        unit = Unit.objects.create(name="Piece", abbreviation="pc")
        product = Product.objects.create(
            name="Return deletion item",
            sku="RETURN-DELETE-ITEM",
            category=category,
            unit=unit,
            cost_price=Decimal("5.00"),
            selling_price=Decimal("10.00"),
            created_by=self.cashier,
        )
        self.sale = Sale.objects.create(
            cashier=self.cashier,
            location=self.location,
            status=Sale.Status.COMPLETED,
        )
        self.sale_item = SaleItem.objects.create(
            sale=self.sale,
            product=product,
            quantity=Decimal("1"),
            unit_price=Decimal("10.00"),
            cost_price=Decimal("5.00"),
        )
        self.sale_return = SaleReturn.objects.create(
            sale=self.sale,
            reason=SaleReturn.Reason.DEFECTIVE,
            processed_by=self.cashier,
        )
        self.return_item = SaleReturnItem.objects.create(
            sale_return=self.sale_return,
            sale_item=self.sale_item,
            quantity=Decimal("1"),
            unit_price=Decimal("10.00"),
            refund_amount=Decimal("10.00"),
        )

    def delete_return(self):
        return self.client.delete(
            reverse("sale-returns-detail", args=[self.sale_return.id])
        )

    def test_admin_can_delete_uncompleted_return_and_unblock_sale_item(self):
        self.client.force_authenticate(user=self.admin)

        response = self.delete_return()

        self.assertEqual(response.status_code, 204)
        self.assertFalse(
            SaleReturnItem.objects.filter(pk=self.return_item.pk).exists()
        )
        self.sale_item.delete()
        self.assertFalse(SaleItem.objects.filter(pk=self.sale_item.pk).exists())

    def test_non_admin_cannot_delete_return(self):
        self.client.force_authenticate(user=self.cashier)

        response = self.delete_return()

        self.assertEqual(response.status_code, 403)
        self.assertTrue(
            SaleReturn.objects.filter(pk=self.sale_return.pk).exists()
        )

    def test_admin_cannot_delete_completed_return(self):
        self.sale_return.status = SaleReturn.Status.COMPLETED
        self.sale_return.save(update_fields=["status"])
        self.client.force_authenticate(user=self.admin)

        response = self.delete_return()

        self.assertEqual(response.status_code, 400)
        self.assertTrue(
            SaleReturn.objects.filter(pk=self.sale_return.pk).exists()
        )
