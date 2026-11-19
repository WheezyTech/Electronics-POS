
from django.db.models import (
    DecimalField,
    ExpressionWrapper,
    F,
    OuterRef,
    Q,
    Subquery,
    Value,
)
from django.db.models.functions import Coalesce

from rest_framework import viewsets, filters
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.exceptions import ValidationError

from .models import (
    Category,
    ProductType,
    Brand,
    Unit,
    Product,
    ProductBarcode,
)

from .serializers import (
    CategorySerializer,
    ProductTypeSerializer,
    BrandSerializer,
    UnitSerializer,
    ProductSerializer,
    ProductBarcodeSerializer,
)

from .permissions import ProductAccessPermission
from apps.inventory.models import StockBalance, StockLocation


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


class ProductTypeViewSet(viewsets.ModelViewSet):
    queryset = ProductType.objects.all()
    serializer_class = ProductTypeSerializer
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
        'product_type',
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
        'product_type__name',
        'brand__name',
        'barcodes__barcode',
    ]

    ordering_fields = [
        'name',
        'cost_price',
        'selling_price',
        'created_at',
        'product_type__name',
    ]

    def get_queryset(self):
        queryset = super().get_queryset()
        location = self.request.query_params.get('location')

        if location:
            location_id = get_active_location_id(location)
            in_stock = self.request.query_params.get('in_stock', 'true')

            if in_stock.lower() not in ('true', 'false', '1', '0'):
                raise ValidationError({
                    'in_stock': 'Use true or false for the stock filter.'
                })

            available_quantity = ExpressionWrapper(
                F('stock_balances__quantity_on_hand')
                - F('stock_balances__quantity_reserved'),
                output_field=DecimalField(
                    max_digits=14,
                    decimal_places=3,
                ),
            )
            queryset = queryset.filter(is_active=True)

            if in_stock.lower() in ('true', '1'):
                queryset = queryset.filter(
                    stock_balances__location_id=location_id,
                    stock_balances__quantity_on_hand__gt=F(
                        'stock_balances__quantity_reserved'
                    ),
                ).annotate(
                    location_quantity_available=available_quantity
                )
            else:
                available_balance = (
                    StockBalance.objects.filter(
                        product_id=OuterRef('pk'),
                        location_id=location_id,
                    )
                    .annotate(
                        available=ExpressionWrapper(
                            F('quantity_on_hand') - F('quantity_reserved'),
                            output_field=DecimalField(
                                max_digits=14,
                                decimal_places=3,
                            ),
                        )
                    )
                    .values('available')[:1]
                )
                queryset = queryset.annotate(
                    location_quantity_available=Coalesce(
                        Subquery(
                            available_balance,
                            output_field=DecimalField(
                                max_digits=14,
                                decimal_places=3,
                            ),
                        ),
                        Value(
                            0,
                            output_field=DecimalField(
                                max_digits=14,
                                decimal_places=3,
                            ),
                        ),
                    )
                )

        for field in ('category', 'product_type', 'unit', 'brand'):
            value = self.request.query_params.get(field)
            if value:
                try:
                    filter_id = int(value)
                except (TypeError, ValueError):
                    raise ValidationError({
                        field: 'Select a valid filter option.'
                    })
                if filter_id <= 0:
                    raise ValidationError({
                        field: 'Select a valid filter option.'
                    })
                queryset = queryset.filter(
                    **{f'{field}_id': filter_id}
                )

        sku = self.request.query_params.get('sku', '').strip()
        if sku:
            queryset = queryset.filter(sku__icontains=sku)

        model_number = self.request.query_params.get(
            'model_number',
            '',
        ).strip()
        if model_number:
            queryset = queryset.filter(
                model_number__icontains=model_number
            )

        return queryset

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
