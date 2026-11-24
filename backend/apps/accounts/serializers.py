from __future__ import annotations

from django.contrib.auth import authenticate, password_validation
from rest_framework import serializers

from apps.core.roles import permissions_for_role

from .models import Invitation, User


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, trim_whitespace=False)

    def validate(self, attrs):
        user = authenticate(request=self.context.get("request"), username=attrs["email"].lower(), password=attrs["password"])
        if user is None:
            raise serializers.ValidationError("Invalid email or password.")
        if not user.is_active:
            raise serializers.ValidationError("This account has been deactivated.")
        attrs["user"] = user
        return attrs


class MembershipSummarySerializer(serializers.Serializer):
    id = serializers.UUIDField()
    role = serializers.CharField()
    is_primary = serializers.BooleanField()
    school_id = serializers.UUIDField()
    school_name = serializers.CharField(source="school.name")
    school_slug = serializers.CharField(source="school.slug")
    school_status = serializers.CharField(source="school.status")
    school_is_operational = serializers.BooleanField(source="school.is_operational")
    school_timezone = serializers.CharField(source="school.timezone")
    school_logo = serializers.SerializerMethodField()
    onboarding_completed = serializers.BooleanField(source="school.onboarding_completed")
    permissions = serializers.SerializerMethodField()

    def get_permissions(self, obj):
        return sorted(permissions_for_role(obj.role))

    def get_school_logo(self, obj):
        logo = obj.school.logo
        if not logo:
            return None
        request = self.context.get("request")
        return request.build_absolute_uri(logo.url) if request else logo.url


class UserSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(read_only=True)
    memberships = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = (
            "id",
            "email",
            "first_name",
            "last_name",
            "full_name",
            "phone",
            "avatar",
            "is_platform_admin",
            "must_change_password",
            "memberships",
            "created_at",
        )
        read_only_fields = ("id", "email", "is_platform_admin", "must_change_password", "created_at")

    def get_memberships(self, obj):
        memberships = obj.memberships.select_related("school").filter(is_active=True).order_by("created_at")
        return MembershipSummarySerializer(memberships, many=True, context=self.context).data


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True, trim_whitespace=False)
    new_password = serializers.CharField(write_only=True, trim_whitespace=False)

    def validate_current_password(self, value):
        if not self.context["request"].user.check_password(value):
            raise serializers.ValidationError("Current password is incorrect.")
        return value

    def validate_new_password(self, value):
        password_validation.validate_password(value, self.context["request"].user)
        return value


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()


class PasswordResetConfirmSerializer(serializers.Serializer):
    uid = serializers.CharField()
    token = serializers.CharField()
    new_password = serializers.CharField(write_only=True, trim_whitespace=False)

    def validate_new_password(self, value):
        password_validation.validate_password(value)
        return value


class InvitationPublicSerializer(serializers.ModelSerializer):
    school_name = serializers.CharField(source="school.name", read_only=True)
    existing_account = serializers.SerializerMethodField()

    class Meta:
        model = Invitation
        fields = ("email", "first_name", "last_name", "role", "school_name", "expires_at", "status", "existing_account")

    def get_existing_account(self, obj):
        return User.objects.filter(email=obj.email).exists()


class InvitationAcceptSerializer(serializers.Serializer):
    token = serializers.CharField()
    first_name = serializers.CharField(max_length=80, required=False, allow_blank=True)
    last_name = serializers.CharField(max_length=80, required=False, allow_blank=True)
    phone = serializers.CharField(max_length=32, required=False, allow_blank=True)
    password = serializers.CharField(write_only=True, required=False, trim_whitespace=False)
    current_password = serializers.CharField(write_only=True, required=False, trim_whitespace=False)

    def validate_password(self, value):
        if value:
            password_validation.validate_password(value)
        return value


class InvitationSerializer(serializers.ModelSerializer):
    invited_by_name = serializers.CharField(source="invited_by.full_name", read_only=True, default="")
    accept_url = serializers.SerializerMethodField()

    class Meta:
        model = Invitation
        fields = (
            "id",
            "email",
            "first_name",
            "last_name",
            "role",
            "status",
            "expires_at",
            "accepted_at",
            "invited_by_name",
            "accept_url",
            "created_at",
        )
        read_only_fields = fields

    def get_accept_url(self, obj):
        # Only exposed to the inviting admins (and in demo mode) to make demos reproducible.
        from django.conf import settings

        if not settings.DEMO_MODE:
            return None
        return f"{settings.FRONTEND_URL}/invite/{obj.token}"
