
from decimal import Decimal

from django.contrib.auth import get_user_model
from rest_framework import serializers

from .models import Sale, SaleItem, SalePayment, SaleReturn, SaleReturnItem, SaleRefundPayment
from apps.products.models import Product
from apps.inventory.models import StockBalance
from apps.inventory.models import StockLocation
from .models import CashierShift, CashMovement
from apps.accounts.models import OfflineAuthorization

User = get_user_model()


def validate_offline_sale_authorization(
    grant,
    request,
    occurred_at,
):
    if request is None:
        raise serializers.ValidationError(
            {
                "offline_authorization": (
                    "An authenticated device is required to use offline authorization."
                )
            }
        )

    token = request.auth
    device_sync_id = token.get("device_sync_id") if token else None

    if occurred_at is None or not grant.permits(
        user=request.user,
        device_sync_id=device_sync_id,
        operation=OfflineAuthorization.Operation.CASH_SALE,
        occurred_at=occurred_at,
    ):
        raise serializers.ValidationError(
            {
                "offline_authorization": (
                    "The offline cash-sale authorization is invalid or expired."
                )
            }
        )


class SaleItemSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(
        source="product.name",
        read_only=True
    )
    sku = serializers.CharField(
        source="product.sku",
        read_only=True
    )
    line_total = serializers.DecimalField(
        max_digits=14,
        decimal_places=2,
        read_only=True
    )

    class Meta:
        model = SaleItem
        fields = [
            "id",
            "product",
            "product_name",
            "sku",
            "quantity",
            "unit_price",
            "cost_price",
            "discount_amount",
            "line_total",
        ]
        read_only_fields = ["id", "cost_price"]


class SalePaymentSerializer(serializers.ModelSerializer):
    class Meta:
        model = SalePayment
        fields = [
            "id",
            "payment_method",
            "amount",
            "transaction_reference",
            "received_by",
            "created_at",
        ]
        read_only_fields = ["id", "received_by", "created_at"]


class SaleSerializer(serializers.ModelSerializer):
    items = SaleItemSerializer(many=True, read_only=True)
    payments = SalePaymentSerializer(many=True, read_only=True)
    sync_status = serializers.SerializerMethodField()
    offline_authorization = serializers.PrimaryKeyRelatedField(
        queryset=OfflineAuthorization.objects.all(),
        required=False,
        allow_null=True,
    )
    cashier_name = serializers.CharField(
        source="cashier.username",
        read_only=True
    )
    location_name = serializers.CharField(
        source="location.name",
        read_only=True
    )

    class Meta:
        model = Sale
        fields = [
            "id",
            "reference",
            "cashier",
            "offline_authorization",
            "cashier_name",
            "location",
            "location_name",
            "customer_name",
            "customer_phone",
            "subtotal",
            "discount_amount",
            "tax_amount",
            "total_amount",
            "status",
            "items",
            "payments",
            "notes",
            "created_at",
            "completed_at",
            "client_completed_at",
            "sync_status",
        ]
        read_only_fields = [
            "id", "cashier", "subtotal",
            "total_amount", "status", "created_at",
            "completed_at",
        ]

    def get_sync_status(self, obj):
        return "SYNCED"

    def validate_client_completed_at(self, value):
        if self.instance and self.instance.status != Sale.Status.DRAFT:
            raise serializers.ValidationError(
                "Client completion time can only be set on a draft sale."
            )
        if (
            self.instance
            and self.instance.client_completed_at
            and self.instance.client_completed_at != value
        ):
            raise serializers.ValidationError(
                "Client completion time has already been recorded."
            )
        return value

    def validate(self, attrs):
        if (
            self.instance
            and "offline_authorization" in attrs
            and self.instance.status != Sale.Status.DRAFT
        ):
            raise serializers.ValidationError(
                "Offline authorization can only be recorded on a draft sale."
            )

        grant = attrs.get("offline_authorization")
        if grant is not None:
            request = self.context.get("request")
            occurred_at = attrs.get(
                "client_completed_at",
                self.instance.client_completed_at if self.instance else None,
            )
            validate_offline_sale_authorization(
                grant,
                request,
                occurred_at,
            )
        return attrs


