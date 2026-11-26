
from datetime import timedelta
import logging
import secrets

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.exceptions import ImproperlyConfigured
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
from .models import (
    AccountVerificationAudit,
    Device,
    OfflineAuthorization,
)
from .phone_verification import (
    PHONE_MAX_ATTEMPTS,
    PHONE_RESEND_COOLDOWN,
    PHONE_OTP_EXPIRY,
    generate_phone_otp,
    hash_phone_otp,
    normalize_kenyan_phone,
    send_phone_otp_sms,
)


User = get_user_model()
logger = logging.getLogger(__name__)

class CustomTokenObtainPairView(TokenObtainPairView):
    serializer_class = CustomTokenObtainPairSerializer


class DeviceTokenRefreshView(TokenRefreshView):
    serializer_class = DeviceTokenRefreshSerializer


class EmailAddressSerializer(serializers.Serializer):
    email = serializers.EmailField()


class AccountTokenSerializer(serializers.Serializer):
    uid = serializers.CharField()
    token = serializers.CharField()


class EmailOtpVerificationSerializer(serializers.Serializer):
    email = serializers.EmailField()
    otp = serializers.RegexField(regex=r"^\d{6}$")


class PhoneOtpVerificationSerializer(serializers.Serializer):
    otp = serializers.RegexField(regex=r"^\d{6}$")


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


