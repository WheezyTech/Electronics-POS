from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import status

from .models import BusinessSettings
from .serializers import BusinessSettingsSerializer
from .permissions import IsAdministrator


class BusinessSettingsAPIView(APIView):
    permission_classes = [IsAuthenticated]

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