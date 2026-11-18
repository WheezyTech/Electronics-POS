
import uuid
from decimal import Decimal
from django.conf import settings
from django.db import models
from django.conf import settings
from django.core.validators import MinValueValidator
from django.utils import timezone

from apps.products.models import Product
from apps.inventory.models import StockLocation


class Sale(models.Model):

    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        COMPLETED = "COMPLETED", "Completed"
        CANCELLED = "CANCELLED", "Cancelled"

    reference = models.CharField(
        max_length=50,
        unique=True,
        editable=False
    )

    cashier = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="sales"
    )

    location = models.ForeignKey(
        StockLocation,
        on_delete=models.PROTECT,
        related_name="sales"
    )

    customer_name = models.CharField(max_length=150, blank=True)
    customer_phone = models.CharField(max_length=30, blank=True)

    subtotal = models.DecimalField(
        max_digits=14, decimal_places=2, default=Decimal("0.00")
    )

    discount_amount = models.DecimalField(
        max_digits=14, decimal_places=2, default=Decimal("0.00")
    )

    tax_amount = models.DecimalField(
        max_digits=14, decimal_places=2, default=Decimal("0.00")
    )

    total_amount = models.DecimalField(
        max_digits=14, decimal_places=2, default=Decimal("0.00")
    )

    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.DRAFT,
        db_index=True
    )

    notes = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def save(self, *args, **kwargs):
        if not self.reference:
            self.reference = f"SALE-{uuid.uuid4().hex[:12].upper()}"
        super().save(*args, **kwargs)

    def recalculate_totals(self):
        items = list(self.items.all())

        self.subtotal = sum(
            (item.line_total for item in items),
            Decimal("0.00")
        )

        self.total_amount = (
            self.subtotal - self.discount_amount + self.tax_amount
        )

        self.save(update_fields=[
            "subtotal", "total_amount"
        ])

    def __str__(self):
        return self.reference


class SaleItem(models.Model):

    sale = models.ForeignKey(
        Sale,
        on_delete=models.CASCADE,
        related_name="items"
    )

    product = models.ForeignKey(
        Product,
        on_delete=models.PROTECT,
        related_name="sale_items"
    )

    quantity = models.DecimalField(
        max_digits=14,
        decimal_places=3,
        validators=[MinValueValidator(Decimal("0.001"))]
    )

    unit_price = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.01"))]
    )

    cost_price = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        default=Decimal("0.00")
    )

    discount_amount = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        default=Decimal("0.00")
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["sale", "product"],
                name="unique_product_per_sale"
            )
        ]

    @property
    def line_total(self):
        return (
            self.quantity * self.unit_price
        ) - self.discount_amount

    @property
    def profit(self):
        return self.line_total - (
            self.quantity * self.cost_price
        )

    def __str__(self):
        return f"{self.sale.reference} - {self.product.name}"


class SalePayment(models.Model):

    class PaymentMethod(models.TextChoices):
        CASH = "CASH", "Cash"
        MPESA = "MPESA", "M-Pesa"
        BANK = "BANK", "Bank Transfer"
        CARD = "CARD", "Card"
        OTHER = "OTHER", "Other"

    sale = models.ForeignKey(
        Sale,
        on_delete=models.PROTECT,
        related_name="payments"
    )

    payment_method = models.CharField(
        max_length=20,
        choices=PaymentMethod.choices
    )

    amount = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.01"))]
    )

    transaction_reference = models.CharField(
        max_length=100,
        blank=True
    )

    received_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="received_sale_payments"
    )

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.sale.reference} - {self.amount}"


class SaleReturn(models.Model):
    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        COMPLETED = "COMPLETED", "Completed"
        CANCELLED = "CANCELLED", "Cancelled"

    class Reason(models.TextChoices):
        DEFECTIVE = "DEFECTIVE", "Defective"
        DAMAGED = "DAMAGED", "Damaged"
        WRONG_ITEM = "WRONG_ITEM", "Wrong Item"
        CUSTOMER_CHANGED_MIND = "CUSTOMER_CHANGED_MIND", "Customer Changed Mind"
        OTHER = "OTHER", "Other"

    reference = models.CharField(max_length=40, unique=True, blank=True)
    sale = models.ForeignKey(
        Sale, on_delete=models.PROTECT, related_name="returns"
    )
    reason = models.CharField(max_length=30, choices=Reason.choices)
    notes = models.TextField(blank=True)
    status = models.CharField(
        max_length=15, choices=Status.choices, default=Status.DRAFT
    )
    refund_amount = models.DecimalField(
        max_digits=14, decimal_places=2, default=0
    )
    processed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="processed_sale_returns",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    def save(self, *args, **kwargs):
        if not self.reference:
            import uuid
            self.reference = f"RET-{uuid.uuid4().hex[:12].upper()}"
        super().save(*args, **kwargs)

    def __str__(self):
        return self.reference


