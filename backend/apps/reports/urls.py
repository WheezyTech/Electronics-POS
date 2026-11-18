from django.urls import path

from .views import (
    DashboardOverviewAPIView,
    InventoryReportAPIView,
    PurchasingReportAPIView,
)

urlpatterns = [
    path("dashboard/", DashboardOverviewAPIView.as_view(), name="dashboard"),
    path("inventory/", InventoryReportAPIView.as_view(), name="inventory-report"),
    path("purchasing/", PurchasingReportAPIView.as_view(), name="purchasing-report"),
]