from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from apps.accounts.permissions import ReadOnlyStaffRoles
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework import serializers
from django.core.exceptions import ImproperlyConfigured
import os

from apps.accounts.email_tokens import send_contact_message

from .models import BusinessSettings
from .serializers import BusinessSettingsSerializer
from .permissions import IsAdministrator


class BusinessSettingsAPIView(APIView):
    permission_classes = [IsAuthenticated, ReadOnlyStaffRoles]

    def get_settings(self):
        settings, created = BusinessSettings.objects.get_or_create(
            pk=1,
            defaults={
                "business_name": "Electronics POS",
                "currency": "KES",
                "timezone": "Africa/Nairobi",
            }
        )
        return settings

    def get(self, request):
        settings = self.get_settings()

        serializer = BusinessSettingsSerializer(settings)

        return Response(serializer.data)

    def patch(self, request):
        if not IsAdministrator().has_permission(request, self):
            return Response(
                {"detail": "Only administrators can modify settings."},
                status=status.HTTP_403_FORBIDDEN
            )

        settings = self.get_settings()

        serializer = BusinessSettingsSerializer(
            settings,
            data=request.data,
            partial=True
        )

        serializer.is_valid(raise_exception=True)
        serializer.save()

        return Response(serializer.data)


class ContactMessageSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=150)
    email = serializers.EmailField()
    phone = serializers.CharField(max_length=30, required=False, allow_blank=True)
    subject = serializers.CharField(max_length=150)
    message = serializers.CharField(max_length=5000)


class ContactMessageAPIView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = ContactMessageSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            send_contact_message(**serializer.validated_data)
        except (ImproperlyConfigured, RuntimeError) as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        return Response(
            {"detail": "Your message has been sent successfully."},
            status=status.HTTP_201_CREATED,
        )


class ApplicationUpdatesAPIView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        return Response({
            "android": {
                "latest_version": os.getenv("ANDROID_LATEST_VERSION", "1.0.8"),
                "latest_version_code": int(os.getenv("ANDROID_LATEST_VERSION_CODE", "9")),
                "download_url": os.getenv(
                    "ANDROID_APK_DOWNLOAD_URL",
                    "https://www.electronicspos.shop/downloads/electronics-pos.apk",
                ),
                "release_notes": os.getenv(
                    "ANDROID_RELEASE_NOTES",
                    "Gas and LPG interface improvements: refreshed overview, refill, exchange, cylinder sale, gas purchase, and sales history screens.",
                ),
                "mandatory": os.getenv("ANDROID_UPDATE_MANDATORY", "False").lower() == "true",
            },
            "windows": {
                "latest_version": os.getenv("WINDOWS_LATEST_VERSION", "1.0.9"),
                "download_url": os.getenv(
                    "WINDOWS_UPDATE_URL",
                    "https://radiant-inspiration-production-77d51767.up.railway.app/downloads",
                ),
                "release_notes": os.getenv(
                    "WINDOWS_RELEASE_NOTES",
                    "Gas and LPG interface improvements, including clearer operations and sales history.",
                ),
                "mandatory": os.getenv("WINDOWS_UPDATE_MANDATORY", "False").lower() == "true",
            },
        })