from __future__ import annotations

from rest_framework import serializers

from apps.core.serializers import TenantPrimaryKeyRelatedField
from apps.people.models import Student
from apps.routing.models import Route, RouteStop

from .models import AbsenceRequest, Announcement, Complaint, ComplaintComment, PickupChangeRequest


class AbsenceRequestSerializer(serializers.ModelSerializer):
    student = TenantPrimaryKeyRelatedField(queryset=Student.objects.all())
    student_name = serializers.CharField(source="student.full_name", read_only=True)
    student_class = serializers.CharField(source="student.class_label", read_only=True)
    requested_by_name = serializers.CharField(source="requested_by.full_name", read_only=True, default=None)

    class Meta:
        model = AbsenceRequest
        fields = (
            "id",
            "student",
            "student_name",
            "student_class",
            "requested_by_name",
            "date_from",
            "date_to",
            "direction",
            "reason",
            "status",
            "acknowledged_at",
            "created_at",
        )
        read_only_fields = ("status", "acknowledged_at")

    def validate(self, attrs):
        if attrs["date_to"] < attrs["date_from"]:
            raise serializers.ValidationError({"date_to": "End date must be on or after start date."})
        return attrs


class PickupChangeRequestSerializer(serializers.ModelSerializer):
    student = TenantPrimaryKeyRelatedField(queryset=Student.objects.all())
    requested_route = TenantPrimaryKeyRelatedField(queryset=Route.objects.all(), required=False, allow_null=True)
    requested_pickup_stop = TenantPrimaryKeyRelatedField(queryset=RouteStop.objects.all(), required=False, allow_null=True)
    requested_dropoff_stop = TenantPrimaryKeyRelatedField(queryset=RouteStop.objects.all(), required=False, allow_null=True)
    student_name = serializers.CharField(source="student.full_name", read_only=True)
    student_class = serializers.CharField(source="student.class_label", read_only=True)
    requested_by_name = serializers.CharField(source="requested_by.full_name", read_only=True, default=None)
    requested_route_name = serializers.CharField(source="requested_route.name", read_only=True, default=None)
    requested_pickup_stop_name = serializers.CharField(source="requested_pickup_stop.name", read_only=True, default=None)
    requested_dropoff_stop_name = serializers.CharField(source="requested_dropoff_stop.name", read_only=True, default=None)
    decided_by_name = serializers.CharField(source="decided_by.full_name", read_only=True, default=None)
    current_assignment = serializers.SerializerMethodField()

    class Meta:
        model = PickupChangeRequest
        fields = (
            "id",
            "student",
            "student_name",
            "student_class",
            "requested_by_name",
            "change_type",
            "effective_date",
            "end_date",
            "requested_route",
            "requested_route_name",
            "requested_pickup_stop",
            "requested_pickup_stop_name",
            "requested_dropoff_stop",
            "requested_dropoff_stop_name",
            "details",
            "status",
            "decided_by_name",
            "decided_at",
            "decision_notes",
            "current_assignment",
            "created_at",
        )
        read_only_fields = ("status", "decided_at", "decision_notes")

    def get_current_assignment(self, obj):
        a = obj.student.transport_assignments.filter(is_active=True).select_related("route", "pickup_stop").first()
        return {"route": a.route.name, "pickup_stop": a.pickup_stop.name if a.pickup_stop else None} if a else None

    def validate(self, attrs):
        route = attrs.get("requested_route")
        for key in ("requested_pickup_stop", "requested_dropoff_stop"):
            stop = attrs.get(key)
            if stop and route and stop.route_id != route.id:
                raise serializers.ValidationError({key: "Stop does not belong to the requested route."})
        if attrs.get("change_type") in ("STOP_CHANGE", "TEMPORARY") and not attrs.get("requested_pickup_stop"):
            raise serializers.ValidationError({"requested_pickup_stop": "Select the requested stop."})
        return attrs


class DecisionSerializer(serializers.Serializer):
    notes = serializers.CharField(required=False, allow_blank=True, default="")


class ComplaintCommentSerializer(serializers.ModelSerializer):
    author_name = serializers.CharField(source="author.full_name", read_only=True, default=None)

    class Meta:
        model = ComplaintComment
        fields = ("id", "author_name", "body", "is_internal", "created_at")


class ComplaintSerializer(serializers.ModelSerializer):
    student = TenantPrimaryKeyRelatedField(queryset=Student.objects.all(), required=False, allow_null=True)
    student_name = serializers.CharField(source="student.full_name", read_only=True, default=None)
    raised_by_name = serializers.CharField(source="raised_by.full_name", read_only=True, default=None)
    raised_by_email = serializers.CharField(source="raised_by.email", read_only=True, default=None)
    assigned_to_name = serializers.CharField(source="assigned_to.full_name", read_only=True, default=None)
    comments = serializers.SerializerMethodField()

    class Meta:
        model = Complaint
        fields = (
            "id",
            "ticket_number",
            "student",
            "student_name",
            "raised_by_name",
            "raised_by_email",
            "category",
            "priority",
            "subject",
            "description",
            "status",
            "assigned_to",
            "assigned_to_name",
            "resolution_notes",
            "resolved_at",
            "trip",
            "comments",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("ticket_number", "status", "resolved_at", "resolution_notes")

    def get_comments(self, obj):
        qs = obj.comments.all()
        if self.context.get("hide_internal"):
            qs = [c for c in qs if not c.is_internal]
        return ComplaintCommentSerializer(qs, many=True).data


class ComplaintStatusSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=Complaint.Status.choices)
    resolution_notes = serializers.CharField(required=False, allow_blank=True, default="")


class AnnouncementSerializer(serializers.ModelSerializer):
    route = TenantPrimaryKeyRelatedField(queryset=Route.objects.all(), required=False, allow_null=True)
    route_name = serializers.CharField(source="route.name", read_only=True, default=None)
    created_by_name = serializers.CharField(source="created_by.full_name", read_only=True, default=None)
    is_live = serializers.BooleanField(read_only=True)
    send_notification = serializers.BooleanField(write_only=True, required=False, default=True)

    class Meta:
        model = Announcement
        fields = (
            "id",
            "title",
            "body",
            "audience",
            "route",
            "route_name",
            "is_pinned",
            "publish_at",
            "expires_at",
            "created_by_name",
            "notification_sent_at",
            "is_live",
            "send_notification",
            "created_at",
        )
        read_only_fields = ("notification_sent_at",)
