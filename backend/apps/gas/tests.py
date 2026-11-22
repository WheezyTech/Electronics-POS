from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.inventory.models import StockLocation
from .models import GasBrand, GasCylinderSize, GasExchange, GasStock, GasStockMovement


class GasExchangeTests(TestCase):
    def setUp(self):
        user_model = get_user_model()
        self.user = user_model.objects.create_user(
            username="gas-manager",
            email="gas-manager@example.test",
            password="test-password",
            role="STORE_MANAGER",
        )
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.location = StockLocation.objects.create(name="Gas Store", code="GAS")
        self.brand = GasBrand.objects.create(name="Total")
        self.size = GasCylinderSize.objects.create(name="13kg", weight_kg=13)

    def test_exchange_issues_full_and_receives_empty(self):
        stock = GasStock.objects.create(
            location=self.location,
            brand=self.brand,
            size=self.size,
            full_quantity=2,
            empty_quantity=4,
        )

        response = self.client.post(
            "/api/gas/exchanges/create_exchange/",
            {
                "location": self.location.pk,
                "brand": self.brand.pk,
                "size": self.size.pk,
                "customer_name": "Customer",
                "quantity": 1,
                "refill_payment": "800.00",
                "payment_method": "CASH",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        stock.refresh_from_db()
        self.assertEqual(stock.full_quantity, 1)
        self.assertEqual(stock.empty_quantity, 5)
        self.assertEqual(GasExchange.objects.count(), 1)
        movements = {
            movement.cylinder_status: movement.quantity_delta
            for movement in GasStockMovement.objects.all()
        }
        self.assertEqual(movements, {"FULL": -1, "EMPTY": 1})

    def test_exchange_without_full_stock_is_rejected_without_movement(self):
        stock = GasStock.objects.create(
            location=self.location,
            brand=self.brand,
            size=self.size,
            full_quantity=0,
            empty_quantity=4,
        )

        response = self.client.post(
            "/api/gas/exchanges/create_exchange/",
            {
                "location": self.location.pk,
                "brand": self.brand.pk,
                "size": self.size.pk,
                "customer_name": "Customer",
                "quantity": 1,
                "refill_payment": "800.00",
                "payment_method": "CASH",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        stock.refresh_from_db()
        self.assertEqual(stock.full_quantity, 0)
        self.assertEqual(stock.empty_quantity, 4)
        self.assertEqual(GasExchange.objects.count(), 0)
        self.assertEqual(GasStockMovement.objects.count(), 0)

    def test_stock_adjustment_records_both_stock_types(self):
        response = self.client.post(
            "/api/gas/stock/record/",
            {
                "location": self.location.pk,
                "brand": self.brand.pk,
                "size": self.size.pk,
                "full_quantity": 3,
                "empty_quantity": 2,
                "notes": "Initial stock count",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        stock = GasStock.objects.get(
            location=self.location, brand=self.brand, size=self.size
        )
        self.assertEqual(stock.full_quantity, 3)
        self.assertEqual(stock.empty_quantity, 2)
        self.assertEqual(GasStockMovement.objects.count(), 2)

    def test_cashier_can_record_exchange(self):
        self.user.role = "CASHIER"
        self.user.save(update_fields=["role"])
        GasStock.objects.create(
            location=self.location,
            brand=self.brand,
            size=self.size,
            full_quantity=1,
            empty_quantity=0,
        )

        response = self.client.post(
            "/api/gas/exchanges/create_exchange/",
            {
                "location": self.location.pk,
                "brand": self.brand.pk,
                "size": self.size.pk,
                "customer_name": "Customer",
                "quantity": 1,
                "refill_payment": "800.00",
                "payment_method": "CASH",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)

    def test_cashier_cannot_adjust_gas_stock(self):
        self.user.role = "CASHIER"
        self.user.save(update_fields=["role"])

        response = self.client.post(
            "/api/gas/stock/record/",
            {
                "location": self.location.pk,
                "brand": self.brand.pk,
                "size": self.size.pk,
                "full_quantity": 1,
                "empty_quantity": 0,
                "notes": "Unauthorized stock change",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 403)
        self.assertFalse(GasStock.objects.exists())
