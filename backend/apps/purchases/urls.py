
from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import (
    SupplierViewSet,
    PurchaseOrderViewSet,
    GoodsReceivedNoteViewSet,
    SupplierReturnViewSet,
    SupplierPaymentViewSet,
    SupplierInvoiceViewSet,
)


router = DefaultRouter()

router.register(
    "suppliers",
    SupplierViewSet,
    basename="supplier"
)

router.register(
    "orders",
    PurchaseOrderViewSet,
    basename="purchase-order"
)

router.register(
    "goods-received",
    GoodsReceivedNoteViewSet,
    basename="goods-received"
)

router.register(
    "supplier-returns",
    SupplierReturnViewSet,
    basename="supplier-returns"
)

router.register(
    "supplier-payments",
    SupplierPaymentViewSet,
    basename="supplier-payments"
)

router.register(
    "supplier-invoices",
    SupplierInvoiceViewSet,
    basename="supplier-invoices"
)

urlpatterns = [
    path("", include(router.urls)),
]
