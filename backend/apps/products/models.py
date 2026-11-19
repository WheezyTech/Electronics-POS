
from django.conf import settings
from django.db import models
from django.db.models import Q, F


class Category(models.Model):
    name = models.CharField(max_length=150, unique=True)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = "Categories"
        ordering = ["name"]

    def __str__(self):
        return self.name


class ProductType(models.Model):
    name = models.CharField(max_length=150, unique=True)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class Brand(models.Model):
    name = models.CharField(max_length=150, unique=True)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class Unit(models.Model):
    name = models.CharField(max_length=100, unique=True)
    abbreviation = models.CharField(max_length=20, unique=True)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} ({self.abbreviation})"


class Product(models.Model):

    name = models.CharField(max_length=200)

    sku = models.CharField(
        max_length=100,
        unique=True
    )

    category = models.ForeignKey(
        Category,
        on_delete=models.PROTECT,
        related_name="products"
    )

    product_type = models.ForeignKey(
        ProductType,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="products"
    )

    brand = models.ForeignKey(
        Brand,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="products"
    )

    model_number = models.CharField(
        max_length=150,
        blank=True
    )

    description = models.TextField(blank=True)

    specifications = models.JSONField(default=dict, blank=True)

    unit = models.ForeignKey(
        Unit,
        on_delete=models.PROTECT,
        related_name="products"
    )

    cost_price = models.DecimalField(
        max_digits=12,
        decimal_places=2
    )

    selling_price = models.DecimalField(
        max_digits=12,
        decimal_places=2
    )

    wholesale_price = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True
    )

    minimum_selling_price = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0
    )

    warranty_months = models.PositiveIntegerField(default=0)

    reorder_level = models.PositiveIntegerField(default=5)

    is_active = models.BooleanField(default=True)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="created_products"
    )

    created_at = models.DateTimeField(auto_now_add=True)

    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]
        constraints = [
            models.CheckConstraint(
                condition=Q(
                    minimum_selling_price__lte=F("selling_price")
                ),
                name="product_min_price_lte_selling_price"
            ),
        ]

    def __str__(self):
        return f"{self.name} ({self.sku})"


class ProductBarcode(models.Model):

    class BarcodeType(models.TextChoices):
        EAN13 = "EAN13", "EAN-13"
        EAN8 = "EAN8", "EAN-8"
        UPC_A = "UPC_A", "UPC-A"
        UPC_E = "UPC_E", "UPC-E"
        CODE128 = "CODE128", "Code 128"
        QR = "QR", "QR Code"
        OTHER = "OTHER", "Other"

    product = models.ForeignKey(
        Product,
        on_delete=models.CASCADE,
        related_name="barcodes"
    )

    barcode = models.CharField(
        max_length=150,
        unique=True
    )

    barcode_type = models.CharField(
        max_length=20,
        choices=BarcodeType.choices,
        default=BarcodeType.OTHER
    )

    is_primary = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-is_primary", "barcode"]

    def __str__(self):
        return f"{self.barcode} - {self.product.name}"

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)

        if self.is_primary:
            ProductBarcode.objects.filter(
                product=self.product
            ).exclude(pk=self.pk).update(is_primary=False)
