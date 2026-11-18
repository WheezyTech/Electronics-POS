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
