from django.urls import path
from rest_framework.routers import DefaultRouter
from .views import (
    SaleViewSet,
    SaleReturnViewSet,
    CashierShiftViewSet,
    MpesaInitiateAPIView,
    MpesaStatusAPIView,
    MpesaCallbackAPIView,
)

router = DefaultRouter()
router.register("sales", SaleViewSet, basename="sales")
router.register("returns", SaleReturnViewSet, basename="sale-returns")
router.register("shifts", CashierShiftViewSet, basename="cashier-shifts")

urlpatterns = [
    path(
        "mpesa/initiate/",
        MpesaInitiateAPIView.as_view(),
        name="mpesa-initiate",
    ),
    path(
        "mpesa/status/<uuid:transaction_id>/",
        MpesaStatusAPIView.as_view(),
        name="mpesa-status",
    ),
    path(
        "mpesa/callback/",
        MpesaCallbackAPIView.as_view(),
        name="mpesa-callback",
    ),
] + router.urls