class PhoneVerificationSendMixin:
    @staticmethod
    def send_for_user(request, selected_user):
        if not getattr(settings, "PHONE_VERIFICATION_ENABLED", False):
            return Response(
                {"detail": "Phone verification is currently disabled."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        if not selected_user.phone_number:
            return Response(
                {"detail": "This account has no phone number."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if selected_user.phone_verified:
            return Response({
                "detail": "Phone number is already verified.",
                "phone_verified": True,
            })

        now = timezone.now()
        if (
            selected_user.phone_verification_last_sent_at
            and now - selected_user.phone_verification_last_sent_at
            < PHONE_RESEND_COOLDOWN
        ):
            retry_after = int(
                PHONE_RESEND_COOLDOWN.total_seconds()
                - (now - selected_user.phone_verification_last_sent_at).total_seconds()
            )
            return Response(
                {
                    "detail": "Please wait before resending the OTP.",
                    "retry_after_seconds": max(1, retry_after),
                },
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        try:
            normalized_phone = normalize_kenyan_phone(
                selected_user.phone_number
            )
        except ValueError as error:
            return Response(
                {"detail": str(error)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        otp = generate_phone_otp()
        try:
            send_phone_otp_sms(normalized_phone, otp)
        except (ImproperlyConfigured, RuntimeError) as error:
            AccountVerificationAudit.objects.create(
                user=selected_user,
                action=AccountVerificationAudit.Action.PHONE_OTP_FAILED,
                details="SMS delivery failed.",
                performed_by=getattr(request, "user", None),
                ip_address=request.META.get("REMOTE_ADDR"),
            )
            logger.exception(
                "Phone OTP delivery failed for user id=%s",
                selected_user.pk,
            )
            return Response(
                {"detail": str(error)},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        selected_user.phone_number = normalized_phone
        selected_user.phone_verification_otp_hash = hash_phone_otp(otp)
        selected_user.phone_verification_otp_expires_at = (
            now + PHONE_OTP_EXPIRY
        )
        selected_user.phone_verification_last_sent_at = now
        selected_user.phone_verification_attempts = 0
        selected_user.save(update_fields=[
            "phone_number",
            "phone_verification_otp_hash",
            "phone_verification_otp_expires_at",
            "phone_verification_last_sent_at",
            "phone_verification_attempts",
        ])
        AccountVerificationAudit.objects.create(
            user=selected_user,
            action=AccountVerificationAudit.Action.PHONE_OTP_SENT,
            details="Phone OTP sent.",
            performed_by=getattr(request, "user", None),
            ip_address=request.META.get("REMOTE_ADDR"),
        )
        return Response({
            "detail": "Phone verification OTP sent.",
            "phone_verified": False,
            "retry_after_seconds": 60,
            "expires_in_seconds": 300,
        })


class PhoneVerificationSendView(PhoneVerificationSendMixin, APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "phone_verification_resend"

    def post(self, request):
        return self.send_for_user(request, request.user)


class PhoneVerificationVerifyView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "phone_verification"

    def post(self, request):
        if not getattr(settings, "PHONE_VERIFICATION_ENABLED", False):
            return Response(
                {"detail": "Phone verification is currently disabled."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        serializer = PhoneOtpVerificationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = request.user
        ip_address = request.META.get("REMOTE_ADDR")

        if user.phone_verified:
            return Response({
                "detail": "Phone number is already verified.",
                "phone_verified": True,
            })
        if (
            not user.phone_verification_otp_hash
            or not user.phone_verification_otp_expires_at
        ):
            return Response(
                {"detail": "Request a new phone verification OTP."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if timezone.now() > user.phone_verification_otp_expires_at:
            AccountVerificationAudit.objects.create(
                user=user,
                action=AccountVerificationAudit.Action.PHONE_OTP_FAILED,
                details="Phone OTP expired.",
                performed_by=user,
                ip_address=ip_address,
            )
            return Response(
                {"detail": "This verification OTP has expired."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if user.phone_verification_attempts >= PHONE_MAX_ATTEMPTS:
            AccountVerificationAudit.objects.create(
                user=user,
                action=AccountVerificationAudit.Action.PHONE_OTP_FAILED,
                details="Phone OTP maximum attempts reached.",
                performed_by=user,
                ip_address=ip_address,
            )
            return Response(
                {"detail": "Too many incorrect attempts. Request a new OTP."},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        otp_hash = hash_phone_otp(serializer.validated_data["otp"])
        if not secrets.compare_digest(
            otp_hash,
            user.phone_verification_otp_hash,
        ):
            user.phone_verification_attempts += 1
            user.save(update_fields=["phone_verification_attempts"])
            AccountVerificationAudit.objects.create(
                user=user,
                action=AccountVerificationAudit.Action.PHONE_OTP_FAILED,
                details=f"Incorrect phone OTP attempt {user.phone_verification_attempts}.",
                performed_by=user,
                ip_address=ip_address,
            )
            return Response(
                {
                    "detail": "Incorrect OTP.",
                    "attempts_remaining": max(
                        0,
                        PHONE_MAX_ATTEMPTS - user.phone_verification_attempts,
                    ),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        user.phone_verified = True
        user.phone_verification_otp_hash = ""
        user.phone_verification_otp_expires_at = None
        user.phone_verification_attempts = 0
        user.save(update_fields=[
            "phone_verified",
            "phone_verification_otp_hash",
            "phone_verification_otp_expires_at",
            "phone_verification_attempts",
        ])
        AccountVerificationAudit.objects.create(
            user=user,
            action=AccountVerificationAudit.Action.PHONE_OTP_VERIFIED,
            details="Phone OTP verified.",
            performed_by=user,
            ip_address=ip_address,
        )
        return Response({
            "detail": "Phone number verified successfully.",
            "phone_verified": True,
        })


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
            user.email_verification_otp = ""
            user.email_verification_otp_expires_at = None
            user.save(update_fields=[
                "email_verified",
                "email_verification_otp",
                "email_verification_otp_expires_at",
            ])

        return Response({"detail": "Email verified successfully."})


class EmailOtpVerificationView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "email_verification"

    def post(self, request):
        serializer = EmailOtpVerificationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        user = User.objects.filter(
            email__iexact=data["email"],
            is_active=True,
            email_verified=False,
        ).first()

        if (
            user is None
            or not user.email_verification_otp
            or not user.email_verification_otp_expires_at
            or timezone.now() > user.email_verification_otp_expires_at
            or data["otp"] != user.email_verification_otp
        ):
            return Response(
                {"detail": "This verification OTP is invalid or expired."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user.email_verified = True
        user.email_verification_otp = ""
        user.email_verification_otp_expires_at = None
        user.save(update_fields=[
            "email_verified",
            "email_verification_otp",
            "email_verification_otp_expires_at",
        ])
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
            try:
                send_email_verification(user)
            except (ImproperlyConfigured, RuntimeError):
                logger.exception(
                    "Email verification delivery failed for user id=%s",
                    user.pk,
                )
                return Response(
                    {
                        "detail": (
                            "We could not send the verification email right "
                            "now. Please try again later or contact the "
                            "administrator."
                        )
                    },
                    status=status.HTTP_503_SERVICE_UNAVAILABLE,
                )

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
            try:
                send_password_reset(user)
            except (ImproperlyConfigured, RuntimeError):
                logger.exception(
                    "Password reset email delivery failed for user id=%s",
                    user.pk,
                )
                return Response(
                    {
                        "detail": (
                            "We could not send the password reset email "
                            "right now. Please try again later."
                        )
                    },
                    status=status.HTTP_503_SERVICE_UNAVAILABLE,
                )

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
                User.Role.ELECTRONICS_CASHIER,
                User.Role.GAS_LPG_CASHIER,
                User.Role.SUPERVISOR,
                User.Role.ACCOUNTANT,
                User.Role.AUDITOR,
            ])
        return queryset

    @action(
        detail=True,
        methods=['post'],
        permission_classes=[IsAdministrator],
        url_path='mark-email-verified',
    )
    def mark_email_verified(self, request, pk=None):
        selected_user = self.get_object()
        selected_user.email_verified = True
        selected_user.email_verification_otp = ""
        selected_user.email_verification_otp_expires_at = None
        selected_user.save(update_fields=[
            "email_verified",
            "email_verification_otp",
            "email_verification_otp_expires_at",
        ])
        return Response({
            "detail": "Email marked as verified.",
            "email_verified": True,
        })

    @action(
        detail=True,
        methods=['post'],
        permission_classes=[IsAdministrator],
        url_path='resend-verification',
    )
    def resend_verification(self, request, pk=None):
        selected_user = self.get_object()
        try:
            send_email_verification(selected_user)
        except (ImproperlyConfigured, RuntimeError) as exc:
            logger.exception(
                "Email verification delivery failed for user id=%s",
                selected_user.pk,
            )
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        return Response({
            "detail": "Verification email sent.",
            "email_verification_sent": True,
        })

    @action(
        detail=True,
        methods=['post'],
        permission_classes=[IsAdministrator],
        url_path='mark-phone-verified',
    )
    def mark_phone_verified(self, request, pk=None):
        selected_user = self.get_object()
        if not selected_user.phone_number:
            return Response(
                {"detail": "This user has no phone number."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        selected_user.phone_verified = True
        selected_user.phone_verification_otp_hash = ""
        selected_user.phone_verification_otp_expires_at = None
        selected_user.phone_verification_attempts = 0
        selected_user.save(update_fields=[
            "phone_verified",
            "phone_verification_otp_hash",
            "phone_verification_otp_expires_at",
            "phone_verification_attempts",
        ])
        AccountVerificationAudit.objects.create(
            user=selected_user,
            action=AccountVerificationAudit.Action.PHONE_MANUAL_APPROVED,
            details="Manual phone approval by administrator.",
            performed_by=request.user,
            ip_address=request.META.get("REMOTE_ADDR"),
        )
        return Response({
            "detail": "Phone marked as verified.",
            "phone_verified": True,
        })

    @action(
        detail=True,
        methods=['post'],
        permission_classes=[IsAdministrator],
        url_path='resend-phone-verification',
    )
    def resend_phone_verification(self, request, pk=None):
        selected_user = self.get_object()
        response = PhoneVerificationSendMixin.send_for_user(
            request,
            selected_user,
        )
        return response

    def perform_create(self, serializer):
        user = serializer.save()
        self.email_verification_sent = False
        self.email_verification_error = ""
        self.phone_verification_sent = False
        self.phone_verification_error = ""
        try:
            send_email_verification(user)
            self.email_verification_sent = True
        except (ImproperlyConfigured, RuntimeError) as exc:
            self.email_verification_error = str(exc)

        if user.phone_number:
            if getattr(settings, "PHONE_VERIFICATION_ENABLED", False):
                response = PhoneVerificationSendMixin.send_for_user(
                    self.request,
                    user,
                )
                self.phone_verification_sent = response.status_code in (
                    status.HTTP_200_OK,
                    status.HTTP_201_CREATED,
                )
                if not self.phone_verification_sent:
                    self.phone_verification_error = response.data.get(
                        "detail",
                        "Phone OTP could not be sent.",
                    )

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        headers = self.get_success_headers(serializer.data)
        data = dict(serializer.data)
        data["email_verification_sent"] = getattr(
            self, "email_verification_sent", False
        )
        if getattr(self, "email_verification_error", ""):
            data["email_verification_error"] = self.email_verification_error
        data["phone_verification_sent"] = getattr(
            self,
            "phone_verification_sent",
            False,
        )
        if getattr(self, "phone_verification_error", ""):
            data["phone_verification_error"] = (
                self.phone_verification_error
            )
        return Response(data, status=status.HTTP_201_CREATED, headers=headers)

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
