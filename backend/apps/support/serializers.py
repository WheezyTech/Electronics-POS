from rest_framework import serializers

from .models import SupportMessage


class SupportMessageSerializer(serializers.ModelSerializer):
    sender_name = serializers.CharField(source="sender.username", read_only=True)

    class Meta:
        model = SupportMessage
        fields = ["id", "sender", "sender_name", "body", "created_at", "read_at"]
        read_only_fields = fields


class SupportMessageInputSerializer(serializers.Serializer):
    body = serializers.CharField(max_length=4000, trim_whitespace=True)

    def validate_body(self, value):
        if not value.strip():
            raise serializers.ValidationError("Message cannot be empty.")
        return value.strip()
