
from rest_framework import serializers

from .models import (
    Category,
    Brand,
    Unit,
    Product,
    ProductBarcode,
)


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = '__all__'
        read_only_fields = ['id', 'created_at', 'updated_at']


class BrandSerializer(serializers.ModelSerializer):
    class Meta:
        model = Brand
        fields = '__all__'
        read_only_fields = ['id', 'created_at']


class UnitSerializer(serializers.ModelSerializer):
    class Meta:
        model = Unit
        fields = '__all__'
        read_only_fields = ['id']


class ProductBarcodeSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductBarcode
        fields = [
            'id',
            'product',
            'barcode',
            'barcode_type',
            'is_primary',
            'created_at',
        ]
        read_only_fields = ['id', 'created_at']


class ProductSerializer(serializers.ModelSerializer):
    location_quantity_available = serializers.DecimalField(
        max_digits=14,
        decimal_places=3,
        read_only=True,
        required=False,
    )

    category_name = serializers.CharField(
        source='category.name',
        read_only=True
    )

    brand_name = serializers.CharField(
        source='brand.name',
        read_only=True,
        allow_null=True
    )

    unit_name = serializers.CharField(
        source='unit.name',
        read_only=True
    )

    barcodes = ProductBarcodeSerializer(
        many=True,
        read_only=True
    )

    class Meta:
        model = Product

        fields = [
            'id',
            'name',
            'sku',
            'category',
            'category_name',
            'brand',
            'brand_name',
            'model_number',
            'description',
            'specifications',
            'unit',
            'unit_name',
            'cost_price',
            'selling_price',
            'wholesale_price',
            'minimum_selling_price',
            'warranty_months',
            'reorder_level',
            'is_active',
            'location_quantity_available',
            'barcodes',
            'created_by',
            'created_at',
            'updated_at',
        ]

        read_only_fields = [
            'id',
            'created_by',
            'created_at',
            'updated_at',
        ]

    def validate(self, attrs):
        selling_price = attrs.get(
            'selling_price',
            getattr(self.instance, 'selling_price', None)
        )

        minimum_price = attrs.get(
            'minimum_selling_price',
            getattr(self.instance, 'minimum_selling_price', 0)
        )

        cost_price = attrs.get(
            'cost_price',
            getattr(self.instance, 'cost_price', None)
        )

        if (
            selling_price is not None
            and minimum_price is not None
            and minimum_price > selling_price
        ):
            raise serializers.ValidationError({
                'minimum_selling_price':
                'Minimum selling price cannot exceed selling price.'
            })

        if cost_price is not None and cost_price < 0:
            raise serializers.ValidationError({
                'cost_price': 'Cost price cannot be negative.'
            })

        if selling_price is not None and selling_price < 0:
            raise serializers.ValidationError({
                'selling_price': 'Selling price cannot be negative.'
            })

        return attrs
