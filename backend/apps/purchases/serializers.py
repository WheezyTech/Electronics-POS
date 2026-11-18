
from rest_framework import serializers
from .models import Supplier
from django.db import transaction

from .models import PurchaseOrder, PurchaseOrderItem, Supplier
from apps.products.models import Product
from apps.inventory.models import StockLocation

from .models import (
    GoodsReceivedNote,
    GoodsReceivedItem,
    PurchaseOrder,
    PurchaseOrderItem,
)

from django.db.models import Sum

from .models import (
    SupplierReturn,
    SupplierReturnItem,
    GoodsReceivedNote,
    GoodsReceivedItem,
    SupplierInvoice,
)

from .models import SupplierPayment

class SupplierSerializer(serializers.ModelSerializer):

    created_by_name = serializers.CharField(
        source="created_by.username",
        read_only=True
    )

    class Meta:
        model = Supplier

        fields = [
            "id",
            "name",
            "contact_person",
            "phone_number",
            "alternative_phone",
            "email",
            "kra_pin",
            "address",
            "city",
            "payment_terms",
            "opening_balance",
            "notes",
            "is_active",
            "created_by",
            "created_by_name",
            "created_at",
            "updated_at",
        ]

        read_only_fields = [
            "id",
            "created_by",
            "created_by_name",
            "created_at",
            "updated_at",
        ]

    def validate_opening_balance(self, value):
        if value < 0:
            raise serializers.ValidationError(
                "Opening balance cannot be negative."
            )
        return value


class PurchaseOrderItemSerializer(serializers.ModelSerializer):

    product_name = serializers.CharField(
        source="product.name",
        read_only=True
    )

    product_sku = serializers.CharField(
        source="product.sku",
        read_only=True
    )

    subtotal = serializers.DecimalField(
        max_digits=14,
        decimal_places=2,
        read_only=True
    )

    line_total = serializers.DecimalField(
        max_digits=14,
        decimal_places=2,
        read_only=True
    )

    remaining_quantity = serializers.DecimalField(
        max_digits=14,
        decimal_places=3,
        read_only=True
    )

    class Meta:
        model = PurchaseOrderItem
        fields = [
            "id",
            "product",
            "product_name",
            "product_sku",
            "quantity",
            "received_quantity",
            "remaining_quantity",
            "unit_cost",
            "discount_amount",
            "tax_amount",
            "subtotal",
            "line_total",
            "notes",
        ]
        read_only_fields = [
            "id",
            "received_quantity",
            "remaining_quantity",
            "subtotal",
            "line_total",
        ]

    def validate(self, attrs):
        quantity = attrs.get("quantity", getattr(self.instance, "quantity", None))
        unit_cost = attrs.get("unit_cost", getattr(self.instance, "unit_cost", None))
        discount = attrs.get(
            "discount_amount",
            getattr(self.instance, "discount_amount", 0)
        )
        tax = attrs.get(
            "tax_amount",
            getattr(self.instance, "tax_amount", 0)
        )

        if quantity is not None and quantity <= 0:
            raise serializers.ValidationError(
                {"quantity": "Quantity must be greater than zero."}
            )

        if unit_cost is not None and unit_cost <= 0:
            raise serializers.ValidationError(
                {"unit_cost": "Unit cost must be greater than zero."}
            )

        if discount < 0 or tax < 0:
            raise serializers.ValidationError(
                "Discount and tax cannot be negative."
            )

        if quantity is not None and unit_cost is not None:
            if discount > quantity * unit_cost:
                raise serializers.ValidationError(
                    {"discount_amount": "Discount cannot exceed subtotal."}
                )

        return attrs


class PurchaseOrderSerializer(serializers.ModelSerializer):

    supplier_name = serializers.CharField(
        source="supplier.name",
        read_only=True
    )

    destination_name = serializers.CharField(
        source="destination.name",
        read_only=True
    )

    created_by_name = serializers.CharField(
        source="created_by.username",
        read_only=True
    )

    items = PurchaseOrderItemSerializer(many=True, read_only=True)

    class Meta:
        model = PurchaseOrder
        fields = [
            "id",
            "reference",
            "supplier",
            "supplier_name",
            "destination",
            "destination_name",
            "status",
            "order_date",
            "expected_delivery_date",
            "notes",
            "subtotal",
            "total_discount",
            "total_tax",
            "grand_total",
            "created_by",
            "created_by_name",
            "approved_by",
            "approved_at",
            "created_at",
            "updated_at",
            "items",
        ]
        read_only_fields = fields


