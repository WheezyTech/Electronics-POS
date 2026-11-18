
from django.contrib import admin

from .models import (
    Category,
    Brand,
    Unit,
    Product,
    ProductBarcode,
)


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ("name", "is_active", "created_at")
    search_fields = ("name",)
    list_filter = ("is_active",)


@admin.register(Brand)
class BrandAdmin(admin.ModelAdmin):
    list_display = ("name", "is_active", "created_at")
    search_fields = ("name",)
    list_filter = ("is_active",)


@admin.register(Unit)
class UnitAdmin(admin.ModelAdmin):
    list_display = ("name", "abbreviation", "is_active")
    search_fields = ("name", "abbreviation")


class ProductBarcodeInline(admin.TabularInline):
    model = ProductBarcode
    extra = 1


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "sku",
        "category",
        "brand",
        "cost_price",
        "selling_price",
        "is_active",
    )

    search_fields = (
        "name",
        "sku",
        "model_number",
        "barcodes__barcode",
    )

    list_filter = (
        "category",
        "brand",
        "is_active",
    )

    inlines = [ProductBarcodeInline]


@admin.register(ProductBarcode)
class ProductBarcodeAdmin(admin.ModelAdmin):
    list_display = (
        "barcode",
        "product",
        "barcode_type",
        "is_primary",
    )
    search_fields = ("barcode", "product__name", "product__sku")
    list_filter = ("barcode_type", "is_primary")
