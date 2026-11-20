from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from apps.products.models import Category, Product, Unit
from .models import StockBalance, StockLocation, StockMovement


class OpeningStockTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        manager = get_user_model().objects.create_user(
            username="manager",
            email="manager@example.com",
            password="Secure-manager-password-928!",
            role="STORE_MANAGER",
        )
        self.client.force_authenticate(user=manager)
        self.location = StockLocation.objects.create(
            name="Main shop",
            code="MAIN",
            is_default=True,
        )
        category = Category.objects.create(name="Electronics")
        unit = Unit.objects.create(name="Piece", abbreviation="pc")
        self.product = Product.objects.create(
            name="Test phone",
            sku="TEST-PHONE",
            category=category,
            unit=unit,
            cost_price="100.00",
            selling_price="150.00",
        )

    def test_manager_can_enter_existing_stock_without_a_receipt(self):
        response = self.client.post(
            reverse("stock-adjustment"),
            {
                "product": self.product.id,
                "location": self.location.id,
                "quantity": "12",
                "reference": "OPENING",
                "notes": "Opening stock entered manually.",
            },
        )

        self.assertEqual(response.status_code, 201)
        balance = StockBalance.objects.get(
            product=self.product,
            location=self.location,
        )
        self.assertEqual(balance.quantity_on_hand, 12)
        self.assertEqual(
            StockMovement.objects.get(balance=balance).movement_type,
            StockMovement.MovementType.ADJUSTMENT,
        )

    def test_manager_can_add_and_remove_stock_with_audited_adjustments(self):
        for quantity in ("5", "-2"):
            response = self.client.post(
                reverse("stock-adjustment"),
                {
                    "product": self.product.id,
                    "location": self.location.id,
                    "quantity": quantity,
                    "notes": "Manual inventory correction.",
                },
            )
            self.assertEqual(response.status_code, 201)

        balance = StockBalance.objects.get(
            product=self.product,
            location=self.location,
        )
        self.assertEqual(balance.quantity_on_hand, 3)
        self.assertCountEqual(
            list(
                StockMovement.objects.filter(balance=balance)
                .values_list("quantity_delta", flat=True)
            ),
            [Decimal("5.000"), Decimal("-2.000")],
        )

    def test_stock_cannot_be_adjusted_below_reserved_quantity(self):
        self.client.post(
            reverse("stock-adjustment"),
            {
                "product": self.product.id,
                "location": self.location.id,
                "quantity": "5",
            },
        )
        balance = StockBalance.objects.get(
            product=self.product,
            location=self.location,
        )
        balance.quantity_reserved = 3
        balance.save(update_fields=["quantity_reserved"])

        response = self.client.post(
            reverse("stock-adjustment"),
            {
                "product": self.product.id,
                "location": self.location.id,
                "quantity": "-3",
            },
        )

        self.assertEqual(response.status_code, 400)
        balance.refresh_from_db()
        self.assertEqual(balance.quantity_on_hand, 5)

    def test_cashier_cannot_manually_adjust_stock(self):
        cashier = get_user_model().objects.create_user(
            username="inventory-cashier",
            email="inventory-cashier@example.com",
            password="Secure-cashier-password-928!",
            role="CASHIER",
        )
        self.client.force_authenticate(user=cashier)

        response = self.client.post(
            reverse("stock-adjustment"),
            {
                "product": self.product.id,
                "location": self.location.id,
                "quantity": "1",
            },
        )

        self.assertEqual(response.status_code, 403)
        self.assertFalse(
            StockBalance.objects.filter(
                product=self.product,
                location=self.location,
            ).exists()
        )
