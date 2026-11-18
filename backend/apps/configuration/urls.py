from django.urls import path
from .views import BusinessSettingsAPIView

urlpatterns = [
    path("settings/", BusinessSettingsAPIView.as_view(), name="business-settings"),
]