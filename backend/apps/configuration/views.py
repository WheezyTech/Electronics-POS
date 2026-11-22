from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from apps.accounts.permissions import ReadOnlyStaffRoles
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework import serializers
from django.core.exceptions import ImproperlyConfigured

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