class PurchaseOrderCreateSerializer(serializers.Serializer):

    supplier = serializers.PrimaryKeyRelatedField(
        queryset=Supplier.objects.filter(is_active=True)
    )

    destination = serializers.PrimaryKeyRelatedField(
        queryset=StockLocation.objects.filter(is_active=True)
    )

    expected_delivery_date = serializers.DateField(
        required=False,
        allow_null=True
    )

    notes = serializers.CharField(
        required=False,
        allow_blank=True
    )

    def create(self, validated_data):
        return PurchaseOrder.objects.create(
            **validated_data,
            created_by=self.context["request"].user
        )


class PurchaseOrderItemCreateSerializer(serializers.Serializer):

    product = serializers.PrimaryKeyRelatedField(
        queryset=Product.objects.filter(is_active=True)
    )

    quantity = serializers.DecimalField(
        max_digits=14,
        decimal_places=3,
        min_value=0.001
    )

    unit_cost = serializers.DecimalField(
        max_digits=14,
        decimal_places=2,
        min_value=0.01
    )

    discount_amount = serializers.DecimalField(
        max_digits=14,
        decimal_places=2,
        min_value=0,
        default=0
    )

    tax_amount = serializers.DecimalField(
        max_digits=14,
        decimal_places=2,
        min_value=0,
        default=0
    )

    notes = serializers.CharField(
        required=False,
        allow_blank=True
    )

    def validate(self, attrs):
        subtotal = attrs["quantity"] * attrs["unit_cost"]

        if attrs["discount_amount"] > subtotal:
            raise serializers.ValidationError({
                "discount_amount": "Discount cannot exceed subtotal."
            })

        return attrs


class PurchaseOrderStatusSerializer(serializers.Serializer):

    action = serializers.ChoiceField(
        choices=["submit", "approve", "cancel"]
    )


class GoodsReceivedItemSerializer(serializers.ModelSerializer):

    product_name = serializers.CharField(
        source="purchase_order_item.product.name",
        read_only=True
    )

    product_sku = serializers.CharField(
        source="purchase_order_item.product.sku",
        read_only=True
    )

    purchase_order_item_id = serializers.IntegerField(
        source="purchase_order_item.id",
        read_only=True
    )

    line_total = serializers.DecimalField(
        max_digits=14,
        decimal_places=2,
        read_only=True
    )

    class Meta:
        model = GoodsReceivedItem
        fields = [
            "id",
            "purchase_order_item",
            "purchase_order_item_id",
            "product_name",
            "product_sku",
            "quantity_received",
            "unit_cost",
            "line_total",
            "notes",
        ]
        read_only_fields = [
            "id",
            "purchase_order_item_id",
            "product_name",
            "product_sku",
            "line_total",
        ]


class GoodsReceivedNoteSerializer(serializers.ModelSerializer):

    purchase_order_reference = serializers.CharField(
        source="purchase_order.reference",
        read_only=True
    )

    supplier_name = serializers.CharField(
        source="purchase_order.supplier.name",
        read_only=True
    )

    destination_name = serializers.CharField(
        source="purchase_order.destination.name",
        read_only=True
    )

    received_by_name = serializers.CharField(
        source="received_by.username",
        read_only=True
    )

    posted_by_name = serializers.CharField(
        source="posted_by.username",
        read_only=True
    )

    items = GoodsReceivedItemSerializer(many=True, read_only=True)

    class Meta:
        model = GoodsReceivedNote
        fields = [
            "id",
            "reference",
            "purchase_order",
            "purchase_order_reference",
            "supplier_name",
            "destination_name",
            "supplier_delivery_note",
            "supplier_invoice_number",
            "status",
            "notes",
            "received_by",
            "received_by_name",
            "posted_by",
            "posted_by_name",
            "received_at",
            "posted_at",
            "created_at",
            "items",
        ]
        read_only_fields = fields


