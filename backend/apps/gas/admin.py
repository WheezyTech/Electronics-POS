from django.contrib import admin

from .models import (
    CylinderDeposit,
    GasBrand,
    GasCylinder,
    GasCylinderSize,
    GasExchange,
    GasPayment,
    GasPurchase,
    GasRefill,
    GasStock,
    GasStockMovement,
    NewCylinderSale,
    NewCylinderSaleAccessory,
)


class GasAdmin(admin.ModelAdmin):
    def has_module_permission(self, request):
        return (
            request.user.is_superuser
            or getattr(request.user, "role", None) == "ADMINISTRATOR"
            or super().has_module_permission(request)
        )

    def has_view_permission(self, request, obj=None):
        return (
            request.user.is_superuser
            or getattr(request.user, "role", None) == "ADMINISTRATOR"
            or super().has_view_permission(request, obj)
        )

    def has_add_permission(self, request):
        return (
            request.user.is_superuser
            or getattr(request.user, "role", None) == "ADMINISTRATOR"
            or super().has_add_permission(request)
        )

    def has_change_permission(self, request, obj=None):
        return (
            request.user.is_superuser
            or getattr(request.user, "role", None) == "ADMINISTRATOR"
            or super().has_change_permission(request, obj)
        )

    def has_delete_permission(self, request, obj=None):
        return (
            request.user.is_superuser
            or getattr(request.user, "role", None) == "ADMINISTRATOR"
            or super().has_delete_permission(request, obj)
        )


@admin.register(GasBrand)
class GasBrandAdmin(GasAdmin):
    list_display = ("name", "is_active", "created_at")
    list_filter = ("is_active",)
    search_fields = ("name", "compliance_details")


@admin.register(GasCylinderSize)
class GasCylinderSizeAdmin(GasAdmin):
    list_display = ("name", "weight_kg", "is_active")
    list_filter = ("is_active",)
    search_fields = ("name",)


@admin.register(GasCylinder)
class GasCylinderAdmin(GasAdmin):
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
class GasStockAdmin(GasAdmin):
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
class GasStockMovementAdmin(GasAdmin):
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


@admin.register(GasPayment)
class GasPaymentAdmin(GasAdmin):
    list_display = (
        "id",
        "payment_method",
        "amount",
        "gas_refill",
        "gas_exchange",
        "cylinder_sale",
        "transaction_reference",
        "received_by",
        "created_at",
    )
    list_filter = ("payment_method", "created_at")
    search_fields = (
        "transaction_reference",
        "gas_refill__reference",
        "gas_exchange__reference",
        "cylinder_sale__reference",
        "received_by__username",
    )
    date_hierarchy = "created_at"


@admin.register(CylinderDeposit)
class CylinderDepositAdmin(GasAdmin):
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
class GasRefillAdmin(GasAdmin):
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
class GasExchangeAdmin(GasAdmin):
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
class GasPurchaseAdmin(GasAdmin):
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
class NewCylinderSaleAdmin(GasAdmin):
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
class NewCylinderSaleAccessoryAdmin(GasAdmin):
    list_display = ("sale", "product", "quantity", "unit_price", "line_total")
    search_fields = ("sale__reference", "product__name")
