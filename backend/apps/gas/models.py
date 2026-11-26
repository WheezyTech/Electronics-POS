import uuid
from decimal import Decimal

from django.conf import settings
from django.db import models
from django.db.models import F, Q
from django.core.validators import MinValueValidator

from apps.inventory.models import StockLocation
from apps.purchases.models import Supplier
from apps.products.models import Product


class GasBrand(models.Model):
    name = models.CharField(max_length=100, unique=True)
    is_active = models.BooleanField(default=True)
    compliance_details = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class GasCylinderSize(models.Model):
    name = models.CharField(max_length=30, unique=True)
    weight_kg = models.DecimalField(max_digits=8, decimal_places=2)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["weight_kg"]

    def __str__(self):
        return self.name


class GasCylinder(models.Model):
    class Status(models.TextChoices):
        FULL = "FULL", "Full"
        EMPTY = "EMPTY", "Empty"
        IN_MAINTENANCE = "IN_MAINTENANCE", "In Maintenance"

    serial_number = models.CharField(max_length=100, unique=True)
    brand = models.ForeignKey(GasBrand, on_delete=models.PROTECT, related_name="cylinders")
    size = models.ForeignKey(GasCylinderSize, on_delete=models.PROTECT, related_name="cylinders")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.EMPTY)
    location = models.ForeignKey(StockLocation, on_delete=models.PROTECT, related_name="gas_cylinders")
    inspection_date = models.DateField(null=True, blank=True)
    next_inspection_date = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True)
    active = models.BooleanField(default=True)

    class Meta:
        ordering = ["serial_number"]
        indexes = [models.Index(fields=["brand", "size", "status"])]

    def __str__(self):
        return f"{self.brand.name} {self.size.name} - {self.serial_number}"


class GasStock(models.Model):
    location = models.ForeignKey(StockLocation, on_delete=models.PROTECT, related_name="gas_stocks")
    brand = models.ForeignKey(GasBrand, on_delete=models.PROTECT, related_name="stocks")
    size = models.ForeignKey(GasCylinderSize, on_delete=models.PROTECT, related_name="stocks")
    full_quantity = models.PositiveIntegerField(default=0)
    empty_quantity = models.PositiveIntegerField(default=0)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["location", "brand", "size"], name="unique_gas_stock"),
        ]
        indexes = [models.Index(fields=["location", "brand", "size"])]

    def __str__(self):
        return f"{self.brand.name} {self.size.name} - F{self.full_quantity}/E{self.empty_quantity}"


class GasStockMovement(models.Model):
    class MovementType(models.TextChoices):
        PURCHASE_FULL = "PURCHASE_FULL", "Full Cylinders Purchased"
        PURCHASE_EMPTY = "PURCHASE_EMPTY", "Empty Cylinders Purchased"
        REFILL_ISSUE = "REFILL_ISSUE", "Refill Full Cylinder Issued"
        REFILL_RETURN = "REFILL_RETURN", "Customer Empty Cylinder Returned"
        EXCHANGE_RECEIVED = "EXCHANGE_RECEIVED", "Customer Empty Cylinder Received"
        EXCHANGE_ISSUE = "EXCHANGE_ISSUE", "Full Cylinder Issued"
        NEW_CYLINDER_SALE = "NEW_CYLINDER_SALE", "New Cylinder Sold"
        EMPTY_CYLINDER_SALE = "EMPTY_CYLINDER_SALE", "Empty Cylinder Sold"
        ADJUSTMENT = "ADJUSTMENT", "Authorized Stock Adjustment"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    transaction_id = models.UUIDField(default=uuid.uuid4, db_index=True)
    location = models.ForeignKey(StockLocation, on_delete=models.PROTECT, related_name="gas_movements")
    brand = models.ForeignKey(GasBrand, on_delete=models.PROTECT)
    size = models.ForeignKey(GasCylinderSize, on_delete=models.PROTECT)
    cylinder_status = models.CharField(max_length=10, choices=[("FULL", "Full"), ("EMPTY", "Empty")])
    movement_type = models.CharField(max_length=30, choices=MovementType.choices)
    quantity_delta = models.IntegerField()
    quantity_before = models.PositiveIntegerField()
    quantity_after = models.PositiveIntegerField()
    reference = models.CharField(max_length=100, blank=True)
    notes = models.TextField(blank=True)
    performed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.CheckConstraint(condition=~Q(quantity_delta=0), name="gas_movement_nonzero"),
            models.CheckConstraint(
                condition=Q(quantity_after=F("quantity_before") + F("quantity_delta")),
                name="gas_movement_consistent",
            ),
        ]