class SaleReturnItem(models.Model):
    sale_return = models.ForeignKey(
        SaleReturn, on_delete=models.CASCADE, related_name="items"
    )
    sale_item = models.ForeignKey(
        SaleItem, on_delete=models.PROTECT, related_name="returned_items"
    )
    quantity = models.DecimalField(max_digits=12, decimal_places=3)
    unit_price = models.DecimalField(max_digits=12, decimal_places=2)
    refund_amount = models.DecimalField(max_digits=14, decimal_places=2)

    def __str__(self):
        return f"{self.sale_return.reference} - {self.sale_item.product.name}"


class SaleRefundPayment(models.Model):
    class PaymentMethod(models.TextChoices):
        CASH = "CASH", "Cash"
        MPESA = "MPESA", "M-Pesa"
        BANK = "BANK", "Bank"
        CARD = "CARD", "Card"
        OTHER = "OTHER", "Other"

    sale_return = models.ForeignKey(
        SaleReturn, on_delete=models.CASCADE, related_name="refund_payments"
    )
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    payment_method = models.CharField(
        max_length=15, choices=PaymentMethod.choices
    )
    transaction_reference = models.CharField(max_length=100, blank=True)
    processed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
    )
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.sale_return.reference} - {self.amount}"


class CashierShift(models.Model):
    class Status(models.TextChoices):
        OPEN = "OPEN", "Open"
        CLOSED = "CLOSED", "Closed"

    cashier = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="cashier_shifts",
    )
    location = models.ForeignKey(
        "inventory.StockLocation",
        on_delete=models.PROTECT,
        related_name="cashier_shifts",
    )
    opening_cash = models.DecimalField(
        max_digits=14, decimal_places=2, default=0
    )
    expected_cash = models.DecimalField(
        max_digits=14, decimal_places=2, default=0
    )
    closing_cash = models.DecimalField(
        max_digits=14, decimal_places=2, null=True, blank=True
    )
    difference = models.DecimalField(
        max_digits=14, decimal_places=2, null=True, blank=True
    )
    notes = models.TextField(blank=True)
    status = models.CharField(
        max_length=10,
        choices=Status.choices,
        default=Status.OPEN,
    )
    opened_at = models.DateTimeField(auto_now_add=True)
    closed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-opened_at"]
        indexes = [
            models.Index(fields=["cashier", "status"]),
            models.Index(fields=["location", "status"]),
        ]

    def __str__(self):
        return f"{self.cashier} - {self.location} - {self.status}"


class CashMovement(models.Model):
    class MovementType(models.TextChoices):
        CASH_IN = "CASH_IN", "Cash In"
        CASH_OUT = "CASH_OUT", "Cash Out"
        REFUND = "REFUND", "Customer Refund"
        EXPENSE = "EXPENSE", "Business Expense"
        FLOAT_ADJUSTMENT = "FLOAT_ADJUSTMENT", "Float Adjustment"

    shift = models.ForeignKey(
        CashierShift,
        on_delete=models.PROTECT,
        related_name="movements",
    )
    movement_type = models.CharField(
        max_length=20,
        choices=MovementType.choices,
    )
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    reference = models.CharField(max_length=100, blank=True)
    description = models.TextField(blank=True)
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.movement_type} - {self.amount}"


class MpesaTransaction(models.Model):
    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        SUCCESS = "SUCCESS", "Successful"
        FAILED = "FAILED", "Failed"
        REVIEW = "REVIEW", "Requires Review"

    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
    )
    sale = models.ForeignKey(
        Sale,
        on_delete=models.PROTECT,
        related_name="mpesa_transactions",
    )
    phone_number = models.CharField(max_length=15)
    amount = models.DecimalField(max_digits=14, decimal_places=2)

    merchant_request_id = models.CharField(
        max_length=100, blank=True
    )
    checkout_request_id = models.CharField(
        max_length=100, unique=True, null=True, blank=True
    )

    status = models.CharField(
        max_length=15,
        choices=Status.choices,
        default=Status.PENDING,
        db_index=True,
    )

    result_code = models.CharField(max_length=20, blank=True)
    result_description = models.TextField(blank=True)
    mpesa_receipt_number = models.CharField(max_length=50, blank=True)

    callback_data = models.JSONField(default=dict, blank=True)
    processing_error = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.sale.reference} - {self.status}"
