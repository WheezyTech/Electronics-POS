from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from apps.products.models import Category, Product, Unit
from .models import StockBalance, StockLocation, StockMovement
from .services import change_stock, transfer_stock


class OpeningStockTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.manager = get_user_model().objects.create_user(
            username="manager",
            email="manager@example.com",
            password="Secure-manager-password-928!",
            role="STORE_MANAGER",
        )
        self.admin = get_user_model().objects.create_user(
            username="inventory-admin",
            email="inventory-admin@example.com",
            password="Secure-admin-password-928!",
            role="ADMINISTRATOR",
        )
        self.client.force_authenticate(user=self.manager)
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

    def test_only_administrators_can_edit_movements_and_balance_history_reflows(self):
        first = change_stock(
            product=self.product,
            location=self.location,
            quantity_delta=5,
            movement_type=StockMovement.MovementType.RECEIPT,
            user=self.manager,
        )
        second = change_stock(
            product=self.product,
            location=self.location,
            quantity_delta=-2,
            movement_type=StockMovement.MovementType.ISSUE,
            user=self.manager,
        )
        url = reverse("stock-movement-edit", args=[first.pk])
        payload = {"quantity_delta": "4.000", "reference": "corrected"}

        self.client.force_authenticate(user=self.manager)
        response = self.client.patch(url, payload, format="json")
        self.assertEqual(response.status_code, 403)

        self.client.force_authenticate(user=self.admin)
        response = self.client.patch(url, payload, format="json")

        self.assertEqual(response.status_code, 200, response.data)
        first.refresh_from_db()
        second.refresh_from_db()
        balance = StockBalance.objects.get(
            product=self.product,
            location=self.location,
        )
        self.assertEqual(first.quantity_after, Decimal("4.000"))
        self.assertEqual(first.reference, "corrected")
        self.assertEqual(second.quantity_before, Decimal("4.000"))
        self.assertEqual(second.quantity_after, Decimal("2.000"))
        self.assertEqual(balance.quantity_on_hand, Decimal("2.000"))

    def test_movement_edit_rejects_negative_later_balance_without_partial_changes(self):
        first = change_stock(
            product=self.product,
            location=self.location,
            quantity_delta=5,
            movement_type=StockMovement.MovementType.RECEIPT,
            user=self.manager,
        )
        later = change_stock(
            product=self.product,
            location=self.location,
            quantity_delta=-4,
            movement_type=StockMovement.MovementType.ISSUE,
            user=self.manager,
        )
        self.client.force_authenticate(user=self.admin)

        response = self.client.patch(
            reverse("stock-movement-edit", args=[first.pk]),
            {"quantity_delta": "3.000"},
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        first.refresh_from_db()
        later.refresh_from_db()
        balance = StockBalance.objects.get(
            product=self.product,
            location=self.location,
        )
        self.assertEqual(first.quantity_delta, Decimal("5.000"))
        self.assertEqual(later.quantity_before, Decimal("5.000"))
        self.assertEqual(balance.quantity_on_hand, Decimal("1.000"))

    def test_editing_a_transfer_movement_updates_both_transfer_legs(self):
        destination = StockLocation.objects.create(
            name="Second shop",
            code="SECOND",
        )
        change_stock(
            product=self.product,
            location=self.location,
            quantity_delta=10,
            movement_type=StockMovement.MovementType.RECEIPT,
            user=self.manager,
        )
        outgoing, incoming = transfer_stock(
            product=self.product,
            source=self.location,
            destination=destination,
            quantity=4,
            user=self.manager,
        )
        self.client.force_authenticate(user=self.admin)

        response = self.client.patch(
            reverse("stock-movement-edit", args=[outgoing.pk]),
            {"quantity_delta": "-6.000"},
            format="json",
        )

        self.assertEqual(response.status_code, 200, response.data)
        outgoing.refresh_from_db()
        incoming.refresh_from_db()
        self.assertEqual(outgoing.quantity_delta, Decimal("-6.000"))
        self.assertEqual(incoming.quantity_delta, Decimal("6.000"))
        self.assertEqual(
            StockBalance.objects.get(
                product=self.product,
                location=self.location,
            ).quantity_on_hand,
            Decimal("4.000"),
        )
        self.assertEqual(
            StockBalance.objects.get(
                product=self.product,
                location=destination,
            ).quantity_on_hand,
            Decimal("6.000"),
        )
