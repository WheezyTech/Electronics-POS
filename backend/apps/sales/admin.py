from django.contrib import admin
from .models import Sale, SaleItem, SalePayment


class SaleItemInline(admin.TabularInline):
    model = SaleItem
    extra = 0


class SalePaymentInline(admin.TabularInline):
    model = SalePayment
    extra = 0


@admin.register(Sale)
class SaleAdmin(admin.ModelAdmin):
    list_display = (
        "reference",
        "cashier",
        "location",
        "total_amount",
        "status",
        "created_at",
    )

    list_filter = ("status", "location", "created_at")
    search_fields = ("reference", "customer_name", "customer_phone")
    readonly_fields = ("reference", "created_at", "completed_at")

    inlines = [SaleItemInline, SalePaymentInline]


@admin.register(SaleItem)
class SaleItemAdmin(admin.ModelAdmin):
    list_display = ("sale", "product", "quantity", "unit_price")


@admin.register(SalePayment)
class SalePaymentAdmin(admin.ModelAdmin):
    list_display = (
        "sale",
        "payment_method",
        "amount",
        "transaction_reference",
        "created_at",
    )