
from django.db import models
from django.conf import settings

import uuid
from decimal import Decimal

from django.db import models
from django.core.validators import MinValueValidator

from apps.products.models import Product
from apps.inventory.models import StockLocation


class Supplier(models.Model):

    name = models.CharField(max_length=200)

    contact_person = models.CharField(
        max_length=150,
        blank=True
    )

    phone_number = models.CharField(
        max_length=20,
        db_index=True
    )

    alternative_phone = models.CharField(
        max_length=20,
        blank=True
    )

    email = models.EmailField(blank=True)

    kra_pin = models.CharField(
        max_length=20,
        blank=True
    )

    address = models.TextField(blank=True)

    city = models.CharField(
        max_length=100,
        blank=True
    )

    payment_terms = models.CharField(
        max_length=150,
        blank=True,
        help_text="Example: Cash, 7 days, 30 days"
    )

    opening_balance = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        default=0
    )

    notes = models.TextField(blank=True)

    is_active = models.BooleanField(default=True)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_suppliers"
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]
        indexes = [
            models.Index(fields=["name"]),
            models.Index(fields=["is_active"]),
        ]

    def __str__(self):
        return self.name

class PurchaseOrder(models.Model):

    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        SUBMITTED = "SUBMITTED", "Submitted"
        APPROVED = "APPROVED", "Approved"
        PARTIALLY_RECEIVED = "PARTIALLY_RECEIVED", "Partially Received"
        COMPLETED = "COMPLETED", "Completed"
        CANCELLED = "CANCELLED", "Cancelled"

    reference = models.CharField(
        max_length=50,
        unique=True,
        editable=False
    )

    supplier = models.ForeignKey(
        Supplier,
        on_delete=models.PROTECT,
        related_name="purchase_orders"
    )

    destination = models.ForeignKey(
        StockLocation,
        on_delete=models.PROTECT,
        related_name="purchase_orders"
    )

    status = models.CharField(
        max_length=30,
        choices=Status.choices,
        default=Status.DRAFT,
        db_index=True
    )

    order_date = models.DateField(auto_now_add=True)

    expected_delivery_date = models.DateField(
        null=True,
        blank=True
    )

    notes = models.TextField(blank=True)

    subtotal = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        default=Decimal("0.00")
    )

    total_discount = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        default=Decimal("0.00")
    )

    total_tax = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        default=Decimal("0.00")
    )

    grand_total = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        default=Decimal("0.00")
    )

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="created_purchase_orders"
    )

    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="approved_purchase_orders"
    )

    approved_at = models.DateTimeField(
        null=True,
        blank=True
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["status", "created_at"]),
            models.Index(fields=["supplier", "order_date"]),
        ]

    def save(self, *args, **kwargs):
        if not self.reference:
            self.reference = f"PO-{uuid.uuid4().hex[:10].upper()}"

        super().save(*args, **kwargs)

    def __str__(self):
        return self.reference

    def recalculate_totals(self):
        items = self.items.all()

        subtotal = Decimal("0.00")
        discount = Decimal("0.00")
        tax = Decimal("0.00")

        for item in items:
            subtotal += item.subtotal
            discount += item.discount_amount
            tax += item.tax_amount

        self.subtotal = subtotal
        self.total_discount = discount
        self.total_tax = tax
        self.grand_total = subtotal - discount + tax

        self.save(update_fields=[
            "subtotal",
            "total_discount",
            "total_tax",
            "grand_total",
            "updated_at",
        ])


class PurchaseOrderItem(models.Model):

    purchase_order = models.ForeignKey(
        PurchaseOrder,
        on_delete=models.CASCADE,
        related_name="items"
    )

    product = models.ForeignKey(
        Product,
        on_delete=models.PROTECT,
        related_name="purchase_order_items"
    )

    quantity = models.DecimalField(
        max_digits=14,
        decimal_places=3,
        validators=[MinValueValidator(Decimal("0.001"))]
    )

    received_quantity = models.DecimalField(
        max_digits=14,
        decimal_places=3,
        default=Decimal("0.000")
    )

    unit_cost = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.01"))]
    )

    discount_amount = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        default=Decimal("0.00")
    )

    tax_amount = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        default=Decimal("0.00")
    )

    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["id"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(quantity__gt=0),
                name="po_item_quantity_positive"
            ),
            models.CheckConstraint(
                condition=models.Q(received_quantity__gte=0),
                name="po_item_received_nonnegative"
            ),
            models.CheckConstraint(
                condition=models.Q(
                    received_quantity__lte=models.F("quantity")
                ),
                name="po_item_received_lte_ordered"
            ),
            models.CheckConstraint(
                condition=models.Q(discount_amount__gte=0),
                name="po_item_discount_nonnegative"
            ),
            models.CheckConstraint(
                condition=models.Q(tax_amount__gte=0),
                name="po_item_tax_nonnegative"
            ),
        ]

    @property
    def subtotal(self):
        return self.quantity * self.unit_cost

    @property
    def remaining_quantity(self):
        return self.quantity - self.received_quantity

    @property
    def line_total(self):
        return self.subtotal - self.discount_amount + self.tax_amount

    def __str__(self):
        return f"{self.purchase_order.reference} - {self.product.name}"


