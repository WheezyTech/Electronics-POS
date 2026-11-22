from django.urls import path
from .views import BusinessSettingsAPIView, ContactMessageAPIView

urlpatterns = [
    path("settings/", BusinessSettingsAPIView.as_view(), name="business-settings"),
    path("contact/", ContactMessageAPIView.as_view(), name="contact-message"),
]