class SaleCreateSerializer(serializers.ModelSerializer):
    offline_authorization = serializers.PrimaryKeyRelatedField(
        queryset=OfflineAuthorization.objects.all(),
        required=False,
        allow_null=True,
    )

    reference = serializers.CharField(
        max_length=50,
        required=False,
        write_only=True,
    )

    class Meta:
        model = Sale
        fields = [
            "id",
            "reference",
            "location",
            "customer_name",
            "customer_phone",
            "discount_amount",
            "tax_amount",
            "notes",
            "client_completed_at",
            "offline_authorization",
        ]
        read_only_fields = ["id"]

    def validate_location(self, value):
        if not value.is_active:
            raise serializers.ValidationError(
                "This stock location is inactive."
            )
        return value

    def validate(self, attrs):
        if attrs.get("discount_amount", Decimal("0")) < 0:
            raise serializers.ValidationError(
                "Discount cannot be negative."
            )
        if attrs.get("tax_amount", Decimal("0")) < 0:
            raise serializers.ValidationError(
                "Tax cannot be negative."
            )
        grant = attrs.get("offline_authorization")
        if grant is not None:
            validate_offline_sale_authorization(
                grant,
                self.context.get("request"),
                attrs.get("client_completed_at"),
            )
        return attrs

    def create(self, validated_data):
        user = self.context["request"].user
        reference = validated_data.get("reference")
        validated_data["cashier"] = user

        if reference:
            sale, created = Sale.objects.get_or_create(
                reference=reference,
                defaults=validated_data,
            )
            if not created and sale.cashier_id != user.pk:
                raise serializers.ValidationError(
                    "This receipt reference is already in use."
                )
            return sale

        return super().create(validated_data)


class SaleItemCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = SaleItem
        fields = [
            "product",
            "quantity",
            "unit_price",
            "discount_amount",
        ]
        extra_kwargs = {
            "unit_price": {"required": False},
            "discount_amount": {"required": False},
        }

    def validate(self, attrs):
        sale = self.context["sale"]
        product = attrs["product"]

        if sale.status != Sale.Status.DRAFT:
            raise serializers.ValidationError(
                "Items can only be added to draft sales."
            )

        if not product.is_active:
            raise serializers.ValidationError(
                "This product is inactive."
            )

        quantity = attrs["quantity"]
        stock_balance = StockBalance.objects.filter(
            product=product,
            location=sale.location,
        ).first()
        available_quantity = (
            stock_balance.quantity_available
            if stock_balance
            else Decimal("0.000")
        )

        if quantity > available_quantity:
            raise serializers.ValidationError({
                "quantity": (
                    f"Insufficient stock at {sale.location.name}. "
                    f"Available quantity: {available_quantity}."
                )
            })

        unit_price = attrs.get(
            "unit_price", product.selling_price
        )
        discount = attrs.get(
            "discount_amount", Decimal("0.00")
        )

        if quantity <= 0:
            raise serializers.ValidationError(
                "Quantity must be greater than zero."
            )

        if discount < 0 or discount > quantity * unit_price:
            raise serializers.ValidationError(
                "Invalid item discount."
            )

        minimum_price = product.minimum_selling_price

        if unit_price < minimum_price:
            raise serializers.ValidationError(
                f"Unit price cannot be below the minimum "
                f"selling price of {minimum_price}."
            )

        if SaleItem.objects.filter(
            sale=sale, product=product
        ).exists():
            raise serializers.ValidationError(
                "This product is already in the sale. "
                "Update its existing item instead."
            )

        attrs["unit_price"] = unit_price
        attrs["discount_amount"] = discount

        return attrs

    def create(self, validated_data):
        sale = self.context["sale"]
        product = validated_data["product"]

        item = SaleItem.objects.create(
            sale=sale,
            product=product,
            cost_price=product.cost_price,
            **{
                key: value
                for key, value in validated_data.items()
                if key != "product"
            }
        )

        sale.recalculate_totals()
        return item


class CheckoutPaymentSerializer(serializers.Serializer):
    payment_method = serializers.ChoiceField(
        choices=SalePayment.PaymentMethod.choices
    )
    amount = serializers.DecimalField(
        max_digits=14,
        decimal_places=2,
        min_value=Decimal("0.01")
    )
    transaction_reference = serializers.CharField(
        required=False,
        allow_blank=True
    )

    def validate(self, attrs):
        if (
            attrs["payment_method"] == SalePayment.PaymentMethod.MPESA
            and not attrs.get("transaction_reference", "").strip()
        ):
            raise serializers.ValidationError({
                "transaction_reference": (
                    "Enter the M-Pesa reference for a manually received payment."
                )
            })
        return attrs


class CheckoutSerializer(serializers.Serializer):
    payments = CheckoutPaymentSerializer(many=True)

    def validate_payments(self, value):
        if not value:
            raise serializers.ValidationError(
                "At least one payment is required."
            )
        return value

class SaleReturnItemSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(
        source="sale_item.product.name", read_only=True
    )

    class Meta:
        model = SaleReturnItem
        fields = [
            "id", "sale_item", "product_name",
            "quantity", "unit_price", "refund_amount",
        ]
        read_only_fields = ["unit_price", "refund_amount"]

    def validate(self, attrs):
        sale_return = self.context.get("sale_return")
        sale_item = attrs["sale_item"]
        quantity = attrs["quantity"]

        if sale_return and sale_item.sale_id != sale_return.sale_id:
            raise serializers.ValidationError(
                "This item does not belong to the selected sale."
            )

        if quantity <= 0:
            raise serializers.ValidationError(
                "Return quantity must be greater than zero."
            )

        if sale_return and sale_return.items.filter(
            sale_item=sale_item
        ).exists():
            raise serializers.ValidationError(
                "This sale item is already included in this return."
            )

        return attrs

    def create(self, validated_data):
        sale_item = validated_data["sale_item"]
        quantity = validated_data["quantity"]
        unit_price = sale_item.unit_price

        validated_data["unit_price"] = unit_price
        validated_data["refund_amount"] = quantity * unit_price

        return super().create(validated_data)


class SaleReturnSerializer(serializers.ModelSerializer):
    items = SaleReturnItemSerializer(many=True, read_only=True)
    refund_payments = serializers.SerializerMethodField()
    sale_reference = serializers.CharField(
        source="sale.reference", read_only=True
    )
    customer_name = serializers.CharField(
        source="sale.customer_name", read_only=True
    )
    customer_phone = serializers.CharField(
        source="sale.customer_phone", read_only=True
    )

    class Meta:
        model = SaleReturn
        fields = [
            "id", "reference", "sale", "sale_reference",
            "customer_name", "customer_phone",
            "reason", "notes", "status", "refund_amount",
            "processed_by", "items", "refund_payments",
            "created_at", "completed_at",
        ]
        read_only_fields = [
            "reference", "status", "refund_amount",
            "processed_by", "created_at", "completed_at",
        ]

    def get_refund_payments(self, obj):
        payments = obj.refund_payments.select_related("processed_by")
        return SaleRefundPaymentSerializer(payments, many=True).data


class SaleReturnCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = SaleReturn
        fields = ["id", "sale", "reason", "notes"]
        read_only_fields = ["id"]

    def validate_sale(self, sale):
        if sale.status != Sale.Status.COMPLETED:
            raise serializers.ValidationError(
                "Only completed sales can be returned."
            )
        return sale

    def create(self, validated_data):
        validated_data["processed_by"] = self.context["request"].user
        return super().create(validated_data)


class SaleRefundPaymentSerializer(serializers.ModelSerializer):
    processed_by_name = serializers.CharField(
        source="processed_by.username", read_only=True
    )

    class Meta:
        model = SaleRefundPayment
        fields = [
            "id", "amount", "payment_method",
            "transaction_reference", "processed_by",
            "processed_by_name", "created_at",
        ]
        read_only_fields = ["processed_by", "created_at"]


class CompleteSaleReturnSerializer(serializers.Serializer):
    refund_payments = SaleRefundPaymentSerializer(many=True)

    def validate_refund_payments(self, payments):
        if not payments:
            raise serializers.ValidationError(
                "At least one refund payment is required."
            )

        for payment in payments:
            if payment["amount"] <= 0:
                raise serializers.ValidationError(
                    "Refund payment amounts must be greater than zero."
                )

        return payments

class CashierShiftSerializer(serializers.ModelSerializer):
    cashier_name = serializers.CharField(
        source="cashier.username", read_only=True
    )
    location_name = serializers.CharField(
        source="location.name", read_only=True
    )

    class Meta:
        model = CashierShift
        fields = [
            "id", "cashier", "cashier_name",
            "location", "location_name",
            "opening_cash", "expected_cash",
            "closing_cash", "difference",
            "notes", "status", "opened_at", "closed_at",
        ]
        read_only_fields = [
            "cashier", "expected_cash", "closing_cash",
            "difference", "status", "opened_at", "closed_at",
        ]


class CashierShiftOpenSerializer(serializers.ModelSerializer):
    cashier = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.filter(
            role=User.Role.CASHIER,
            is_active=True,
        )
    )
    location = serializers.PrimaryKeyRelatedField(
        queryset=StockLocation.objects.filter(is_active=True)
    )

    class Meta:
        model = CashierShift
        fields = ["cashier", "location", "opening_cash", "notes"]

    def validate_opening_cash(self, value):
        if value < 0:
            raise serializers.ValidationError(
                "Opening cash cannot be negative."
            )
        return value


class CashMovementSerializer(serializers.ModelSerializer):
    recorded_by_name = serializers.CharField(
        source="recorded_by.username", read_only=True
    )

    class Meta:
        model = CashMovement
        fields = [
            "id", "movement_type", "amount",
            "reference", "description",
            "recorded_by", "recorded_by_name", "created_at",
        ]
        read_only_fields = ["recorded_by", "created_at"]

    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError(
                "Amount must be greater than zero."
            )
        return value