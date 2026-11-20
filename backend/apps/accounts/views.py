
from datetime import timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.utils.encoding import force_str
from django.utils.http import urlsafe_base64_decode
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from .serializers import CustomTokenObtainPairSerializer
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from django.utils import timezone

from .serializers import (
    CustomTokenObtainPairSerializer,
    DeviceTokenRefreshSerializer,
    DeviceSerializer,
    OfflineAuthorizationSerializer,
    UserManagementSerializer,
    MyProfileSerializer,
)

from .permissions import IsAdministrator, IsStoreManager
from .email_tokens import (
    email_verification_token,
    send_email_verification,
    send_password_reset,
)
from .models import Device, OfflineAuthorization


User = get_user_model()

class CustomTokenObtainPairView(TokenObtainPairView):
    serializer_class = CustomTokenObtainPairSerializer


class DeviceTokenRefreshView(TokenRefreshView):
    serializer_class = DeviceTokenRefreshSerializer


class EmailAddressSerializer(serializers.Serializer):
    email = serializers.EmailField()


class AccountTokenSerializer(serializers.Serializer):
    uid = serializers.CharField()
    token = serializers.CharField()


class PasswordResetConfirmSerializer(AccountTokenSerializer):
    password = serializers.CharField(write_only=True)


def get_user_from_uid(uid):
    try:
        user_id = force_str(urlsafe_base64_decode(uid))
        return User.objects.get(pk=user_id)
    except (
        TypeError,
        ValueError,
        OverflowError,
        UnicodeDecodeError,
        User.DoesNotExist,
    ):
        return None


class EmailVerificationView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "email_verification"

    def post(self, request):
        serializer = AccountTokenSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = get_user_from_uid(serializer.validated_data["uid"])

        if (
            user is None
            or not user.is_active
            or not email_verification_token.check_token(
                user,
                serializer.validated_data["token"],
            )
        ):
            return Response(
                {"detail": "This email verification link is invalid or expired."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not user.email_verified:
            user.email_verified = True
            user.save(update_fields=["email_verified"])

        return Response({"detail": "Email verified successfully."})


class EmailVerificationRequestView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "email_verification"

    def post(self, request):
        serializer = EmailAddressSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = User.objects.filter(
            email__iexact=serializer.validated_data["email"],
            is_active=True,
            email_verified=False,
        ).first()
        if user:
            send_email_verification(user)

        return Response({
            "detail": (
                "If an active account with an unverified email exists, "
                "a verification link has been sent."
            )
        })


class PasswordResetRequestView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "password_reset"

    def post(self, request):
        serializer = EmailAddressSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = User.objects.filter(
            email__iexact=serializer.validated_data["email"],
            is_active=True,
            email_verified=True,
        ).first()
        if user:
            send_password_reset(user)

        return Response({
            "detail": (
                "If an active account with a verified email exists, "
                "a password reset link has been sent."
            )
        })


class PasswordResetConfirmView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "password_reset"

    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = get_user_from_uid(serializer.validated_data["uid"])
        token = serializer.validated_data["token"]

        if (
            user is None
            or not user.is_active
            or not user.email_verified
            or not default_token_generator.check_token(user, token)
        ):
            return Response(
                {"detail": "This password reset link is invalid or expired."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        password = serializer.validated_data["password"]
        try:
            validate_password(password, user)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(
                {"password": exc.messages}
            ) from exc

        user.set_password(password)
        user.save(update_fields=["password"])
        return Response({"detail": "Password reset successfully."})


class DeviceViewSet(viewsets.ModelViewSet):
    serializer_class = DeviceSerializer
    lookup_field = "sync_id"
    http_method_names = ["get", "post", "head", "options"]

    def get_queryset(self):
        user = self.request.user
        queryset = Device.objects.select_related("registered_by", "deactivated_by")
        if user.is_superuser or user.role == User.Role.ADMINISTRATOR:
            return queryset
        return queryset.filter(registered_by=user)

    def get_permissions(self):
        if self.action == "deactivate":
            return [IsAdministrator()]
        return [IsAuthenticated()]

    @action(detail=True, methods=["post"], url_path="deactivate")
    def deactivate(self, request, sync_id=None):
        device = self.get_object()
        if device.is_active:
            device.is_active = False
            device.deactivated_at = timezone.now()
            device.deactivated_by = request.user
            device.save(update_fields=[
                "is_active",
                "deactivated_at",
                "deactivated_by",
            ])

        return Response({
            "message": "Device deactivated successfully.",
            "sync_id": str(device.sync_id),
        })


class OfflineAuthorizationViewSet(viewsets.ModelViewSet):
    queryset = OfflineAuthorization.objects.select_related(
        "user",
        "device",
        "authorized_by",
        "revoked_by",
    )
    serializer_class = OfflineAuthorizationSerializer
    permission_classes = [IsAdministrator]
    http_method_names = ["get", "post", "head", "options"]

    @transaction.atomic
    def perform_create(self, serializer):
        now = timezone.now()
        grant_data = serializer.validated_data
        OfflineAuthorization.objects.filter(
            user=grant_data["user"],
            device=grant_data["device"],
            operation=grant_data["operation"],
            revoked_at__isnull=True,
        ).update(revoked_at=now, revoked_by=self.request.user)
        serializer.save(
            authorized_by=self.request.user,
            granted_at=now,
            expires_at=now + timedelta(hours=12),
        )

    @action(detail=True, methods=["post"], url_path="revoke")
    def revoke(self, request, pk=None):
        grant = self.get_object()
        if grant.revoked_at is None:
            grant.revoked_at = timezone.now()
            grant.revoked_by = request.user
            grant.save(update_fields=["revoked_at", "revoked_by"])

        return Response({
            "message": "Offline authorization revoked.",
            "id": grant.id,
        })


class UserManagementViewSet(viewsets.ModelViewSet):

    queryset = User.objects.all().order_by('-date_joined')
    serializer_class = UserManagementSerializer
    permission_classes = [IsAdministrator]

    http_method_names = [
        'get',
        'post',
        'put',
        'patch',
        'head',
        'options',
    ]

    def get_permissions(self):
        if self.action in ['list', 'create']:
            return [IsStoreManager()]
        return super().get_permissions()

    def get_queryset(self):
        queryset = super().get_queryset()
        if (
            self.request.user.is_authenticated
            and self.request.user.role == User.Role.STORE_MANAGER
            and not self.request.user.is_superuser
        ):
            return queryset.filter(role__in=[
                User.Role.CASHIER,
                User.Role.ACCOUNTANT,
                User.Role.AUDITOR,
            ])
        return queryset

    def perform_create(self, serializer):
        with transaction.atomic():
            user = serializer.save()
            send_email_verification(user)

    @action(
        detail=False,
        methods=['get'],
        permission_classes=[IsAuthenticated],
        url_path='me'
    )
    def me(self, request):
        serializer = MyProfileSerializer(
            request.user,
            context={"request": request},
        )

        return Response(serializer.data)

    @action(
        detail=True,
        methods=['post'],
        url_path='deactivate'
    )
    def deactivate(self, request, pk=None):
        user = self.get_object()

        if user.pk == request.user.pk:
            return Response(
                {'detail': 'You cannot deactivate your own account.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        user.is_active = False
        user.save(update_fields=['is_active'])

        return Response({
            'message': 'User account deactivated successfully.'
        })

    @action(
        detail=True,
        methods=['post'],
        url_path='activate'
    )
    def activate(self, request, pk=None):
        user = self.get_object()

        user.is_active = True
        user.save(update_fields=['is_active'])

        return Response({
            'message': 'User account activated successfully.'
        })
