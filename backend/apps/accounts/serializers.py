
from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.serializers import (
    TokenObtainPairSerializer,
    TokenRefreshSerializer,
)
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.exceptions import TokenError
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.utils import timezone

from rest_framework import serializers

from .authentication import get_active_device
from .models import Device, OfflineAuthorization
from .phone_verification import normalize_kenyan_phone


User = get_user_model()


def get_current_offline_authorizations(user, device):
    now = timezone.now()
    grants = OfflineAuthorization.objects.filter(
        user=user,
        device=device,
        granted_at__lte=now,
        expires_at__gt=now,
        revoked_at__isnull=True,
    )
    return [
        {
            "id": grant.id,
            "operation": grant.operation,
            "granted_at": grant.granted_at.isoformat(),
            "expires_at": grant.expires_at.isoformat(),
        }
        for grant in grants
    ]


class DeviceSerializer(serializers.ModelSerializer):

    class Meta:
        model = Device
        fields = [
            "id",
            "sync_id",
            "name",
            "platform",
            "registered_by",
            "is_active",
            "created_at",
            "last_seen_at",
            "deactivated_at",
            "deactivated_by",
        ]
        read_only_fields = [
            "id",
            "sync_id",
            "registered_by",
            "is_active",
            "created_at",
            "last_seen_at",
            "deactivated_at",
            "deactivated_by",
        ]

    def create(self, validated_data):
        return Device.objects.create(
            registered_by=self.context["request"].user,
            **validated_data,
        )


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    device_sync_id = serializers.UUIDField(write_only=True)
    device_name = serializers.CharField(max_length=100, write_only=True)
    device_platform = serializers.ChoiceField(
        choices=Device.Platform.choices,
        write_only=True,
    )

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)

        token['username'] = user.username
        token['email'] = user.email
        token['role'] = user.role

        return token

    def validate(self, attrs):
        data = super().validate(attrs)
        user = self.user
        device, _ = Device.objects.get_or_create(
            sync_id=attrs["device_sync_id"],
            defaults={
                "name": attrs["device_name"],
                "platform": attrs["device_platform"],
                "registered_by": user,
            },
        )

        if not device.is_active:
            raise serializers.ValidationError({
                "device_sync_id": "This device has been deactivated."
            })

        device.last_seen_at = timezone.now()
        device.save(update_fields=["last_seen_at"])

        refresh = RefreshToken(data["refresh"])
        refresh["device_sync_id"] = str(device.sync_id)
        data["refresh"] = str(refresh)
        data["access"] = str(refresh.access_token)
        data["device"] = {
            "sync_id": str(device.sync_id),
            "name": device.name,
            "platform": device.platform,
        }
        data["offline_authorizations"] = get_current_offline_authorizations(
            user,
            device,
        )

        data['user'] = {
            'id': user.id,
            'username': user.username,
            'email': user.email,
            'email_verified': user.email_verified,
            'phone_verified': user.phone_verified,
            'first_name': user.first_name,
            'last_name': user.last_name,
            'phone_number': user.phone_number,
            'role': user.role,
            'is_staff': user.is_staff,
            'is_superuser': user.is_superuser,
        }

        return data


class DeviceTokenRefreshSerializer(TokenRefreshSerializer):
    def validate(self, attrs):
        try:
            refresh = self.token_class(attrs["refresh"])
        except TokenError as exc:
            raise serializers.ValidationError({
                "refresh": "Token is invalid or expired."
            }) from exc

        try:
            get_active_device(refresh.get("device_sync_id"))
        except AuthenticationFailed as exc:
            raise serializers.ValidationError({
                "refresh": str(exc.detail)
            }) from exc

        return super().validate(attrs)


class OfflineAuthorizationSerializer(serializers.ModelSerializer):

    class Meta:
        model = OfflineAuthorization
        fields = [
            "id",
            "user",
            "device",
            "operation",
            "authorized_by",
            "granted_at",
            "expires_at",
            "revoked_at",
            "revoked_by",
        ]
        read_only_fields = [
            "id",
            "authorized_by",
            "granted_at",
            "expires_at",
            "revoked_at",
            "revoked_by",
        ]

    def validate(self, attrs):
        user = attrs["user"]
        device = attrs["device"]
        if not user.is_active:
            raise serializers.ValidationError(
                {"user": "Inactive users cannot receive offline authorization."}
            )
        if not device.is_active:
            raise serializers.ValidationError(
                {"device": "Inactive devices cannot receive offline authorization."}
            )
        return attrs


