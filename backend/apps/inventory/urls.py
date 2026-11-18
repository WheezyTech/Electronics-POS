
from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import (
    StockLocationViewSet,
    StockBalanceViewSet,
    StockMovementViewSet,
    StockReceiveAPIView,
    StockIssueAPIView,
    StockAdjustmentAPIView,
    StockTransferAPIView,
    LowStockAPIView,
)

from .views import (
    StocktakeListCreateAPIView,
    StocktakeDetailAPIView,
    StocktakeCountAPIView,
    StocktakeCompleteAPIView,
)

router = DefaultRouter()

router.register(
    "locations",
    StockLocationViewSet,
    basename="stock-location",
)

router.register(
    "balances",
    StockBalanceViewSet,
    basename="stock-balance",
)

router.register(
    "movements",
    StockMovementViewSet,
    basename="stock-movement",
)

urlpatterns = [
    path("", include(router.urls)),

    path("receive/", StockReceiveAPIView.as_view(), name="stock-receive"),
    path("issue/", StockIssueAPIView.as_view(), name="stock-issue"),
    path("adjustments/", StockAdjustmentAPIView.as_view(), name="stock-adjustment"),
    path("transfers/", StockTransferAPIView.as_view(), name="stock-transfer"),
    path("low-stock/", LowStockAPIView.as_view(), name="low-stock"),

    path(
        "stocktakes/",
        StocktakeListCreateAPIView.as_view(),
        name="stocktake-list-create",
    ),

    path(
        "stocktakes/<int:pk>/",
        StocktakeDetailAPIView.as_view(),
        name="stocktake-detail",
    ),

    path(
        "stocktakes/<int:session_id>/lines/<int:line_id>/",
        StocktakeCountAPIView.as_view(),
        name="stocktake-count",
    ),

    path(
        "stocktakes/<int:pk>/complete/",
        StocktakeCompleteAPIView.as_view(),
        name="stocktake-complete",
    ),
]