class GoodsReceivedNote(models.Model):

    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        POSTED = "POSTED", "Posted"
        CANCELLED = "CANCELLED", "Cancelled"

    reference = models.CharField(
        max_length=50,
        unique=True,
        editable=False
    )

    purchase_order = models.ForeignKey(
        PurchaseOrder,
        on_delete=models.PROTECT,
        related_name="goods_received_notes"
    )

    supplier_delivery_note = models.CharField(
        max_length=100,
        blank=True
    )

    supplier_invoice_number = models.CharField(
        max_length=100,
        blank=True
    )

    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.DRAFT,
        db_index=True
    )

    notes = models.TextField(blank=True)

    received_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="goods_received_notes"
    )

    posted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="posted_goods_received_notes"
    )

    received_at = models.DateTimeField(auto_now_add=True)

    posted_at = models.DateTimeField(
        null=True,
        blank=True
    )

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def save(self, *args, **kwargs):
        if not self.reference:
            self.reference = (
                f"GRN-{uuid.uuid4().hex[:10].upper()}"
            )

        super().save(*args, **kwargs)

    def __str__(self):
        return self.reference


class GoodsReceivedItem(models.Model):

    goods_received_note = models.ForeignKey(
        GoodsReceivedNote,
        on_delete=models.CASCADE,
        related_name="items"
    )

    purchase_order_item = models.ForeignKey(
        PurchaseOrderItem,
        on_delete=models.PROTECT,
        related_name="goods_received_items"
    )

    quantity_received = models.DecimalField(
        max_digits=14,
        decimal_places=3,
        validators=[
            MinValueValidator(Decimal("0.001"))
        ]
    )

    unit_cost = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        validators=[
            MinValueValidator(Decimal("0.01"))
        ]
    )

    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["id"]

        constraints = [
            models.CheckConstraint(
                condition=models.Q(quantity_received__gt=0),
                name="grn_item_quantity_positive"
            ),
            models.CheckConstraint(
                condition=models.Q(unit_cost__gt=0),
                name="grn_item_unit_cost_positive"
            ),
        ]

    @property
    def product(self):
        return self.purchase_order_item.product

    @property
    def line_total(self):
        return self.quantity_received * self.unit_cost

    def __str__(self):
        return (
            f"{self.goods_received_note.reference} - "
            f"{self.purchase_order_item.product.name}"
        )


class SupplierReturn(models.Model):

    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        POSTED = "POSTED", "Posted"
        CANCELLED = "CANCELLED", "Cancelled"

    class Reason(models.TextChoices):
        DEFECTIVE = "DEFECTIVE", "Defective Product"
        DAMAGED = "DAMAGED", "Damaged Product"
        WRONG_ITEM = "WRONG_ITEM", "Wrong Product Delivered"
        EXCESS = "EXCESS", "Excess Quantity"
        WARRANTY = "WARRANTY", "Warranty Return"
        OTHER = "OTHER", "Other"

    class Resolution(models.TextChoices):
        PENDING = "PENDING", "Pending"
        REFUND = "REFUND", "Refund"
        REPLACEMENT = "REPLACEMENT", "Replacement"
        CREDIT_NOTE = "CREDIT_NOTE", "Credit Note"
        REJECTED = "REJECTED", "Rejected"

    reference = models.CharField(
        max_length=50,
        unique=True,
        editable=False
    )

    supplier = models.ForeignKey(
        Supplier,
        on_delete=models.PROTECT,
        related_name="supplier_returns"
    )

    original_grn = models.ForeignKey(
        GoodsReceivedNote,
        on_delete=models.PROTECT,
        related_name="supplier_returns"
    )

    reason = models.CharField(
        max_length=30,
        choices=Reason.choices
    )

    supplier_reference = models.CharField(
        max_length=100,
        blank=True,
        help_text="Supplier's return authorization or reference number"
    )

    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.DRAFT,
        db_index=True
    )

    resolution = models.CharField(
        max_length=20,
        choices=Resolution.choices,
        default=Resolution.PENDING
    )

    notes = models.TextField(blank=True)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="created_supplier_returns"
    )

    posted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="posted_supplier_returns"
    )

    created_at = models.DateTimeField(auto_now_add=True)

    posted_at = models.DateTimeField(
        null=True,
        blank=True
    )

    class Meta:
        ordering = ["-created_at"]

    def save(self, *args, **kwargs):
        if not self.reference:
            self.reference = (
                f"SR-{uuid.uuid4().hex[:10].upper()}"
            )

        super().save(*args, **kwargs)

    def __str__(self):
        return self.reference

    @property
    def total_value(self):
        return sum(
            (
                item.line_total
                for item in self.items.all()
            ),
            start=Decimal("0.00")
        )


