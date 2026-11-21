
from decimal import Decimal

from rest_framework import serializers

from apps.products.models import Product
from .models import StockLocation, StockBalance, StockMovement
from .models import StocktakeSession, StocktakeLine

class StockLocationSerializer(serializers.ModelSerializer):
    class Meta:
        model = StockLocation
        fields = [
            "id",
            "name",
            "code",
            "location_type",
            "address",
            "is_default",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class StockBalanceSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(
        source="product.name", read_only=True
    )
    product_sku = serializers.CharField(
        source="product.sku", read_only=True
    )
    location_name = serializers.CharField(
        source="location.name", read_only=True
    )
    quantity_available = serializers.DecimalField(
        max_digits=14, decimal_places=3, read_only=True
    )

    class Meta:
        model = StockBalance
        fields = [
            "id",
            "product",
            "product_name",
            "product_sku",
            "location",
            "location_name",
            "quantity_on_hand",
            "quantity_reserved",
            "quantity_available",
            "updated_at",
        ]
        read_only_fields = fields


class StockMovementSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(
        source="balance.product.name", read_only=True
    )
    product_sku = serializers.CharField(
        source="balance.product.sku", read_only=True
    )
    location_name = serializers.CharField(
        source="balance.location.name", read_only=True
    )
    performed_by_username = serializers.CharField(
        source="performed_by.username", read_only=True
    )

    class Meta:
        model = StockMovement
        fields = [
            "id",
            "transaction_id",
            "balance",
            "product_name",
            "product_sku",
            "location_name",
            "movement_type",
            "quantity_delta",
            "quantity_before",
            "quantity_after",
            "unit_cost",
            "reference",
            "notes",
            "performed_by",
            "performed_by_username",
            "created_at",
        ]
        read_only_fields = fields


class StockMovementEditSerializer(serializers.Serializer):
    movement_type = serializers.ChoiceField(
        choices=StockMovement.MovementType.choices,
        required=False,
    )
    quantity_delta = serializers.DecimalField(
        max_digits=14,
        decimal_places=3,
        required=False,
    )
    unit_cost = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        min_value=Decimal("0.00"),
        required=False,
        allow_null=True,
    )
    reference = serializers.CharField(
        max_length=100,
        required=False,
        allow_blank=True,
    )
    notes = serializers.CharField(required=False, allow_blank=True)


class StockOperationSerializer(serializers.Serializer):
    product = serializers.PrimaryKeyRelatedField(
        queryset=Product.objects.filter(is_active=True)
    )
    location = serializers.PrimaryKeyRelatedField(
        queryset=StockLocation.objects.filter(is_active=True)
    )
    quantity = serializers.DecimalField(
        max_digits=14,
        decimal_places=3,
        min_value=0.001
    )
    unit_cost = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        min_value=0,
        required=False,
        allow_null=True
    )
    reference = serializers.CharField(
        max_length=100, required=False, allow_blank=True
    )
    notes = serializers.CharField(
        required=False, allow_blank=True
    )


class StockAdjustmentSerializer(StockOperationSerializer):
    quantity = serializers.DecimalField(
        max_digits=14,
        decimal_places=3
    )

    def validate_quantity(self, value):
        if value == 0:
            raise serializers.ValidationError(
                "Adjustment quantity cannot be zero."
            )
        return value


class StockTransferSerializer(serializers.Serializer):
    product = serializers.PrimaryKeyRelatedField(
        queryset=Product.objects.filter(is_active=True)
    )
    source = serializers.PrimaryKeyRelatedField(
        queryset=StockLocation.objects.filter(is_active=True)
    )
    destination = serializers.PrimaryKeyRelatedField(
        queryset=StockLocation.objects.filter(is_active=True)
    )
    quantity = serializers.DecimalField(
        max_digits=14,
        decimal_places=3,
        min_value=0.001
    )
    reference = serializers.CharField(
        max_length=100, required=False, allow_blank=True
    )
    notes = serializers.CharField(
        required=False, allow_blank=True
    )

    def validate(self, attrs):
        if attrs["source"].id == attrs["destination"].id:
            raise serializers.ValidationError(
                "Source and destination must be different locations."
            )
        return attrs

class StocktakeLineSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(
        source="product.name",
        read_only=True
    )
    product_sku = serializers.CharField(
        source="product.sku",
        read_only=True
    )
    variance = serializers.DecimalField(
        max_digits=14,
        decimal_places=3,
        read_only=True
    )

    class Meta:
        model = StocktakeLine
        fields = [
            "id",
            "product",
            "product_name",
            "product_sku",
            "system_quantity",
            "counted_quantity",
            "variance",
            "notes",
        ]
        read_only_fields = [
            "id",
            "product",
            "product_name",
            "product_sku",
            "system_quantity",
            "variance",
        ]


class StocktakeSessionSerializer(serializers.ModelSerializer):
    location_name = serializers.CharField(
        source="location.name",
        read_only=True
    )
    lines = StocktakeLineSerializer(many=True, read_only=True)

    class Meta:
        model = StocktakeSession
        fields = [
            "id",
            "reference",
            "location",
            "location_name",
            "status",
            "notes",
            "created_by",
            "created_at",
            "completed_at",
            "lines",
        ]
        read_only_fields = fields


class StocktakeCreateSerializer(serializers.Serializer):
    location = serializers.PrimaryKeyRelatedField(
        queryset=StockLocation.objects.filter(is_active=True)
    )
    reference = serializers.CharField(max_length=50)
    notes = serializers.CharField(
        required=False,
        allow_blank=True
    )


class StocktakeCountSerializer(serializers.Serializer):
    counted_quantity = serializers.DecimalField(
        max_digits=14,
        decimal_places=3,
        min_value=0
    )
    notes = serializers.CharField(
        required=False,
        allow_blank=True
    )
