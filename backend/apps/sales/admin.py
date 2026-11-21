from django.contrib import admin
from .models import (
    Sale,
    SaleItem,
    SalePayment,
    SaleRefundPayment,
    SaleReturn,
    SaleReturnItem,
    CashierShift,
    CashMovement,
    MpesaTransaction,
)


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


class SaleReturnItemInline(admin.TabularInline):
    model = SaleReturnItem
    extra = 0
    can_delete = False
    readonly_fields = (
        "sale_item",
        "quantity",
        "unit_price",
        "refund_amount",
    )


class SaleRefundPaymentInline(admin.TabularInline):
    model = SaleRefundPayment
    extra = 0
    can_delete = False
    readonly_fields = (
        "amount",
        "payment_method",
        "transaction_reference",
        "processed_by",
        "created_at",
    )


@admin.register(SaleReturn)
class SaleReturnAdmin(admin.ModelAdmin):
    list_display = (
        "reference",
        "sale",
        "reason",
        "status",
        "refund_amount",
        "processed_by",
        "created_at",
    )
    list_filter = ("status", "reason", "created_at")
    search_fields = (
        "reference",
        "sale__reference",
        "sale__customer_name",
        "sale__customer_phone",
    )
    readonly_fields = (
        "reference",
        "sale",
        "status",
        "refund_amount",
        "processed_by",
        "created_at",
        "completed_at",
    )
    inlines = [SaleReturnItemInline, SaleRefundPaymentInline]

    def get_readonly_fields(self, request, obj=None):
        readonly_fields = super().get_readonly_fields(request, obj)
        if obj is not None and obj.status == SaleReturn.Status.COMPLETED:
            return (*readonly_fields, "reason", "notes")
        return readonly_fields

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        if obj is not None and obj.status == SaleReturn.Status.COMPLETED:
            return False
        return super().has_delete_permission(request, obj)

    def get_actions(self, request):
        actions = super().get_actions(request)
        actions.pop("delete_selected", None)
        return actions


class ReadOnlySalesAdmin(admin.ModelAdmin):
    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(SaleReturnItem)
class SaleReturnItemAdmin(ReadOnlySalesAdmin):
    list_display = (
        "sale_return",
        "sale_item",
        "quantity",
        "unit_price",
        "refund_amount",
    )
    search_fields = (
        "sale_return__reference",
        "sale_item__product__name",
        "sale_item__sale__reference",
    )


@admin.register(SaleRefundPayment)
class SaleRefundPaymentAdmin(ReadOnlySalesAdmin):
    list_display = (
        "sale_return",
        "amount",
        "payment_method",
        "transaction_reference",
        "processed_by",
        "created_at",
    )
    list_filter = ("payment_method", "created_at")
    search_fields = (
        "sale_return__reference",
        "transaction_reference",
    )


@admin.register(CashierShift)
class CashierShiftAdmin(ReadOnlySalesAdmin):
    list_display = (
        "cashier",
        "location",
        "status",
        "opening_cash",
        "expected_cash",
        "closing_cash",
        "opened_at",
        "closed_at",
    )
    list_filter = ("status", "location", "opened_at")
    search_fields = ("cashier__username", "location__name")


@admin.register(CashMovement)
class CashMovementAdmin(ReadOnlySalesAdmin):
    list_display = (
        "shift",
        "movement_type",
        "amount",
        "reference",
        "recorded_by",
        "created_at",
    )
    list_filter = ("movement_type", "created_at")
    search_fields = ("reference", "shift__cashier__username")


@admin.register(MpesaTransaction)
class MpesaTransactionAdmin(ReadOnlySalesAdmin):
    list_display = (
        "sale",
        "phone_number",
        "amount",
        "status",
        "mpesa_receipt_number",
        "created_at",
        "updated_at",
    )
    list_filter = ("status", "created_at")
    search_fields = (
        "sale__reference",
        "phone_number",
        "checkout_request_id",
        "mpesa_receipt_number",
    )
    readonly_fields = (
        "sale",
        "phone_number",
        "amount",
        "merchant_request_id",
        "checkout_request_id",
        "status",
        "result_code",
        "result_description",
        "mpesa_receipt_number",
        "callback_data",
        "processing_error",
        "created_at",
        "updated_at",
    )