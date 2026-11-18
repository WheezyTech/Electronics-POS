
from django.contrib import admin

from .models import (
    StockLocation,
    StockBalance,
    StockMovement,
)
from .models import StocktakeSession, StocktakeLine

@admin.register(StockLocation)
class StockLocationAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "code",
        "location_type",
        "is_default",
        "is_active",
    )

    search_fields = ("name", "code")
    list_filter = ("location_type", "is_active", "is_default")


@admin.register(StockBalance)
class StockBalanceAdmin(admin.ModelAdmin):
    list_display = (
        "product",
        "location",
        "quantity_on_hand",
        "quantity_reserved",
        "updated_at",
    )

    search_fields = (
        "product__name",
        "product__sku",
        "location__name",
    )

    list_filter = ("location",)

    readonly_fields = (
        "product",
        "location",
        "quantity_on_hand",
        "quantity_reserved",
        "updated_at",
    )

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(StockMovement)
class StockMovementAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "movement_type",
        "balance",
        "quantity_delta",
        "quantity_before",
        "quantity_after",
        "performed_by",
        "created_at",
    )

    search_fields = (
        "balance__product__name",
        "balance__product__sku",
        "reference",
    )

    list_filter = (
        "movement_type",
        "created_at",
        "balance__location",
    )

    readonly_fields = (
        "id",
        "transaction_id",
        "balance",
        "movement_type",
        "quantity_delta",
        "quantity_before",
        "quantity_after",
        "unit_cost",
        "reference",
        "notes",
        "performed_by",
        "created_at",
    )

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

@admin.register(StocktakeSession)
class StocktakeSessionAdmin(admin.ModelAdmin):
    list_display = (
        "reference",
        "location",
        "status",
        "created_by",
        "created_at",
        "completed_at",
    )

    list_filter = ("status", "location")
    search_fields = ("reference", "location__name")
    readonly_fields = ("created_at", "completed_at")


@admin.register(StocktakeLine)
class StocktakeLineAdmin(admin.ModelAdmin):
    list_display = (
        "session",
        "product",
        "system_quantity",
        "counted_quantity",
    )

    search_fields = (
        "session__reference",
        "product__name",
        "product__sku",
    )

    readonly_fields = ("system_quantity",)