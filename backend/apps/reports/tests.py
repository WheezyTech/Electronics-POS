from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.inventory.models import StockLocation
from apps.sales.models import (
    Sale,
    SalePayment,
    SaleRefundPayment,
    SaleReturn,
)


class DashboardRefundAccountingTests(APITestCase):
    def setUp(self):
        user_model = get_user_model()
        self.manager = user_model.objects.create_user(
            username="report-manager",
            email="report-manager@example.com",
            password="test-password",
            role="STORE_MANAGER",
        )
        self.cashier = user_model.objects.create_user(
            username="report-cashier",
            email="report-cashier@example.com",
            password="test-password",
            role="CASHIER",
        )
        self.location = StockLocation.objects.create(
            name="Report test store",
            code="REPORT-TEST",
        )
        self.completed_at = timezone.now()
        self.sale = Sale.objects.create(
            cashier=self.cashier,
            location=self.location,
            status=Sale.Status.COMPLETED,
            total_amount="100.00",
            completed_at=self.completed_at,
        )
        SalePayment.objects.create(
            sale=self.sale,
            payment_method=SalePayment.PaymentMethod.CASH,
            amount="100.00",
            received_by=self.cashier,
        )
        self.sale_return = SaleReturn.objects.create(
            sale=self.sale,
            reason=SaleReturn.Reason.DEFECTIVE,
            status=SaleReturn.Status.COMPLETED,
            refund_amount="30.00",
            processed_by=self.manager,
            completed_at=self.completed_at,
        )
        SaleRefundPayment.objects.create(
            sale_return=self.sale_return,
            amount="30.00",
            payment_method=SaleRefundPayment.PaymentMethod.MPESA,
            processed_by=self.manager,
        )

    def test_revenue_and_account_breakdown_are_netted_by_refunds(self):
        self.client.force_authenticate(user=self.manager)

        response = self.client.get(reverse("dashboard"))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["sales"]["gross_revenue"], "100.00")
        self.assertEqual(response.data["sales"]["refunds"], "30.00")
        self.assertEqual(response.data["sales"]["revenue"], "70.00")

        breakdown = {
            row["payment_method"]: row
            for row in response.data["payment_breakdown"]
        }
        self.assertEqual(breakdown["CASH"]["total"], "100.00")
        self.assertEqual(breakdown["MPESA"]["total"], "-30.00")
        self.assertEqual(
            response.data["daily_sales"][0]["revenue"],
            "70.00",
        )

    def test_completed_return_exposes_receipt_payment_details(self):
        self.client.force_authenticate(user=self.manager)

        response = self.client.get(
            reverse(
                "sale-returns-detail",
                args=[self.sale_return.id],
            )
        )

        self.assertEqual(response.status_code, 200)
        payment = response.data["refund_payments"][0]
        self.assertEqual(payment["payment_method"], "MPESA")
        self.assertEqual(payment["processed_by_name"], self.manager.username)
