from decimal import Decimal
from unittest.mock import Mock, patch

from django.contrib.auth import get_user_model
from django.test import SimpleTestCase, override_settings
from django.urls import reverse
from rest_framework.test import APITestCase

from apps.inventory.models import StockLocation
from .models import Sale, SaleReturn
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