class GoodsReceivedNoteCreateSerializer(serializers.Serializer):

    purchase_order = serializers.PrimaryKeyRelatedField(
        queryset=PurchaseOrder.objects.all()
    )

    supplier_delivery_note = serializers.CharField(
        required=False,
        allow_blank=True
    )

    supplier_invoice_number = serializers.CharField(
        required=False,
        allow_blank=True
    )

    notes = serializers.CharField(
        required=False,
        allow_blank=True
    )

    def validate_purchase_order(self, value):

        if value.status not in [
            PurchaseOrder.Status.APPROVED,
            PurchaseOrder.Status.PARTIALLY_RECEIVED,
        ]:
            raise serializers.ValidationError(
                "A GRN can only be created for an approved "
                "or partially received purchase order."
            )

        return value

    def create(self, validated_data):

        return GoodsReceivedNote.objects.create(
            **validated_data,
            received_by=self.context["request"].user
        )


class GoodsReceivedItemCreateSerializer(serializers.Serializer):

    purchase_order_item = serializers.PrimaryKeyRelatedField(
        queryset=PurchaseOrderItem.objects.select_related(
            "purchase_order",
            "product"
        )
    )

    quantity_received = serializers.DecimalField(
        max_digits=14,
        decimal_places=3,
        min_value=0.001
    )

    unit_cost = serializers.DecimalField(
        max_digits=14,
        decimal_places=2,
        min_value=0.01,
        required=False
    )

    notes = serializers.CharField(
        required=False,
        allow_blank=True
    )

    def validate(self, attrs):

        grn = self.context["grn"]
        order_item = attrs["purchase_order_item"]

        if order_item.purchase_order_id != grn.purchase_order_id:
            raise serializers.ValidationError({
                "purchase_order_item":
                    "This product does not belong to the GRN purchase order."
            })

        if order_item.purchase_order.status not in [
            PurchaseOrder.Status.APPROVED,
            PurchaseOrder.Status.PARTIALLY_RECEIVED,
        ]:
            raise serializers.ValidationError(
                "The purchase order is not available for receiving."
            )

        if order_item.remaining_quantity <= 0:
            raise serializers.ValidationError({
                "purchase_order_item":
                    "This purchase order item has already been fully received."
            })

        quantity = attrs["quantity_received"]

        existing_quantity = sum(
            (
                item.quantity_received
                for item in grn.items.filter(
                    purchase_order_item=order_item
                )
            ),
            start=0
        )

        if existing_quantity + quantity > order_item.remaining_quantity:
            raise serializers.ValidationError({
                "quantity_received":
                    "Received quantity exceeds the outstanding order quantity."
            })

        attrs.setdefault("unit_cost", order_item.unit_cost)

        return attrs


class SupplierReturnItemSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(
        source="product.name",
        read_only=True
    )

    class Meta:
        model = SupplierReturnItem
        fields = [
            "id",
            "original_received_item",
            "product_name",
            "quantity_returned",
            "unit_cost",
            "line_total",
            "notes",
        ]
        read_only_fields = ["id", "product_name", "line_total"]


class SupplierReturnSerializer(serializers.ModelSerializer):
    items = SupplierReturnItemSerializer(many=True, read_only=True)
    supplier_name = serializers.CharField(
        source="supplier.name",
        read_only=True
    )
    original_grn_reference = serializers.CharField(
        source="original_grn.reference",
        read_only=True
    )
    total_value = serializers.DecimalField(
        max_digits=14,
        decimal_places=2,
        read_only=True
    )

    class Meta:
        model = SupplierReturn
        fields = [
            "id",
            "reference",
            "supplier",
            "supplier_name",
            "original_grn",
            "original_grn_reference",
            "reason",
            "supplier_reference",
            "status",
            "resolution",
            "notes",
            "items",
            "total_value",
            "created_by",
            "posted_by",
            "created_at",
            "posted_at",
        ]
        read_only_fields = [
            "id",
            "reference",
            "supplier",
            "status",
            "created_by",
            "posted_by",
            "created_at",
            "posted_at",
        ]


class SupplierReturnCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = SupplierReturn
        fields = [
            "id",
            "original_grn",
            "reason",
            "supplier_reference",
            "resolution",
            "notes",
        ]
        read_only_fields = ["id"]

    def validate_original_grn(self, value):
        if value.status != GoodsReceivedNote.Status.POSTED:
            raise serializers.ValidationError(
                "Supplier returns can only be created from posted GRNs."
            )

        return value

    def create(self, validated_data):
        request = self.context["request"]
        original_grn = validated_data["original_grn"]

        validated_data["supplier"] = (
            original_grn.purchase_order.supplier
        )
        validated_data["created_by"] = request.user

        return super().create(validated_data)


class SupplierReturnItemCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = SupplierReturnItem
        fields = [
            "id",
            "original_received_item",
            "quantity_returned",
            "unit_cost",
            "notes",
        ]
        read_only_fields = ["id"]
        extra_kwargs = {
            "unit_cost": {"required": False}
        }

    def validate(self, attrs):
        supplier_return = self.context["supplier_return"]
        received_item = attrs["original_received_item"]
        quantity = attrs["quantity_returned"]

        if received_item.grn_id != supplier_return.original_grn_id:
            raise serializers.ValidationError(
                "The selected received item does not belong to this return's GRN."
            )

        if supplier_return.status != SupplierReturn.Status.DRAFT:
            raise serializers.ValidationError(
                "Items can only be added to a draft supplier return."
            )

        existing_returns = SupplierReturnItem.objects.filter(
            original_received_item=received_item,
            supplier_return__status__in=[
                SupplierReturn.Status.DRAFT,
                SupplierReturn.Status.POSTED,
            ],
        ).exclude(
            supplier_return=supplier_return
        ).aggregate(
            total=Sum("quantity_returned")
        )["total"] or 0

        current_return_quantity = (
            supplier_return.items.filter(
                original_received_item=received_item
            ).aggregate(
                total=Sum("quantity_returned")
            )["total"] or 0
        )

        if (
            existing_returns
            + current_return_quantity
            + quantity
            > received_item.quantity_received
        ):
            raise serializers.ValidationError(
                "Return quantity exceeds the quantity originally received."
            )

        return attrs

    def create(self, validated_data):
        supplier_return = self.context["supplier_return"]
        received_item = validated_data["original_received_item"]

        validated_data.setdefault(
            "unit_cost",
            received_item.unit_cost
        )

        validated_data["supplier_return"] = supplier_return

        return super().create(validated_data)

class SupplierPaymentSerializer(serializers.ModelSerializer):
    supplier_name = serializers.CharField(
        source="supplier.name",
        read_only=True
    )

    grn_reference = serializers.CharField(
        source="goods_received_note.reference",
        read_only=True,
        allow_null=True
    )

    supplier_invoice_number = serializers.CharField(
        source="supplier_invoice.invoice_number",
        read_only=True,
        allow_null=True
    )

    created_by_name = serializers.CharField(
        source="created_by.username",
        read_only=True
    )

    posted_by_name = serializers.CharField(
        source="posted_by.username",
        read_only=True
    )

    class Meta:
        model = SupplierPayment
        fields = [
            "id",
            "reference",
            "supplier",
            "supplier_name",
            "goods_received_note",
            "grn_reference",
            "supplier_invoice",
            "supplier_invoice_number",
            "amount",
            "payment_method",
            "payment_reference",
            "payment_date",
            "status",
            "notes",
            "created_by",
            "created_by_name",
            "posted_by",
            "posted_by_name",
            "created_at",
            "posted_at",
        ]

        read_only_fields = [
            "id",
            "reference",
            "status",
            "created_by",
            "posted_by",
            "created_at",
            "posted_at",
        ]

    def validate(self, attrs):
        supplier = attrs.get(
            "supplier",
            getattr(self.instance, "supplier", None)
        )

        grn = attrs.get(
            "goods_received_note",
            getattr(self.instance, "goods_received_note", None)
        )

        if grn:
            if grn.status != GoodsReceivedNote.Status.POSTED:
                raise serializers.ValidationError({
                    "goods_received_note":
                    "Payments can only be linked to posted GRNs."
                })

            if supplier and grn.purchase_order.supplier_id != supplier.id:
                raise serializers.ValidationError({
                    "goods_received_note":
                    "This GRN does not belong to the selected supplier."
                })

        if (
            self.instance
            and self.instance.status != SupplierPayment.Status.DRAFT
        ):
            raise serializers.ValidationError(
                "Only draft supplier payments can be edited."
            )

        return attrs


