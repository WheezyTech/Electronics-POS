from decimal import Decimal

from rest_framework import serializers

from .models import (
    GasBrand, GasCylinderSize, GasCylinder, GasStock, GasStockMovement,
    GasRefill, GasExchange, GasPurchase, CylinderDeposit, GasPayment,
    NewCylinderSale, NewCylinderSaleAccessory,
)


class GasBrandSerializer(serializers.ModelSerializer):
    class Meta:
        model = GasBrand
        fields = "__all__"


class GasCylinderSizeSerializer(serializers.ModelSerializer):
    class Meta:
        model = GasCylinderSize
        fields = "__all__"


class GasCylinderSerializer(serializers.ModelSerializer):
    brand_name = serializers.CharField(source="brand.name", read_only=True)
    size_name = serializers.CharField(source="size.name", read_only=True)
    location_name = serializers.CharField(source="location.name", read_only=True)

    class Meta:
        model = GasCylinder
        fields = "__all__"


class GasStockSerializer(serializers.ModelSerializer):
    brand_name = serializers.CharField(source="brand.name", read_only=True)
    size_name = serializers.CharField(source="size.name", read_only=True)
    location_name = serializers.CharField(source="location.name", read_only=True)

    class Meta:
        model = GasStock
        fields = "__all__"


class GasPaymentSerializer(serializers.ModelSerializer):
    class Meta:
        model = GasPayment
        fields = [
            "id",
            "payment_method",
            "amount",
            "transaction_reference",
            "created_at",
        ]
        read_only_fields = fields


class GasPaymentInputSerializer(serializers.Serializer):
    payment_method = serializers.ChoiceField(
        choices=GasPayment.PaymentMethod.choices
    )
    amount = serializers.DecimalField(
        max_digits=14,
        decimal_places=2,
        min_value=Decimal("0.01"),
    )
    transaction_reference = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=100,
    )

    def validate(self, attrs):
        if (
            attrs["payment_method"] == GasPayment.PaymentMethod.MPESA
            and not attrs.get("transaction_reference", "").strip()
        ):
            raise serializers.ValidationError({
                "transaction_reference": (
                    "Enter the M-Pesa reference for a manually received payment."
                )
            })
        return attrs


class GasMovementSerializer(serializers.ModelSerializer):
    brand_name = serializers.CharField(source="brand.name", read_only=True)
    size_name = serializers.CharField(source="size.name", read_only=True)
    location_name = serializers.CharField(source="location.name", read_only=True)

    class Meta:
        model = GasStockMovement
        fields = "__all__"


class CylinderDepositSerializer(serializers.ModelSerializer):
    brand_name = serializers.CharField(source="brand.name", read_only=True)
    size_name = serializers.CharField(source="size.name", read_only=True)

    class Meta:
        model = CylinderDeposit
        fields = "__all__"
        read_only_fields = ["reference", "received_by", "refunded_at", "created_at"]


class GasRefillSerializer(serializers.ModelSerializer):
    payments = GasPaymentSerializer(many=True, read_only=True)
    brand_name = serializers.CharField(source="brand.name", read_only=True)
    customer_brand_name = serializers.CharField(
        source="customer_brand.name", read_only=True, allow_null=True
    )
    size_name = serializers.CharField(source="size.name", read_only=True)
    location_name = serializers.CharField(source="location.name", read_only=True)
    recorded_by_name = serializers.CharField(source="recorded_by.username", read_only=True)

    class Meta:
        model = GasRefill
        fields = "__all__"
        read_only_fields = ["reference", "total_amount", "recorded_by", "created_at"]


class GasExchangeSerializer(serializers.ModelSerializer):
    payments = GasPaymentSerializer(many=True, read_only=True)
    brand_name = serializers.CharField(source="brand.name", read_only=True)
    size_name = serializers.CharField(source="size.name", read_only=True)
    location_name = serializers.CharField(source="location.name", read_only=True)
    recorded_by_name = serializers.CharField(source="recorded_by.username", read_only=True)

    class Meta:
        model = GasExchange
        fields = "__all__"
        read_only_fields = ["reference", "recorded_by", "created_at"]


class GasPurchaseSerializer(serializers.ModelSerializer):
    brand_name = serializers.CharField(source="brand.name", read_only=True)
    size_name = serializers.CharField(source="size.name", read_only=True)
    supplier_name = serializers.CharField(source="supplier.name", read_only=True)

    class Meta:
        model = GasPurchase
        fields = "__all__"
        read_only_fields = ["reference", "recorded_by", "created_at"]


class NewCylinderSaleAccessorySerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)
    line_total = serializers.DecimalField(
        max_digits=14, decimal_places=2, read_only=True
    )

    class Meta:
        model = NewCylinderSaleAccessory
        fields = [
            "id", "product", "product_name", "quantity", "unit_price", "line_total"
        ]


class NewCylinderSaleSerializer(serializers.ModelSerializer):
    payments = GasPaymentSerializer(many=True, read_only=True)
    brand_name = serializers.CharField(source="brand.name", read_only=True)
    size_name = serializers.CharField(source="size.name", read_only=True)
    location_name = serializers.CharField(source="location.name", read_only=True)
    recorded_by_name = serializers.CharField(source="recorded_by.username", read_only=True)
    accessory_items = NewCylinderSaleAccessorySerializer(many=True, read_only=True)
    total_amount = serializers.DecimalField(
        max_digits=14, decimal_places=2, read_only=True
    )

    class Meta:
        model = NewCylinderSale
        fields = "__all__"
        read_only_fields = ["reference", "recorded_by", "created_at"]
