
import uuid

from django.conf import settings
from django.db import models
from django.db.models import Q, F


class StockLocation(models.Model):

    class LocationType(models.TextChoices):
        STORE = "STORE", "Retail Store"
        WAREHOUSE = "WAREHOUSE", "Warehouse"
        BRANCH = "BRANCH", "Branch"
        OTHER = "OTHER", "Other"

    name = models.CharField(max_length=150, unique=True)

    code = models.CharField(
        max_length=30,
        unique=True
    )

    location_type = models.CharField(
        max_length=20,
        choices=LocationType.choices,
        default=LocationType.STORE
    )

    address = models.TextField(blank=True)

    is_default = models.BooleanField(default=False)

    is_active = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)

    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(
                fields=["is_default"],
                condition=Q(is_default=True),
                name="one_default_stock_location"
            )
        ]

    def __str__(self):
        return f"{self.name} ({self.code})"


class StockBalance(models.Model):

    location = models.ForeignKey(
        StockLocation,
        on_delete=models.PROTECT,
        related_name="stock_balances"
    )

    product = models.ForeignKey(
        "products.Product",
        on_delete=models.PROTECT,
        related_name="stock_balances"
    )

    quantity_on_hand = models.DecimalField(
        max_digits=14,
        decimal_places=3,
        default=0
    )

    quantity_reserved = models.DecimalField(
        max_digits=14,
        decimal_places=3,
        default=0
    )

    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["product__name"]

        constraints = [
            models.UniqueConstraint(
                fields=["location", "product"],
                name="unique_product_stock_per_location"
            ),

            models.CheckConstraint(
                condition=Q(quantity_on_hand__gte=0),
                name="stock_quantity_nonnegative"
            ),

            models.CheckConstraint(
                condition=Q(quantity_reserved__gte=0),
                name="reserved_quantity_nonnegative"
            ),

            models.CheckConstraint(
                condition=Q(
                    quantity_reserved__lte=F("quantity_on_hand")
                ),
                name="reserved_not_above_stock"
            ),
        ]

    @property
    def quantity_available(self):
        return self.quantity_on_hand - self.quantity_reserved

    def __str__(self):
        return (
            f"{self.product.name} - "
            f"{self.location.name}: {self.quantity_on_hand}"
        )


class StockMovement(models.Model):

    class MovementType(models.TextChoices):
        RECEIPT = "RECEIPT", "Stock Received"
        ISSUE = "ISSUE", "Stock Issued"
        ADJUSTMENT = "ADJUSTMENT", "Stock Adjustment"
        TRANSFER_IN = "TRANSFER_IN", "Transfer Received"
        TRANSFER_OUT = "TRANSFER_OUT", "Transfer Issued"
        CUSTOMER_RETURN = "CUSTOMER_RETURN", "Customer Return"
        SUPPLIER_RETURN = "SUPPLIER_RETURN", "Supplier Return"
        DAMAGE = "DAMAGE", "Damaged Stock"

    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False
    )

    transaction_id = models.UUIDField(
        default=uuid.uuid4,
        db_index=True
    )

    balance = models.ForeignKey(
        StockBalance,
        on_delete=models.PROTECT,
        related_name="movements"
    )

    movement_type = models.CharField(
        max_length=30,
        choices=MovementType.choices
    )

    # Positive values increase stock.
    # Negative values decrease stock.
    quantity_delta = models.DecimalField(
        max_digits=14,
        decimal_places=3
    )

    quantity_before = models.DecimalField(
        max_digits=14,
        decimal_places=3
    )

    quantity_after = models.DecimalField(
        max_digits=14,
        decimal_places=3
    )

    unit_cost = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True
    )

    reference = models.CharField(
        max_length=100,
        blank=True
    )

    notes = models.TextField(blank=True)

    performed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="stock_movements"
    )

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

        constraints = [
            models.CheckConstraint(
                condition=~Q(quantity_delta=0),
                name="stock_movement_nonzero"
            ),

            models.CheckConstraint(
                condition=Q(quantity_before__gte=0),
                name="movement_before_nonnegative"
            ),

            models.CheckConstraint(
                condition=Q(quantity_after__gte=0),
                name="movement_after_nonnegative"
            ),

            models.CheckConstraint(
                condition=Q(
                    quantity_after=F("quantity_before") + F("quantity_delta")
                ),
                name="movement_quantity_consistent"
            ),
        ]

    def __str__(self):
        return (
            f"{self.movement_type} - "
            f"{self.balance.product.name} - "
            f"{self.quantity_delta}"
        )


class StocktakeSession(models.Model):

    class Status(models.TextChoices):
        IN_PROGRESS = "IN_PROGRESS", "In Progress"
        COMPLETED = "COMPLETED", "Completed"
        CANCELLED = "CANCELLED", "Cancelled"

    location = models.ForeignKey(
        StockLocation,
        on_delete=models.PROTECT,
        related_name="stocktake_sessions"
    )

    reference = models.CharField(
        max_length=50,
        unique=True
    )

    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.IN_PROGRESS
    )

    notes = models.TextField(blank=True)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="created_stocktakes"
    )

    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.reference} - {self.location.name}"


class StocktakeLine(models.Model):

    session = models.ForeignKey(
        StocktakeSession,
        on_delete=models.CASCADE,
        related_name="lines"
    )

    product = models.ForeignKey(
        "products.Product",
        on_delete=models.PROTECT,
        related_name="stocktake_lines"
    )

    system_quantity = models.DecimalField(
        max_digits=14,
        decimal_places=3,
        default=0
    )

    counted_quantity = models.DecimalField(
        max_digits=14,
        decimal_places=3,
        null=True,
        blank=True
    )

    notes = models.TextField(blank=True)

    adjustment_movement = models.ForeignKey(
        StockMovement,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="stocktake_adjustments"
    )

    @property
    def variance(self):
        if self.counted_quantity is None:
            return None

        return self.counted_quantity - self.system_quantity

    class Meta:
        ordering = ["product__name"]

        constraints = [
            models.UniqueConstraint(
                fields=["session", "product"],
                name="unique_product_per_stocktake"
            ),
            models.CheckConstraint(
                condition=Q(system_quantity__gte=0),
                name="stocktake_system_quantity_nonnegative"
            ),
            models.CheckConstraint(
                condition=(
                    Q(counted_quantity__isnull=True)
                    | Q(counted_quantity__gte=0)
                ),
                name="stocktake_counted_quantity_nonnegative"
            ),
        ]

    def __str__(self):
        return f"{self.session.reference} - {self.product.name}"
