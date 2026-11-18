
from django.db.models import DecimalField, ExpressionWrapper, F, Q

from rest_framework import viewsets, filters
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.exceptions import ValidationError

from .models import (
    Category,
    Brand,
    Unit,
    Product,
    ProductBarcode,
)

from .serializers import (
    CategorySerializer,
    BrandSerializer,
    UnitSerializer,
    ProductSerializer,
    ProductBarcodeSerializer,
)

from .permissions import ProductAccessPermission
from apps.inventory.models import StockLocation


def get_active_location_id(location_value):
    try:
        location_id = int(location_value)
    except (TypeError, ValueError):
        raise ValidationError({
            'location': 'Select a valid active stock location.'
        })

    if location_id <= 0 or not StockLocation.objects.filter(
        pk=location_id,
        is_active=True,
    ).exists():
        raise ValidationError({
            'location': 'Select a valid active stock location.'
        })

    return location_id


class CategoryViewSet(viewsets.ModelViewSet):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer
    permission_classes = [ProductAccessPermission]
    http_method_names = ['get', 'post', 'put', 'patch', 'head', 'options']

    search_fields = ['name', 'description']
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    ordering_fields = ['name', 'created_at']


class BrandViewSet(viewsets.ModelViewSet):
    queryset = Brand.objects.all()
    serializer_class = BrandSerializer
    permission_classes = [ProductAccessPermission]
    http_method_names = ['get', 'post', 'put', 'patch', 'head', 'options']

    search_fields = ['name', 'description']
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    ordering_fields = ['name', 'created_at']


class UnitViewSet(viewsets.ModelViewSet):
    queryset = Unit.objects.all()
    serializer_class = UnitSerializer
    permission_classes = [ProductAccessPermission]
    http_method_names = ['get', 'post', 'put', 'patch', 'head', 'options']

    search_fields = ['name', 'abbreviation']
    filter_backends = [filters.SearchFilter]


class ProductViewSet(viewsets.ModelViewSet):
    queryset = Product.objects.select_related(
        'category',
        'brand',
        'unit',
        'created_by',
    ).prefetch_related('barcodes')

    serializer_class = ProductSerializer
    permission_classes = [ProductAccessPermission]
    http_method_names = ['get', 'post', 'put', 'patch', 'head', 'options']

    filter_backends = [
        filters.SearchFilter,
        filters.OrderingFilter,
    ]

    search_fields = [
        'name',
        'sku',
        'model_number',
        'description',
        'category__name',
        'brand__name',
        'barcodes__barcode',
    ]

    ordering_fields = [
        'name',
        'cost_price',
        'selling_price',
        'created_at',
    ]

    def get_queryset(self):
        queryset = super().get_queryset()
        location = self.request.query_params.get('location')

        if not location:
            return queryset

        location_id = get_active_location_id(location)
        available_quantity = ExpressionWrapper(
            F('stock_balances__quantity_on_hand')
            - F('stock_balances__quantity_reserved'),
            output_field=DecimalField(
                max_digits=14,
                decimal_places=3,
            ),
        )

        return (
            queryset.filter(
                is_active=True,
                stock_balances__location_id=location_id,
                stock_balances__quantity_on_hand__gt=F(
                    'stock_balances__quantity_reserved'
                ),
            )
            .annotate(
                location_quantity_available=available_quantity
            )
        )

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(
        detail=False,
        methods=['get'],
        url_path='lookup',
        permission_classes=[IsAuthenticated],
    )
    def lookup(self, request):

        code = request.query_params.get('code', '').strip()
        location = request.query_params.get('location')

        if not code:
            raise ValidationError({
                'code': 'Provide a product SKU or barcode.'
            })

        matching_products = Product.objects.filter(
            Q(sku__iexact=code) |
            Q(barcodes__barcode=code)
        ).distinct()

        active_products = matching_products.filter(is_active=True)
        if location:
            location_id = get_active_location_id(location)
            active_products = active_products.filter(
                stock_balances__location_id=location_id,
                stock_balances__quantity_on_hand__gt=F(
                    'stock_balances__quantity_reserved'
                ),
            )

        product = active_products.distinct().first()

        if product is None:
            if not matching_products.exists():
                detail = 'Product not found.'
            elif not matching_products.filter(is_active=True).exists():
                detail = 'This product is inactive.'
            elif location:
                detail = (
                    'This product has no available stock at the '
                    'selected location.'
                )
            else:
                detail = 'This product is inactive.'

            return Response(
                {'detail': detail},
                status=404
            )

        serializer = self.get_serializer(product)

        return Response(serializer.data)


class ProductBarcodeViewSet(viewsets.ModelViewSet):
    queryset = ProductBarcode.objects.select_related('product')
    serializer_class = ProductBarcodeSerializer
    permission_classes = [ProductAccessPermission]
    http_method_names = ['get', 'post', 'put', 'patch', 'head', 'options']

    filter_backends = [filters.SearchFilter]
    search_fields = ['barcode', 'product__name', 'product__sku']
