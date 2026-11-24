from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.inventory.models import StockBalance, StockLocation, StockMovement
from apps.purchases.models import Supplier
from apps.products.models import Category, Product, Unit
from .models import (
    GasBrand,
    GasCylinderSize,
    GasExchange,
    GasPurchase,
    GasRefill,
    GasStock,
    GasStockMovement,
    NewCylinderSale,
    NewCylinderSaleAccessory,
)


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
                "quantity": 1,
                "refill_payment": "800.00",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        exchange = GasExchange.objects.get()
        self.assertEqual(exchange.customer_name, "")
        self.assertEqual(exchange.payment_method, "")
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
        self.assertTrue(
            all(
                movement.notes == ""
                for movement in GasStockMovement.objects.all()
            )
        )

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

    def test_gas_cashier_receives_full_and_returns_empty_stock(self):
        from apps.purchases.models import Supplier

        self.user.role = "GAS_LPG_CASHIER"
        self.user.save(update_fields=["role"])
        supplier = Supplier.objects.create(
            name="Gas Supplier",
            phone_number="0700000000",
        )
        stock = GasStock.objects.create(
            location=self.location,
            brand=self.brand,
            size=self.size,
            full_quantity=2,
            empty_quantity=5,
        )

        response = self.client.post(
            "/api/gas/purchases/create_purchase/",
            {
                "location": self.location.pk,
                "supplier": supplier.pk,
                "brand": self.brand.pk,
                "size": self.size.pk,
                "full_cylinders_received": 3,
                "empty_cylinders_returned": 2,
                "purchase_price": "9000.00",
                "delivery_date": "2026-11-24",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201, response.data)
        stock.refresh_from_db()
        self.assertEqual(stock.full_quantity, 5)
        self.assertEqual(stock.empty_quantity, 3)
        movements = {
            movement.cylinder_status: movement.quantity_delta
            for movement in GasStockMovement.objects.filter(
                reference=response.data["reference"]
            )
        }
        self.assertEqual(movements, {"FULL": 3, "EMPTY": -2})

    def test_gas_purchase_rejects_return_above_available_empty_stock(self):
        supplier = Supplier.objects.create(
            name="Gas Supplier",
            phone_number="0700000000",
        )
        stock = GasStock.objects.create(
            location=self.location,
            brand=self.brand,
            size=self.size,
            full_quantity=2,
            empty_quantity=1,
        )

        response = self.client.post(
            "/api/gas/purchases/create_purchase/",
            {
                "location": self.location.pk,
                "supplier": supplier.pk,
                "brand": self.brand.pk,
                "size": self.size.pk,
                "full_cylinders_received": 3,
                "empty_cylinders_returned": 2,
                "purchase_price": "9000.00",
                "delivery_date": "2026-11-24",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        stock.refresh_from_db()
        self.assertEqual(stock.full_quantity, 2)
        self.assertEqual(stock.empty_quantity, 1)
        self.assertEqual(GasPurchase.objects.count(), 0)
        self.assertFalse(GasStockMovement.objects.exists())

    def test_refill_can_receive_customer_brand_and_issue_another_brand(self):
        customer_brand = GasBrand.objects.create(name="Rubis")
        stock = GasStock.objects.create(
            location=self.location,
            brand=self.brand,
            size=self.size,
            full_quantity=2,
            empty_quantity=0,
        )

        response = self.client.post(
            "/api/gas/refills/create_refill/",
            {
                "location": self.location.pk,
                "brand": self.brand.pk,
                "customer_brand": customer_brand.pk,
                "size": self.size.pk,
                "quantity": 1,
                "refill_price": "900.00",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["customer_brand_name"], customer_brand.name)
        refill = GasRefill.objects.get()
        self.assertEqual(refill.brand, self.brand)
        self.assertEqual(refill.customer_brand, customer_brand)
        self.assertEqual(refill.customer_name, "")
        self.assertEqual(refill.customer_phone, "")
        self.assertEqual(refill.payment_method, "")
        stock.refresh_from_db()
        self.assertEqual(stock.full_quantity, 1)
        self.assertEqual(stock.empty_quantity, 0)
        customer_stock = GasStock.objects.get(
            location=self.location, brand=customer_brand, size=self.size
        )
        self.assertEqual(customer_stock.empty_quantity, 1)
        self.assertEqual(
            set(
                GasStockMovement.objects.values_list(
                    "brand_id", "cylinder_status", "quantity_delta"
                )
            ),
            {
                (self.brand.pk, "FULL", -1),
                (customer_brand.pk, "EMPTY", 1),
            },
        )

    def create_accessory(self, *, stock_quantity):
        category = Category.objects.create(name="Gas and LPG products")
        unit = Unit.objects.create(name="Piece", abbreviation="pc")
        product = Product.objects.create(
            name="Gas regulator",
            sku="REGULATOR-1",
            category=category,
            unit=unit,
            cost_price=Decimal("500.00"),
            selling_price=Decimal("750.00"),
        )
        balance = StockBalance.objects.create(
            product=product,
            location=self.location,
            quantity_on_hand=stock_quantity,
        )
        return product, balance

    def test_complete_cylinder_sale_deducts_registered_accessory_stock(self):
        gas_stock = GasStock.objects.create(
            location=self.location,
            brand=self.brand,
            size=self.size,
            full_quantity=2,
            empty_quantity=0,
        )
        accessory, product_balance = self.create_accessory(
            stock_quantity=Decimal("3.000")
        )

        response = self.client.post(
            "/api/gas/sales/create_sale/",
            {
                "location": self.location.pk,
                "brand": self.brand.pk,
                "size": self.size.pk,
                "status": "COMPLETE",
                "quantity": 1,
                "selling_price": "10000.00",
                "includes_gas": True,
                "accessory_items": [
                    {"product": accessory.pk, "quantity": 1},
                ],
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["total_amount"], "10750.00")
        self.assertEqual(response.data["accessory_items"][0]["product_name"], accessory.name)
        sale = NewCylinderSale.objects.get()
        self.assertEqual(sale.status, "COMPLETE")
        self.assertEqual(sale.customer_name, "")
        self.assertEqual(sale.customer_phone, "")
        self.assertEqual(sale.payment_method, "")
        self.assertEqual(sale.accessories_total, Decimal("750.00"))
        self.assertEqual(sale.total_amount, Decimal("10750.00"))
        self.assertEqual(NewCylinderSaleAccessory.objects.count(), 1)
        gas_stock.refresh_from_db()
        product_balance.refresh_from_db()
        self.assertEqual(gas_stock.full_quantity, 1)
        self.assertEqual(product_balance.quantity_on_hand, Decimal("2.000"))
        accessory_movement = StockMovement.objects.get()
        self.assertEqual(accessory_movement.movement_type, "ISSUE")
        self.assertEqual(accessory_movement.quantity_delta, Decimal("-1"))
        report_response = self.client.get("/api/gas/reports/")
        self.assertEqual(report_response.status_code, 200)
        self.assertEqual(
            Decimal(report_response.data["daily"]["new_cylinder_sales_amount"]),
            Decimal("10750.00"),
        )
        self.assertEqual(
            Decimal(report_response.data["daily"]["complete_accessory_sales"]),
            Decimal("750.00"),
        )

    def test_complete_sale_rolls_back_if_accessory_stock_is_insufficient(self):
        gas_stock = GasStock.objects.create(
            location=self.location,
            brand=self.brand,
            size=self.size,
            full_quantity=1,
            empty_quantity=0,
        )
        accessory, product_balance = self.create_accessory(
            stock_quantity=Decimal("0.000")
        )

        response = self.client.post(
            "/api/gas/sales/create_sale/",
            {
                "location": self.location.pk,
                "brand": self.brand.pk,
                "size": self.size.pk,
                "status": "COMPLETE",
                "quantity": 1,
                "selling_price": "10000.00",
                "includes_gas": True,
                "payment_method": "CASH",
                "accessory_items": [
                    {"product": accessory.pk, "quantity": 1},
                ],
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertFalse(NewCylinderSale.objects.exists())
        self.assertFalse(NewCylinderSaleAccessory.objects.exists())
        gas_stock.refresh_from_db()
        product_balance.refresh_from_db()
        self.assertEqual(gas_stock.full_quantity, 1)
        self.assertEqual(product_balance.quantity_on_hand, Decimal("0.000"))
        self.assertFalse(GasStockMovement.objects.exists())
        self.assertFalse(StockMovement.objects.exists())
