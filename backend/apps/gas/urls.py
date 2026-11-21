from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    BrandViewSet, SizeViewSet, CylinderViewSet, StockViewSet, MovementViewSet,
    DepositViewSet, RefillViewSet, ExchangeViewSet, PurchaseViewSet,
    NewCylinderSaleViewSet, GasReportAPIView,
)

router = DefaultRouter()
router.register("brands", BrandViewSet, basename="gas-brands")
router.register("sizes", SizeViewSet, basename="gas-sizes")
router.register("cylinders", CylinderViewSet, basename="gas-cylinders")
router.register("stock", StockViewSet, basename="gas-stock")
router.register("movements", MovementViewSet, basename="gas-movements")
router.register("deposits", DepositViewSet, basename="gas-deposits")
router.register("refills", RefillViewSet, basename="gas-refills")
router.register("exchanges", ExchangeViewSet, basename="gas-exchanges")
router.register("purchases", PurchaseViewSet, basename="gas-purchases")
router.register("sales", NewCylinderSaleViewSet, basename="gas-sales")

urlpatterns = [
    path("reports/", GasReportAPIView.as_view(), name="gas-reports"),
] + router.urls
