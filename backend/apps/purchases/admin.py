
from django.contrib import admin
from .models import Supplier
from .models import PurchaseOrder, PurchaseOrderItem
from .models import GoodsReceivedNote, GoodsReceivedItem
from .models import SupplierReturn, SupplierReturnItem
from .models import SupplierPayment
from .models import SupplierInvoice

@admin.register(Supplier)
class SupplierAdmin(admin.ModelAdmin):

    list_display = (
        "name",
        "contact_person",
        "phone_number",
        "email",
        "city",
        "is_active",
    )

    list_filter = (
        "is_active",
        "city",
    )

    search_fields = (
        "name",
        "phone_number",
        "email",
        "kra_pin",
    )

    readonly_fields = (
        "created_at",
        "updated_at",
    )

    ordering = ("name",)


class PurchaseOrderItemInline(admin.TabularInline):
    model = PurchaseOrderItem
    extra = 0
    readonly_fields = ("received_quantity",)


@admin.register(PurchaseOrder)
class PurchaseOrderAdmin(admin.ModelAdmin):

    list_display = (
        "reference",
        "supplier",
        "destination",
        "status",
        "grand_total",
        "order_date",
        "created_by",
    )

    list_filter = (
        "status",
        "order_date",
        "supplier",
    )

    search_fields = (
        "reference",
        "supplier__name",
    )

    readonly_fields = (
        "reference",
        "subtotal",
        "total_discount",
        "total_tax",
        "grand_total",
        "created_at",
        "updated_at",
        "approved_at",
    )

    inlines = [PurchaseOrderItemInline]


@admin.register(PurchaseOrderItem)
class PurchaseOrderItemAdmin(admin.ModelAdmin):

    list_display = (
        "purchase_order",
        "product",
        "quantity",
        "received_quantity",
        "unit_cost",
    )

    list_filter = ("purchase_order__status",)
    search_fields = (
        "purchase_order__reference",
        "product__name",
        "product__sku",
    )


class GoodsReceivedItemInline(admin.TabularInline):

    model = GoodsReceivedItem
    extra = 0


@admin.register(GoodsReceivedNote)
class GoodsReceivedNoteAdmin(admin.ModelAdmin):

    list_display = (
        "reference",
        "purchase_order",
        "status",
        "received_by",
        "received_at",
        "posted_at",
    )

    list_filter = (
        "status",
        "received_at",
    )

    search_fields = (
        "reference",
        "purchase_order__reference",
        "supplier_delivery_note",
        "supplier_invoice_number",
    )

    readonly_fields = (
        "reference",
        "received_by",
        "posted_by",
        "received_at",
        "posted_at",
    )

    inlines = [GoodsReceivedItemInline]


@admin.register(GoodsReceivedItem)
class GoodsReceivedItemAdmin(admin.ModelAdmin):

    list_display = (
        "goods_received_note",
        "purchase_order_item",
        "quantity_received",
        "unit_cost",
    )

    search_fields = (
        "goods_received_note__reference",
        "purchase_order_item__product__name",
    )


class SupplierReturnItemInline(admin.TabularInline):

    model = SupplierReturnItem
    extra = 0


@admin.register(SupplierReturn)
class SupplierReturnAdmin(admin.ModelAdmin):

    list_display = (
        "reference",
        "supplier",
        "original_grn",
        "reason",
        "resolution",
        "status",
        "created_at",
    )

    list_filter = (
        "status",
        "reason",
        "resolution",
        "created_at",
    )

    search_fields = (
        "reference",
        "supplier__name",
        "original_grn__reference",
        "supplier_reference",
    )

    readonly_fields = (
        "reference",
        "created_by",
        "posted_by",
        "created_at",
        "posted_at",
    )

    inlines = [SupplierReturnItemInline]


@admin.register(SupplierReturnItem)
class SupplierReturnItemAdmin(admin.ModelAdmin):

    list_display = (
        "supplier_return",
        "original_received_item",
        "quantity_returned",
        "unit_cost",
    )

    search_fields = (
        "supplier_return__reference",
        "original_received_item__purchase_order_item__product__name",
    )

@admin.register(SupplierPayment)
class SupplierPaymentAdmin(admin.ModelAdmin):
    list_display = (
        "reference",
        "supplier",
        "amount",
        "payment_method",
        "payment_date",
        "status",
    )

    list_filter = (
        "status",
        "payment_method",
        "payment_date",
    )

    search_fields = (
        "reference",
        "supplier__name",
        "payment_reference",
    )

    readonly_fields = (
        "reference",
        "created_by",
        "posted_by",
        "created_at",
        "posted_at",
    )

@admin.register(SupplierInvoice)
class SupplierInvoiceAdmin(admin.ModelAdmin):
    list_display = (
        "invoice_number",
        "supplier",
        "invoice_date",
        "due_date",
        "total_amount",
        "status",
    )

    list_filter = ("status", "invoice_date", "due_date")
    search_fields = ("invoice_number", "supplier__name")

    readonly_fields = (
        "created_by",
        "posted_by",
        "created_at",
        "posted_at",
    )