class CylinderDeposit(models.Model):
    class Status(models.TextChoices):
        OUTSTANDING = "OUTSTANDING", "Outstanding"
        REFUNDED = "REFUNDED", "Refunded"
        FORFEITED = "FORFEITED", "Forfeited"

    reference = models.CharField(max_length=50, unique=True)
    customer_name = models.CharField(max_length=150)
    customer_phone = models.CharField(max_length=30, blank=True)
    brand = models.ForeignKey(GasBrand, on_delete=models.PROTECT)
    size = models.ForeignKey(GasCylinderSize, on_delete=models.PROTECT)
    cylinder = models.ForeignKey(GasCylinder, on_delete=models.PROTECT, null=True, blank=True)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.OUTSTANDING)
    received_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    refunded_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]


class GasRefill(models.Model):
    class PaymentMethod(models.TextChoices):
        CASH = "CASH", "Cash"
        MPESA = "MPESA", "M-Pesa"
        BANK = "BANK", "Bank Transfer"
        CARD = "CARD", "Card"
        OTHER = "OTHER", "Other"

    reference = models.CharField(max_length=50, unique=True)
    location = models.ForeignKey(StockLocation, on_delete=models.PROTECT)
    brand = models.ForeignKey(GasBrand, on_delete=models.PROTECT)
    customer_brand = models.ForeignKey(
        GasBrand,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="refills_as_customer_cylinder",
    )
    size = models.ForeignKey(GasCylinderSize, on_delete=models.PROTECT)
    customer_name = models.CharField(max_length=150, blank=True)
    customer_phone = models.CharField(max_length=30, blank=True)
    quantity = models.PositiveIntegerField(default=1)
    standard_option = models.CharField(max_length=100, blank=True)
    refill_price = models.DecimalField(max_digits=12, decimal_places=2)
    total_amount = models.DecimalField(max_digits=14, decimal_places=2)
    tax_rate = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal("0.00"))
    tax_amount = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))
    tax_included = models.BooleanField(default=False)
    payment_method = models.CharField(
        max_length=20, choices=PaymentMethod.choices, blank=True, default=""
    )
    transaction_reference = models.CharField(max_length=100, blank=True)
    recorded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]


class GasExchange(models.Model):
    reference = models.CharField(max_length=50, unique=True)
    location = models.ForeignKey(StockLocation, on_delete=models.PROTECT)
    brand = models.ForeignKey(GasBrand, on_delete=models.PROTECT)
    size = models.ForeignKey(GasCylinderSize, on_delete=models.PROTECT)
    customer_name = models.CharField(max_length=150)
    customer_phone = models.CharField(max_length=30, blank=True)
    quantity = models.PositiveIntegerField(default=1)
    refill_payment = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))
    tax_rate = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal("0.00"))
    tax_amount = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))
    tax_included = models.BooleanField(default=False)
    payment_method = models.CharField(
        max_length=20,
        choices=GasRefill.PaymentMethod.choices,
        blank=True,
        default="",
    )
    transaction_reference = models.CharField(max_length=100, blank=True)
    recorded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]


