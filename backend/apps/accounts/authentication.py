import uuid

from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.authentication import JWTAuthentication

from .models import Device


def get_active_device(sync_id):
    if not sync_id:
        raise AuthenticationFailed("Token is not bound to a device.")

    try:
        device_id = uuid.UUID(str(sync_id))
        device = Device.objects.only("id", "is_active").get(sync_id=device_id)
    except (ValueError, TypeError, DjangoValidationError, Device.DoesNotExist):
        raise AuthenticationFailed("Device identity is invalid or unknown.")

    if not device.is_active:
        raise AuthenticationFailed("This device has been deactivated.")

    return device


class DeviceJWTAuthentication(JWTAuthentication):
    def get_user(self, validated_token):
        user = super().get_user(validated_token)
        get_active_device(validated_token.get("device_sync_id"))
        return user
