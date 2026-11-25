from django.contrib import admin

from .models import (
    CylinderDeposit,
    GasBrand,
    GasCylinder,
    GasCylinderSize,
    GasExchange,
    GasPurchase,
    GasRefill,
    GasStock,
    GasStockMovement,
    NewCylinderSale,
    NewCylinderSaleAccessory,
)


@admin.register(GasBrand)
class GasBrandAdmin(admin.ModelAdmin):
    list_display = ("name", "is_active", "created_at")
    list_filter = ("is_active",)
    search_fields = ("name", "compliance_details")


@admin.register(GasCylinderSize)
class GasCylinderSizeAdmin(admin.ModelAdmin):
    list_display = ("name", "weight_kg", "is_active")
    list_filter = ("is_active",)
    search_fields = ("name",)


class ReadOnlyGasRecordAdmin(admin.ModelAdmin):
    def get_readonly_fields(self, request, obj=None):
        return tuple(field.name for field in self.model._meta.concrete_fields)

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(GasCylinder)
class GasCylinderAdmin(ReadOnlyGasRecordAdmin):
    list_display = (
        "serial_number",
        "brand",
        "size",
        "status",
        "location",
        "active",
        "next_inspection_date",
    )
    list_filter = ("status", "active", "brand", "size", "location")
    search_fields = ("serial_number", "brand__name", "size__name")


@admin.register(GasStock)
class GasStockAdmin(ReadOnlyGasRecordAdmin):
    list_display = (
        "location",
        "brand",
        "size",
        "full_quantity",
        "empty_quantity",
        "updated_at",
    )
    list_filter = ("location", "brand", "size")
    search_fields = ("brand__name", "size__name", "location__name")


@admin.register(GasStockMovement)
class GasStockMovementAdmin(ReadOnlyGasRecordAdmin):
    list_display = (
        "created_at",
        "movement_type",
        "location",
        "brand",
        "size",
        "cylinder_status",
        "quantity_delta",
        "reference",
        "performed_by",
    )
    list_filter = ("movement_type", "cylinder_status", "location", "created_at")
    search_fields = ("reference", "transaction_id", "brand__name", "size__name")
    date_hierarchy = "created_at"


@admin.register(CylinderDeposit)
class CylinderDepositAdmin(ReadOnlyGasRecordAdmin):
    list_display = (
        "reference",
        "customer_name",
        "brand",
        "size",
        "amount",
        "status",
        "received_by",
        "created_at",
    )
    list_filter = ("status", "brand", "size", "created_at")
    search_fields = ("reference", "customer_name", "customer_phone")
    date_hierarchy = "created_at"


@admin.register(GasRefill)
class GasRefillAdmin(ReadOnlyGasRecordAdmin):
    list_display = (
        "reference",
        "created_at",
        "location",
        "brand",
        "size",
        "quantity",
        "total_amount",
        "payment_method",
        "recorded_by",
    )
    list_filter = ("location", "brand", "size", "payment_method", "created_at")
    search_fields = (
        "reference",
        "customer_name",
        "customer_phone",
        "transaction_reference",
    )
    date_hierarchy = "created_at"


@admin.register(GasExchange)
class GasExchangeAdmin(ReadOnlyGasRecordAdmin):
    list_display = (
        "reference",
        "created_at",
        "location",
        "brand",
        "size",
        "quantity",
        "refill_payment",
        "payment_method",
        "recorded_by",
    )
    list_filter = ("location", "brand", "size", "payment_method", "created_at")
    search_fields = (
        "reference",
        "customer_name",
        "customer_phone",
        "transaction_reference",
    )
    date_hierarchy = "created_at"


@admin.register(GasPurchase)
class GasPurchaseAdmin(ReadOnlyGasRecordAdmin):
    list_display = (
        "reference",
        "delivery_date",
        "supplier",
        "location",
        "brand",
        "size",
        "full_cylinders_received",
        "empty_cylinders_returned",
        "purchase_price",
    )
    list_filter = ("delivery_date", "location", "brand", "size")
    search_fields = ("reference", "supplier__name", "invoice_reference")
    date_hierarchy = "delivery_date"


@admin.register(NewCylinderSale)
class NewCylinderSaleAdmin(ReadOnlyGasRecordAdmin):
    list_display = (
        "reference",
        "created_at",
        "location",
        "brand",
        "size",
        "status",
        "quantity",
        "selling_price",
        "customer_name",
        "recorded_by",
    )
    list_filter = ("status", "location", "brand", "size", "created_at")
    search_fields = (
        "reference",
        "customer_name",
        "customer_phone",
        "transaction_reference",
    )
    date_hierarchy = "created_at"


@admin.register(NewCylinderSaleAccessory)
class NewCylinderSaleAccessoryAdmin(ReadOnlyGasRecordAdmin):
    list_display = ("sale", "product", "quantity", "unit_price", "line_total")
    search_fields = ("sale__reference", "product__name")