class GasPurchase(models.Model):
    reference = models.CharField(max_length=50, unique=True)
    supplier = models.ForeignKey(Supplier, on_delete=models.PROTECT, related_name="gas_purchases")
    location = models.ForeignKey(StockLocation, on_delete=models.PROTECT)
    brand = models.ForeignKey(GasBrand, on_delete=models.PROTECT)
    size = models.ForeignKey(GasCylinderSize, on_delete=models.PROTECT)
    full_cylinders_received = models.PositiveIntegerField(default=0)
    empty_cylinders_returned = models.PositiveIntegerField(default=0)
    purchase_price = models.DecimalField(max_digits=14, decimal_places=2)
    delivery_date = models.DateField()
    invoice_reference = models.CharField(max_length=100, blank=True)
    compliance_reference = models.CharField(max_length=100, blank=True)
    recorded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]


class NewCylinderSale(models.Model):
    reference = models.CharField(max_length=50, unique=True)
    location = models.ForeignKey(StockLocation, on_delete=models.PROTECT)
    brand = models.ForeignKey(GasBrand, on_delete=models.PROTECT)
    size = models.ForeignKey(GasCylinderSize, on_delete=models.PROTECT)
    status = models.CharField(
        max_length=10,
        choices=[("FULL", "Full"), ("EMPTY", "Empty"), ("COMPLETE", "Complete")],
    )
    quantity = models.PositiveIntegerField(default=1)
    selling_price = models.DecimalField(max_digits=14, decimal_places=2)
    accessories_total = models.DecimalField(
        max_digits=14, decimal_places=2, default=Decimal("0.00")
    )
    deposit_amount = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))
    tax_rate = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal("0.00"))
    tax_amount = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))
    tax_included = models.BooleanField(default=False)
    includes_gas = models.BooleanField(default=True)
    customer_name = models.CharField(max_length=150, blank=True)
    customer_phone = models.CharField(max_length=30, blank=True)
    accessories = models.JSONField(default=list, blank=True)
    payment_method = models.CharField(
        max_length=20,
        choices=GasRefill.PaymentMethod.choices,
        blank=True,
        default="",
    )
    transaction_reference = models.CharField(max_length=100, blank=True)
    recorded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    created_at = models.DateTimeField(auto_now_add=True)

    @property
    def total_amount(self):
        return self.selling_price * self.quantity + self.accessories_total


class GasPayment(models.Model):
    class PaymentMethod(models.TextChoices):
        CASH = "CASH", "Cash"
        MPESA = "MPESA", "M-Pesa"
        BANK = "BANK", "Bank Transfer"
        CARD = "CARD", "Card"
        OTHER = "OTHER", "Other"

    gas_refill = models.ForeignKey(
        GasRefill,
        on_delete=models.CASCADE,
        related_name="payments",
        null=True,
        blank=True,
    )
    gas_exchange = models.ForeignKey(
        GasExchange,
        on_delete=models.CASCADE,
        related_name="payments",
        null=True,
        blank=True,
    )
    cylinder_sale = models.ForeignKey(
        NewCylinderSale,
        on_delete=models.CASCADE,
        related_name="payments",
        null=True,
        blank=True,
    )
    payment_method = models.CharField(max_length=20, choices=PaymentMethod.choices)
    amount = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.01"))],
    )
    transaction_reference = models.CharField(max_length=100, blank=True)
    received_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="received_gas_payments",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=(
                    Q(gas_refill__isnull=False, gas_exchange__isnull=True, cylinder_sale__isnull=True)
                    | Q(gas_refill__isnull=True, gas_exchange__isnull=False, cylinder_sale__isnull=True)
                    | Q(gas_refill__isnull=True, gas_exchange__isnull=True, cylinder_sale__isnull=False)
                ),
                name="gas_payment_one_transaction",
            ),
        ]
        ordering = ["created_at"]


class NewCylinderSaleAccessory(models.Model):
    sale = models.ForeignKey(
        NewCylinderSale,
        on_delete=models.CASCADE,
        related_name="accessory_items",
    )
    product = models.ForeignKey(Product, on_delete=models.PROTECT)
    quantity = models.PositiveIntegerField()
    unit_price = models.DecimalField(max_digits=14, decimal_places=2)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["sale", "product"],
                name="unique_product_per_cylinder_sale",
            ),
        ]

    @property
    def line_total(self):
        return self.unit_price * self.quantity
