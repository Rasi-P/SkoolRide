from __future__ import annotations

from rest_framework import serializers

from .models import Notification, NotificationDelivery, NotificationPreference, PushSubscription


class NotificationDeliverySerializer(serializers.ModelSerializer):
    class Meta:
        model = NotificationDelivery
        fields = ("channel", "status", "attempts", "last_error", "sent_at")


class NotificationSerializer(serializers.ModelSerializer):
    deliveries = NotificationDeliverySerializer(many=True, read_only=True)
    recipient_email = serializers.EmailField(source="recipient.email", read_only=True)
    recipient_name = serializers.CharField(source="recipient.full_name", read_only=True)
    student_name = serializers.CharField(source="student.full_name", read_only=True, default=None)

    class Meta:
        model = Notification
        fields = (
            "id",
            "category",
            "title",
            "body",
            "data",
            "trip",
            "student",
            "student_name",
            "is_read",
            "read_at",
            "created_at",
            "deliveries",
            "recipient_email",
            "recipient_name",
        )


class NotificationPreferenceSerializer(serializers.ModelSerializer):
    class Meta:
        model = NotificationPreference
        fields = ("push_enabled", "email_enabled", "sms_enabled", "muted_categories", "quiet_hours_start", "quiet_hours_end")


class PushSubscribeSerializer(serializers.Serializer):
    endpoint = serializers.URLField(max_length=600)
    keys = serializers.DictField(child=serializers.CharField())
    user_agent = serializers.CharField(required=False, allow_blank=True, default="")

    def validate_keys(self, keys):
        if "p256dh" not in keys or "auth" not in keys:
            raise serializers.ValidationError("keys must include p256dh and auth")
        return keys


class PushSubscriptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = PushSubscription
        fields = ("id", "endpoint", "user_agent", "is_active", "created_at", "last_used_at")


class SendNotificationSerializer(serializers.Serializer):
    """Admin-initiated notification to parents of selected students or everyone."""

    title = serializers.CharField(max_length=160)
    body = serializers.CharField()
    category = serializers.ChoiceField(choices=["ANNOUNCEMENT", "SYSTEM", "TRIP_DELAY", "FEE_DUE"], default="ANNOUNCEMENT")
    audience = serializers.ChoiceField(choices=["ALL_PARENTS", "ROUTE", "STUDENTS", "STAFF"], default="ALL_PARENTS")
    route = serializers.UUIDField(required=False, allow_null=True)
    students = serializers.ListField(child=serializers.UUIDField(), required=False, default=list)
