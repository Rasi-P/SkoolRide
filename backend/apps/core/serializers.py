"""Serializer helpers that enforce tenant isolation on foreign keys."""

from __future__ import annotations

from rest_framework import serializers


class TenantPrimaryKeyRelatedField(serializers.PrimaryKeyRelatedField):
    """A PK field whose queryset is restricted to the school in the serializer context.

    This prevents cross-school foreign-key assignments: a school admin cannot attach a
    vehicle from another school to their route even if they guess its id.
    """

    def __init__(self, **kwargs):
        self.tenant_field = kwargs.pop("tenant_field", "school")
        super().__init__(**kwargs)

    def get_queryset(self):
        qs = super().get_queryset()
        school = self.context.get("school")
        if school is None:
            return qs.none()
        return qs.filter(**{self.tenant_field: school})


class AuditLogSerializer(serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    action = serializers.CharField()
    actor_email = serializers.CharField()
    target_type = serializers.CharField()
    target_id = serializers.CharField()
    target_repr = serializers.CharField()
    changes = serializers.JSONField()
    ip_address = serializers.CharField(allow_null=True)
    school = serializers.UUIDField(source="school_id", allow_null=True)
    school_name = serializers.CharField(source="school.name", default="", read_only=True)
    created_at = serializers.DateTimeField()
