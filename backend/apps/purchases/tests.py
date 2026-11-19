from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from apps.inventory.models import StockBalance, StockLocation
from apps.products.models import Category, Product, Unit

from .models import Supplier, SupplierInvoice


class PurchasingWorkflowTests(TestCase):
    def setUp(self):
        user_model = get_user_model()
        self.manager = user_model.objects.create_user(
            username="purchasing-manager",
            email="purchasing-manager@example.com",
            password="test-password",
            role="STORE_MANAGER",
        )
        self.administrator = user_model.objects.create_user(
            username="purchasing-admin",
            email="purchasing-admin@example.com",
            password="test-password",
            role="ADMINISTRATOR",
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.manager)

        supplier = Supplier.objects.create(
            name="Test supplier",
            phone_number="0700000000",
        )
        location = StockLocation.objects.create(
            name="Main warehouse",
            code="MAIN-WH",
        )
        category = Category.objects.create(name="Accessories")
        unit = Unit.objects.create(name="Piece", abbreviation="pc")
        product = Product.objects.create(
            name="Test charger",
            sku="CHARGER-001",
            category=category,
            unit=unit,
            cost_price="20.00",
            selling_price="35.00",
        )
        self.supplier = supplier
        self.location = location
        self.product = product

    def test_purchase_order_receipt_invoice_payment_and_return_work_together(self):
        order_response = self.client.post(
            reverse("purchase-order-list"),
            {
                "supplier": self.supplier.id,
                "destination": self.location.id,
            },
            format="json",
        )
        self.assertEqual(order_response.status_code, 201, order_response.data)
        order_id = order_response.data["id"]

        item_response = self.client.post(
            f"{reverse('purchase-order-list')}{order_id}/items/",
            {
                "product": self.product.id,
                "quantity": "5.000",
                "unit_cost": "20.00",
            },
            format="json",
        )
        self.assertEqual(item_response.status_code, 201, item_response.data)

        submitted = self.client.post(
            f"{reverse('purchase-order-list')}{order_id}/submit/"
        )
        self.assertEqual(submitted.status_code, 200, submitted.data)

        self.client.force_authenticate(user=self.administrator)
        approved = self.client.post(
            f"{reverse('purchase-order-list')}{order_id}/approve/"
        )
        self.assertEqual(approved.status_code, 200, approved.data)
        self.client.force_authenticate(user=self.manager)

        grn_response = self.client.post(
            reverse("goods-received-list"),
            {"purchase_order": order_id},
            format="json",
        )
        self.assertEqual(grn_response.status_code, 201, grn_response.data)
        grn_id = grn_response.data["id"]

        grn_item_response = self.client.post(
            f"{reverse('goods-received-list')}{grn_id}/items/",
            {
                "purchase_order_item": item_response.data["id"],
                "quantity_received": "5.000",
            },
            format="json",
        )
        self.assertEqual(grn_item_response.status_code, 201, grn_item_response.data)

        posted_grn = self.client.post(
            f"{reverse('goods-received-list')}{grn_id}/post/"
        )
        self.assertEqual(posted_grn.status_code, 200, posted_grn.data)
        balance = StockBalance.objects.get(
            product=self.product,
            location=self.location,
        )
        self.assertEqual(balance.quantity_on_hand, 5)

        invoice_response = self.client.post(
            reverse("supplier-invoices-list"),
            {
                "supplier": self.supplier.id,
                "goods_received_note": grn_id,
                "invoice_number": "INV-001",
                "invoice_date": "2026-11-19",
                "subtotal": "100.00",
                "tax_amount": "0.00",
                "discount_amount": "0.00",
                "total_amount": "100.00",
            },
            format="json",
        )
        self.assertEqual(invoice_response.status_code, 201, invoice_response.data)
        invoice_id = invoice_response.data["id"]
        posted_invoice = self.client.post(
            f"{reverse('supplier-invoices-list')}{invoice_id}/post/"
        )
        self.assertEqual(posted_invoice.status_code, 200, posted_invoice.data)

        payment_response = self.client.post(
            reverse("supplier-payments-list"),
            {
                "supplier": self.supplier.id,
                "supplier_invoice": invoice_id,
                "amount": "40.00",
                "payment_method": "MPESA",
                "payment_reference": "MPESA-001",
                "payment_date": "2026-11-19",
            },
            format="json",
        )
        self.assertEqual(payment_response.status_code, 201, payment_response.data)
        payment_id = payment_response.data["id"]
        posted_payment = self.client.post(
            f"{reverse('supplier-payments-list')}{payment_id}/post/"
        )
        self.assertEqual(posted_payment.status_code, 200, posted_payment.data)
        invoice = SupplierInvoice.objects.get(pk=invoice_id)
        self.assertEqual(invoice.outstanding_balance, 60)

        return_response = self.client.post(
            reverse("supplier-returns-list"),
            {
                "original_grn": grn_id,
                "reason": "DAMAGED",
                "resolution": "REFUND",
            },
            format="json",
        )
        self.assertEqual(return_response.status_code, 201, return_response.data)
        return_id = return_response.data["id"]
        return_item_response = self.client.post(
            f"{reverse('supplier-returns-list')}{return_id}/items/",
            {
                "original_received_item": grn_item_response.data["id"],
                "quantity_returned": "1.000",
            },
            format="json",
        )
        self.assertEqual(
            return_item_response.status_code,
            201,
            return_item_response.data,
        )
        posted_return = self.client.post(
            f"{reverse('supplier-returns-list')}{return_id}/post/"
        )
        self.assertEqual(posted_return.status_code, 200, posted_return.data)

        balance.refresh_from_db()
        self.assertEqual(balance.quantity_on_hand, 4)