class UserManagementSerializer(serializers.ModelSerializer):

    password = serializers.CharField(
        write_only=True,
        required=True,
        validators=[validate_password]
    )
    email_verification_otp = serializers.SerializerMethodField()
    email_verification_otp_expires_at = serializers.SerializerMethodField()

    class Meta:
        model = User

        fields = [
            'id',
            'username',
            'email',
            'first_name',
            'last_name',
            'phone_number',
            'role',
            'password',
            'is_active',
            'is_staff',
            'is_superuser',
            'created_at',
            'email_verified',
            'email_verification_otp',
            'email_verification_otp_expires_at',
            'phone_verified',
        ]

        read_only_fields = [
            'id',
            'is_staff',
            'is_superuser',
            'created_at',
            'email_verified',
            'phone_verified',
        ]

    def get_email_verification_otp(self, user):
        request = self.context.get('request')
        if not request or not (
            request.user.is_superuser
            or request.user.role == User.Role.ADMINISTRATOR
        ):
            return ""
        return user.email_verification_otp

    def get_email_verification_otp_expires_at(self, user):
        request = self.context.get('request')
        if not request or not (
            request.user.is_superuser
            or request.user.role == User.Role.ADMINISTRATOR
        ):
            return None
        return user.email_verification_otp_expires_at

    def validate_role(self, value):
        request = self.context.get('request')
        if (
            request
            and request.user.role == User.Role.STORE_MANAGER
            and value not in {
                User.Role.CASHIER,
                User.Role.ELECTRONICS_CASHIER,
                User.Role.GAS_LPG_CASHIER,
                User.Role.SUPERVISOR,
                User.Role.ACCOUNTANT,
                User.Role.AUDITOR,
            }
        ):
            raise serializers.ValidationError(
                'Store managers can only register cashier, accountant, '
                'or auditor accounts.'
            )
        return value

    def create(self, validated_data):
        password = validated_data.pop('password')

        role = validated_data.get('role')

        phone_number = validated_data.get('phone_number')
        if phone_number:
            try:
                validated_data['phone_number'] = normalize_kenyan_phone(
                    phone_number
                )
            except ValueError as error:
                raise serializers.ValidationError(
                    {"phone_number": str(error)}
                )

        user = User(**validated_data)

        user.set_password(password)

        # Only administrators receive Django staff access.
        user.is_staff = role == User.Role.ADMINISTRATOR

        user.save()

        return user

    def update(self, instance, validated_data):
        password = validated_data.pop('password', None)

        phone_number = validated_data.get('phone_number')
        if phone_number:
            try:
                validated_data['phone_number'] = normalize_kenyan_phone(
                    phone_number
                )
            except ValueError as error:
                raise serializers.ValidationError(
                    {"phone_number": str(error)}
                )
            if validated_data['phone_number'] != instance.phone_number:
                instance.phone_verified = False
                instance.phone_verification_otp_hash = ""
                instance.phone_verification_otp_expires_at = None
                instance.phone_verification_attempts = 0

        for attr, value in validated_data.items():
            setattr(instance, attr, value)

        if password:
            validate_password(password, instance)
            instance.set_password(password)

        instance.is_staff = (
            instance.role == User.Role.ADMINISTRATOR
        )

        instance.save()

        return instance


class MyProfileSerializer(serializers.ModelSerializer):
    offline_authorizations = serializers.SerializerMethodField()

    class Meta:
        model = User

        fields = [
            'id',
            'username',
            'email',
            'first_name',
            'last_name',
            'phone_number',
            'role',
            'email_verified',
            'phone_verified',
            'offline_authorizations',
        ]

        read_only_fields = [
            'id',
            'username',
            'role',
            'email_verified',
            'phone_verified',
        ]

    def get_offline_authorizations(self, user):
        request = self.context.get("request")
        token = request.auth if request else None
        device_sync_id = token.get("device_sync_id") if token else None
        device = Device.objects.filter(
            sync_id=device_sync_id,
            is_active=True,
        ).first()
        if device is None:
            return []
        return get_current_offline_authorizations(user, device)
