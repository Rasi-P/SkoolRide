from __future__ import annotations

from rest_framework import serializers

from apps.accounts.models import User
from apps.core.roles import Role

from .models import (
    NotificationTemplate,
    PlatformSetting,
    School,
    SchoolApplication,
    SchoolMembership,
    SchoolSubscription,
    SubscriptionPlan,
)


class SubscriptionPlanSerializer(serializers.ModelSerializer):
    class Meta:
        model = SubscriptionPlan
        fields = "__all__"


class SchoolSubscriptionSerializer(serializers.ModelSerializer):
    plan_name = serializers.CharField(source="plan.name", read_only=True)
    plan_code = serializers.CharField(source="plan.code", read_only=True)
    is_usable = serializers.BooleanField(read_only=True)
    limits = serializers.SerializerMethodField()

    class Meta:
        model = SchoolSubscription
        fields = ("id", "plan", "plan_name", "plan_code", "status", "starts_at", "ends_at", "notes", "is_usable", "limits")

    def get_limits(self, obj):
        return {
            "max_vehicles": obj.plan.max_vehicles,
            "max_students": obj.plan.max_students,
            "max_staff": obj.plan.max_staff,
            "max_routes": obj.plan.max_routes,
        }


class SchoolApplicationPublicSerializer(serializers.ModelSerializer):
    class Meta:
        model = SchoolApplication
        fields = (
            "school_name",
            "contact_name",
            "contact_email",
            "contact_phone",
            "designation",
            "address",
            "city",
            "state",
            "country",
            "postal_code",
            "website",
            "estimated_students",
            "estimated_vehicles",
            "requested_plan",
            "message",
        )


class SchoolApplicationStatusSerializer(serializers.ModelSerializer):
    class Meta:
        model = SchoolApplication
        fields = ("tracking_code", "school_name", "status", "created_at", "reviewed_at")


class SchoolApplicationSerializer(serializers.ModelSerializer):
    requested_plan_name = serializers.CharField(source="requested_plan.name", read_only=True, default=None)
    reviewed_by_name = serializers.CharField(source="reviewed_by.full_name", read_only=True, default=None)
    school_id = serializers.UUIDField(source="school.id", read_only=True, default=None)

    class Meta:
        model = SchoolApplication
        fields = "__all__"
        read_only_fields = ("tracking_code", "status", "reviewed_by", "reviewed_at", "school")


class ApplicationDecisionSerializer(serializers.Serializer):
    notes = serializers.CharField(required=False, allow_blank=True)
    plan = serializers.PrimaryKeyRelatedField(queryset=SubscriptionPlan.objects.filter(is_active=True), required=False)


class SchoolListSerializer(serializers.ModelSerializer):
    subscription = SchoolSubscriptionSerializer(read_only=True)
    is_operational = serializers.BooleanField(read_only=True)
    stats = serializers.SerializerMethodField()
    admin_email = serializers.SerializerMethodField()
    onboarding = serializers.SerializerMethodField()

    class Meta:
        model = School
        fields = (
            "id",
            "name",
            "slug",
            "code",
            "logo",
            "status",
            "city",
            "state",
            "country",
            "email",
            "phone",
            "timezone",
            "is_operational",
            "subscription",
            "stats",
            "admin_email",
            "onboarding",
            "approved_at",
            "activated_at",
            "suspended_at",
            "suspension_reason",
            "created_at",
        )

    def get_stats(self, obj):
        return {
            "vehicles": getattr(obj, "vehicle_count", 0),
            "students": getattr(obj, "student_count", 0),
            "staff": getattr(obj, "staff_count", 0),
            "routes": getattr(obj, "route_count", 0),
        }

    def get_admin_email(self, obj):
        m = next((m for m in obj.memberships.all() if m.role == Role.SCHOOL_ADMIN and m.is_active), None)
        return m.user.email if m else None

    def get_onboarding(self, obj):
        from .services import onboarding_progress

        p = onboarding_progress(obj)
        return {"completed_steps": p["completed_steps"], "total_steps": p["total_steps"], "completed": p["completed"]}


