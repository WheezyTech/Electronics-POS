
from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import (
    CustomTokenObtainPairView,
    DeviceViewSet,
    DeviceTokenRefreshView,
    EmailVerificationView,
    EmailVerificationRequestView,
    EmailOtpVerificationView,
    OfflineAuthorizationViewSet,
    PasswordResetConfirmView,
    PasswordResetRequestView,
    UserManagementViewSet,
    PhoneVerificationSendView,
    PhoneVerificationVerifyView,
)


router = DefaultRouter()

router.register(
    'users',
    UserManagementViewSet,
    basename='users'
)
router.register(
    'devices',
    DeviceViewSet,
    basename='devices'
)
router.register(
    'offline-authorizations',
    OfflineAuthorizationViewSet,
    basename='offline-authorizations'
)


urlpatterns = [
    path('login/', CustomTokenObtainPairView.as_view(), name='login'),

    path('refresh/', DeviceTokenRefreshView.as_view(), name='token_refresh'),
    path(
        'email-verification/',
        EmailVerificationView.as_view(),
        name='email-verification',
    ),
    path(
        'email-verification/request/',
        EmailVerificationRequestView.as_view(),
        name='email-verification-request',
    ),
    path(
        'email-verification/otp/',
        EmailOtpVerificationView.as_view(),
        name='email-verification-otp',
    ),
    path(
        'password-reset/',
        PasswordResetRequestView.as_view(),
        name='password-reset',
    ),
    path(
        'password-reset/confirm/',
        PasswordResetConfirmView.as_view(),
        name='password-reset-confirm',
    ),
    path(
        'phone-verification/send/',
        PhoneVerificationSendView.as_view(),
        name='phone-verification-send',
    ),
    path(
        'phone-verification/verify/',
        PhoneVerificationVerifyView.as_view(),
        name='phone-verification-verify',
    ),

    path('', include(router.urls)),
]
