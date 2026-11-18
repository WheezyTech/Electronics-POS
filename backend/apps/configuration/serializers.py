from rest_framework import serializers
from .models import BusinessSettings


class BusinessSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = BusinessSettings
        fields = "__all__"
        read_only_fields = ["id", "updated_at"]

    def validate_tax_rate(self, value):
        if value < 0 or value > 100:
            raise serializers.ValidationError(
                "Tax rate must be between 0 and 100."
            )
        return value

    def validate_currency(self, value):
        value = value.strip().upper()

        if not value:
            raise serializers.ValidationError(
                "Currency is required."
            )

        return value