class SupplierReturnItem(models.Model):

    supplier_return = models.ForeignKey(
        SupplierReturn,
        on_delete=models.CASCADE,
        related_name="items"
    )

    original_received_item = models.ForeignKey(
        GoodsReceivedItem,
        on_delete=models.PROTECT,
        related_name="supplier_return_items"
    )

    quantity_returned = models.DecimalField(
        max_digits=14,
        decimal_places=3,
        validators=[
            MinValueValidator(Decimal("0.001"))
        ]
    )

    unit_cost = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        validators=[
            MinValueValidator(Decimal("0.01"))
        ]
    )

    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["id"]

        constraints = [
            models.CheckConstraint(
                condition=models.Q(quantity_returned__gt=0),
                name="supplier_return_quantity_positive"
            ),
            models.CheckConstraint(
                condition=models.Q(unit_cost__gt=0),
                name="supplier_return_unit_cost_positive"
            ),
            models.UniqueConstraint(
                fields=[
                    "supplier_return",
                    "original_received_item"
                ],
                name="unique_received_item_per_supplier_return"
            ),
        ]

    @property
    def product(self):
        return self.original_received_item.purchase_order_item.product

    @property
    def line_total(self):
        return self.quantity_returned * self.unit_cost

    def __str__(self):
        return (
            f"{self.supplier_return.reference} - "
            f"{self.product.name}"
        )


class SupplierPayment(models.Model):

    class PaymentMethod(models.TextChoices):
        CASH = "CASH", "Cash"
        MPESA = "MPESA", "M-Pesa"
        BANK = "BANK", "Bank Transfer"
        CHEQUE = "CHEQUE", "Cheque"
        OTHER = "OTHER", "Other"

    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        POSTED = "POSTED", "Posted"
        CANCELLED = "CANCELLED", "Cancelled"

    reference = models.CharField(
        max_length=50,
        unique=True,
        editable=False
    )

    supplier = models.ForeignKey(
        Supplier,
        on_delete=models.PROTECT,
        related_name="payments"
    )

    goods_received_note = models.ForeignKey(
        GoodsReceivedNote,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="supplier_payments"
    )

    amount = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.01"))]
    )

    payment_method = models.CharField(
        max_length=20,
        choices=PaymentMethod.choices
    )

    payment_reference = models.CharField(
        max_length=100,
        blank=True
    )

    payment_date = models.DateField()

    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.DRAFT,
        db_index=True
    )

    supplier_invoice = models.ForeignKey(
        "SupplierInvoice",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="payments"
    )
    notes = models.TextField(blank=True)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="created_supplier_payments"
    )

    posted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="posted_supplier_payments"
    )

    created_at = models.DateTimeField(auto_now_add=True)
    posted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-payment_date", "-created_at"]

    def save(self, *args, **kwargs):
        if not self.reference:
            self.reference = f"SP-{uuid.uuid4().hex[:12].upper()}"

        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.reference} - {self.supplier.name}"


class SupplierInvoice(models.Model):

    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        POSTED = "POSTED", "Posted"
        CANCELLED = "CANCELLED", "Cancelled"

    supplier = models.ForeignKey(
        Supplier,
        on_delete=models.PROTECT,
        related_name="invoices"
    )

    goods_received_note = models.ForeignKey(
        GoodsReceivedNote,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="supplier_invoices"
    )

    invoice_number = models.CharField(max_length=100)
    invoice_date = models.DateField()
    due_date = models.DateField(null=True, blank=True)

    subtotal = models.DecimalField(
        max_digits=14, decimal_places=2,
        default=Decimal("0.00")
    )
    tax_amount = models.DecimalField(
        max_digits=14, decimal_places=2,
        default=Decimal("0.00")
    )
    discount_amount = models.DecimalField(
        max_digits=14, decimal_places=2,
        default=Decimal("0.00")
    )
    total_amount = models.DecimalField(
        max_digits=14, decimal_places=2,
        validators=[MinValueValidator(Decimal("0.01"))]
    )

    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.DRAFT,
        db_index=True
    )

    notes = models.TextField(blank=True)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="created_supplier_invoices"
    )
    posted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="posted_supplier_invoices"
    )

    created_at = models.DateTimeField(auto_now_add=True)
    posted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-invoice_date", "-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["supplier", "invoice_number"],
                name="unique_supplier_invoice_number"
            )
        ]

    @property
    def amount_paid(self):
        return self.payments.filter(
            status=SupplierPayment.Status.POSTED
        ).aggregate(total=Sum("amount"))["total"] or Decimal("0.00")

    @property
    def outstanding_balance(self):
        return self.total_amount - self.amount_paid

    @property
    def is_overdue(self):
        return (
            self.status == self.Status.POSTED
            and self.due_date is not None
            and self.due_date < timezone.localdate()
            and self.outstanding_balance > 0
        )

    def __str__(self):
        return f"{self.supplier.name} - {self.invoice_number}"