class SchoolDetailSerializer(serializers.ModelSerializer):
    subscription = SchoolSubscriptionSerializer(read_only=True)
    is_operational = serializers.BooleanField(read_only=True)
    full_address = serializers.CharField(read_only=True)

    class Meta:
        model = School
        fields = "__all__"
        read_only_fields = ("slug", "code", "status", "approved_at", "activated_at", "suspended_at", "suspension_reason")


class SchoolProfileSerializer(SchoolDetailSerializer):
    """What a School Admin may edit about their own school."""

    class Meta(SchoolDetailSerializer.Meta):
        read_only_fields = SchoolDetailSerializer.Meta.read_only_fields + ("notes",)


class SchoolCreateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=160)
    email = serializers.EmailField(required=False, allow_blank=True)
    phone = serializers.CharField(max_length=32, required=False, allow_blank=True)
    address_line1 = serializers.CharField(max_length=160, required=False, allow_blank=True)
    city = serializers.CharField(max_length=80, required=False, allow_blank=True)
    state = serializers.CharField(max_length=80, required=False, allow_blank=True)
    country = serializers.CharField(max_length=80, required=False, default="India")
    postal_code = serializers.CharField(max_length=16, required=False, allow_blank=True)
    timezone = serializers.CharField(max_length=64, required=False, default="Asia/Kolkata")
    plan = serializers.PrimaryKeyRelatedField(queryset=SubscriptionPlan.objects.filter(is_active=True), required=False)
    admin_email = serializers.EmailField()
    admin_first_name = serializers.CharField(max_length=80)
    admin_last_name = serializers.CharField(max_length=80, required=False, allow_blank=True)


class SuspendSerializer(serializers.Serializer):
    reason = serializers.CharField()


class SubscriptionUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = SchoolSubscription
        fields = ("plan", "status", "starts_at", "ends_at", "notes")


class InviteAdminSerializer(serializers.Serializer):
    email = serializers.EmailField()
    first_name = serializers.CharField(max_length=80)
    last_name = serializers.CharField(max_length=80, required=False, allow_blank=True)
    role = serializers.ChoiceField(choices=[Role.SCHOOL_ADMIN, Role.TRANSPORT_MANAGER], default=Role.SCHOOL_ADMIN)


class MembershipSerializer(serializers.ModelSerializer):
    email = serializers.EmailField(source="user.email", read_only=True)
    full_name = serializers.CharField(source="user.full_name", read_only=True)
    phone = serializers.CharField(source="user.phone", read_only=True)
    user_is_active = serializers.BooleanField(source="user.is_active", read_only=True)
    last_login = serializers.DateTimeField(source="user.last_login", read_only=True)

    class Meta:
        model = SchoolMembership
        fields = ("id", "user", "email", "full_name", "phone", "role", "is_active", "is_primary", "user_is_active", "last_login", "created_at")
        read_only_fields = ("user", "role")


class PlatformSettingSerializer(serializers.ModelSerializer):
    class Meta:
        model = PlatformSetting
        fields = ("key", "value", "description", "updated_at")


class NotificationTemplateSerializer(serializers.ModelSerializer):
    class Meta:
        model = NotificationTemplate
        fields = ("id", "school", "category", "channel", "subject", "body", "is_active", "updated_at")
        read_only_fields = ("school",)


class PlatformUserSerializer(serializers.ModelSerializer):
    memberships = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ("id", "email", "first_name", "last_name", "phone", "is_active", "is_platform_admin", "last_login", "memberships", "created_at")

    def get_memberships(self, obj):
        return [{"school": m.school.name, "school_id": str(m.school_id), "role": m.role, "is_active": m.is_active} for m in obj.memberships.all()]
