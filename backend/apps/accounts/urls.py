
from django.urls import path, include
from rest_framework.routers import DefaultRouter

from rest_framework_simplejwt.views import TokenRefreshView

from .views import (
    CustomTokenObtainPairView,
    UserManagementViewSet,
)


router = DefaultRouter()

router.register(
    'users',
    UserManagementViewSet,
    basename='users'
)


urlpatterns = [
    path('login/', CustomTokenObtainPairView.as_view(), name='login'),

    path('refresh/', TokenRefreshView.as_view(), name='token_refresh'),

    path('', include(router.urls)),
]
