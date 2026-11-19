
from rest_framework.routers import DefaultRouter

from .views import (
    CategoryViewSet,
    ProductTypeViewSet,
    BrandViewSet,
    UnitViewSet,
    ProductViewSet,
    ProductBarcodeViewSet,
)


router = DefaultRouter()

router.register(
    'categories',
    CategoryViewSet,
    basename='categories'
)

router.register(
    'product-types',
    ProductTypeViewSet,
    basename='product-types'
)

router.register(
    'brands',
    BrandViewSet,
    basename='brands'
)

router.register(
    'units',
    UnitViewSet,
    basename='units'
)

router.register(
    'products',
    ProductViewSet,
    basename='products'
)

router.register(
    'barcodes',
    ProductBarcodeViewSet,
    basename='barcodes'
)


urlpatterns = router.urls
