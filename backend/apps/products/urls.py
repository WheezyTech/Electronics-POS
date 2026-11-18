
from rest_framework.routers import DefaultRouter

from .views import (
    CategoryViewSet,
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
