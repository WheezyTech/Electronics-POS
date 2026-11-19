
from decimal import Decimal

from django.db import transaction

from rest_framework import serializers

from apps.inventory.models import StockLocation, StockMovement
from apps.inventory.services import change_stock
from .models import (
    Category,
    ProductType,
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


class ProductTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductType
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
    barcode = serializers.CharField(
        write_only=True,
        required=False,
        allow_blank=True,
        max_length=150,
    )
    barcode_type = serializers.ChoiceField(
        choices=ProductBarcode.BarcodeType.choices,
        write_only=True,
        required=False,
        default=ProductBarcode.BarcodeType.OTHER,
    )

    opening_stock = serializers.DecimalField(
        max_digits=14,
        decimal_places=3,
        min_value=Decimal('0'),
        required=False,
        default=Decimal('0'),
        write_only=True,
    )
    opening_stock_location = serializers.PrimaryKeyRelatedField(
        queryset=StockLocation.objects.filter(is_active=True),
        required=False,
        allow_null=True,
        write_only=True,
    )

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

    product_type_name = serializers.CharField(
        source='product_type.name',
        read_only=True,
        allow_null=True,
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
            'product_type',
            'product_type_name',
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
            'barcode',
            'barcode_type',
            'created_by',
            'created_at',
            'updated_at',
            'opening_stock',
            'opening_stock_location',
        ]

        read_only_fields = [
            'id',
            'created_by',
            'created_at',
            'updated_at',
        ]

    def validate(self, attrs):
        barcode = attrs.get('barcode', '').strip() if 'barcode' in attrs else ''
        if barcode:
            existing = ProductBarcode.objects.filter(barcode=barcode)
            if self.instance:
                existing = existing.exclude(product=self.instance)
            if existing.exists():
                raise serializers.ValidationError({
                    'barcode': 'This barcode is already registered to another product.'
                })

        if self.instance and {
            'opening_stock',
            'opening_stock_location',
        }.intersection(self.initial_data):
            raise serializers.ValidationError({
                'opening_stock':
                    'Opening stock can only be recorded when creating a product.'
            })

        opening_stock = attrs.get('opening_stock', Decimal('0'))
        opening_stock_location = attrs.get('opening_stock_location')
        is_active = attrs.get(
            'is_active',
            getattr(self.instance, 'is_active', True),
        )

        if opening_stock > 0 and not opening_stock_location:
            raise serializers.ValidationError({
                'opening_stock_location':
                    'Select a stock location when entering opening stock.'
            })

        if opening_stock > 0 and not is_active:
            raise serializers.ValidationError({
                'opening_stock':
                    'Opening stock can only be recorded for an active product.'
            })

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

    @transaction.atomic
    def create(self, validated_data):
        opening_stock = validated_data.pop('opening_stock', Decimal('0'))
        location = validated_data.pop('opening_stock_location', None)
        barcode = validated_data.pop('barcode', '').strip()
        barcode_type = validated_data.pop(
            'barcode_type',
            ProductBarcode.BarcodeType.OTHER,
        )
        product = super().create(validated_data)

        if barcode:
            ProductBarcode.objects.create(
                product=product,
                barcode=barcode,
                barcode_type=barcode_type,
                is_primary=True,
            )

        if opening_stock > 0:
            change_stock(
                product=product,
                location=location,
                quantity_delta=opening_stock,
                movement_type=StockMovement.MovementType.ADJUSTMENT,
                user=product.created_by,
                reference='OPENING',
                notes='Opening stock entered manually during product creation.',
            )

        return product

    @transaction.atomic
    def update(self, instance, validated_data):
        barcode = validated_data.pop('barcode', None)
        barcode_type = validated_data.pop(
            'barcode_type',
            ProductBarcode.BarcodeType.OTHER,
        )
        product = super().update(instance, validated_data)

        if isinstance(barcode, str) and barcode.strip():
            primary_barcode = (
                product.barcodes.filter(is_primary=True).first()
                or product.barcodes.first()
            )
            if primary_barcode:
                primary_barcode.barcode = barcode.strip()
                primary_barcode.barcode_type = barcode_type
                primary_barcode.is_primary = True
                primary_barcode.save()
            else:
                ProductBarcode.objects.create(
                    product=product,
                    barcode=barcode.strip(),
                    barcode_type=barcode_type,
                    is_primary=True,
                )

        return product