class SupplierPaymentCreateSerializer(serializers.ModelSerializer):

    class Meta:
        model = SupplierPayment
        fields = [
            "id",
            "supplier",
            "supplier_invoice",
            "goods_received_note",
            "amount",
            "payment_method",
            "payment_reference",
            "payment_date",
            "notes",
        ]

        read_only_fields = ["id"]

    def validate(self, attrs):
        supplier = attrs["supplier"]
        grn = attrs.get("goods_received_note")
        invoice = attrs.get("supplier_invoice")

        if grn:
            if grn.status != GoodsReceivedNote.Status.POSTED:
                raise serializers.ValidationError({
                    "goods_received_note":
                    "Only posted GRNs can be linked to payments."
                })

            if grn.purchase_order.supplier_id != supplier.id:
                raise serializers.ValidationError({
                    "goods_received_note":
                    "The selected GRN belongs to another supplier."
                })

        if invoice:
            if invoice.status != SupplierInvoice.Status.POSTED:
                raise serializers.ValidationError({
                    "supplier_invoice":
                    "Only posted invoices can receive payments."
                })

            if invoice.supplier_id != supplier.id:
                raise serializers.ValidationError({
                    "supplier_invoice":
                    "Invoice belongs to another supplier."
                })

            if invoice.outstanding_balance <= 0:
                raise serializers.ValidationError({
                    "supplier_invoice":
                    "This invoice is already fully paid."
                })

            if attrs["amount"] > invoice.outstanding_balance:
                raise serializers.ValidationError({
                    "amount":
                    "Payment exceeds the outstanding invoice balance."
                })

        return attrs

    def create(self, validated_data):
        validated_data["created_by"] = self.context[
            "request"
        ].user

        return super().create(validated_data)


class SupplierInvoiceSerializer(serializers.ModelSerializer):
    supplier_name = serializers.CharField(
        source="supplier.name", read_only=True
    )
    amount_paid = serializers.DecimalField(
        max_digits=14, decimal_places=2, read_only=True
    )
    outstanding_balance = serializers.DecimalField(
        max_digits=14, decimal_places=2, read_only=True
    )
    is_overdue = serializers.BooleanField(read_only=True)

    class Meta:
        model = SupplierInvoice
        fields = [
            "id",
            "supplier",
            "supplier_name",
            "goods_received_note",
            "invoice_number",
            "invoice_date",
            "due_date",
            "subtotal",
            "tax_amount",
            "discount_amount",
            "total_amount",
            "amount_paid",
            "outstanding_balance",
            "is_overdue",
            "status",
            "notes",
            "created_by",
            "posted_by",
            "created_at",
            "posted_at",
        ]
        read_only_fields = [
            "id", "status", "created_by", "posted_by",
            "created_at", "posted_at",
        ]

    def validate(self, attrs):
        supplier = attrs.get(
            "supplier",
            getattr(self.instance, "supplier", None)
        )
        grn = attrs.get(
            "goods_received_note",
            getattr(self.instance, "goods_received_note", None)
        )

        if grn:
            if grn.status != GoodsReceivedNote.Status.POSTED:
                raise serializers.ValidationError({
                    "goods_received_note": "GRN must be posted."
                })

            if supplier and grn.purchase_order.supplier_id != supplier.id:
                raise serializers.ValidationError({
                    "goods_received_note":
                    "This GRN belongs to another supplier."
                })

        if self.instance and self.instance.status != SupplierInvoice.Status.DRAFT:
            raise serializers.ValidationError(
                "Only draft invoices can be edited."
            )

        return attrs


class SupplierInvoiceCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = SupplierInvoice
        fields = [
            "id",
            "supplier",
            "goods_received_note",
            "invoice_number",
            "invoice_date",
            "due_date",
            "subtotal",
            "tax_amount",
            "discount_amount",
            "total_amount",
            "notes",
        ]
        read_only_fields = ["id"]

    def validate(self, attrs):
        supplier = attrs["supplier"]
        grn = attrs.get("goods_received_note")

        if grn:
            if grn.status != GoodsReceivedNote.Status.POSTED:
                raise serializers.ValidationError(
                    "Only posted GRNs can be linked to invoices."
                )
            if grn.purchase_order.supplier_id != supplier.id:
                raise serializers.ValidationError(
                    "The GRN belongs to another supplier."
                )

        if attrs["total_amount"] != (
            attrs["subtotal"] + attrs["tax_amount"] - attrs["discount_amount"]
        ):
            raise serializers.ValidationError({
                "total_amount":
                "Total must equal subtotal plus tax minus discount."
            })

        return attrs

    def create(self, validated_data):
        validated_data["created_by"] = self.context["request"].user
        return super().create(validated_data)
