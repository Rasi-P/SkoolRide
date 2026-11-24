from __future__ import annotations

from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.core.audit import record_audit
from apps.core.roles import Perm
from apps.core.utils import csv_response
from apps.core.views import TenantModelViewSet

from . import services
from .models import AbsenceRequest, Announcement, Complaint, ComplaintComment, PickupChangeRequest
from .serializers import (
    AbsenceRequestSerializer,
    AnnouncementSerializer,
    ComplaintCommentSerializer,
    ComplaintSerializer,
    ComplaintStatusSerializer,
    DecisionSerializer,
    PickupChangeRequestSerializer,
)


class AbsenceRequestViewSet(TenantModelViewSet):
    required_perms = {"GET": Perm.STUDENTS_VIEW, "POST": Perm.STUDENTS_MANAGE}
    serializer_class = AbsenceRequestSerializer
    queryset = AbsenceRequest.objects.select_related("student", "requested_by")
    filterset_fields = ["student", "status", "direction", "date_from"]
    search_fields = ["student__first_name", "student__last_name", "reason"]
    http_method_names = ["get", "post", "head", "options"]

    def create(self, request, *args, **kwargs):
        ser = self.get_serializer(data=request.data)
        ser.is_valid(raise_exception=True)
        d = dict(ser.validated_data)
        student = d.pop("student")
        absence = services.submit_absence(school=self.school, student=student, parent=None, data=d, request=request)
        return Response(self.get_serializer(absence).data, status=201)

    @action(detail=True, methods=["post"])
    def acknowledge(self, request, pk=None):
        return Response(self.get_serializer(services.acknowledge_absence(absence=self.get_object(), user=request.user, request=request)).data)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        return Response(self.get_serializer(services.cancel_absence(absence=self.get_object(), request=request)).data)


class PickupChangeRequestViewSet(TenantModelViewSet):
    required_perms = {"GET": Perm.ROUTES_VIEW, "POST": Perm.ROUTES_MANAGE}
    serializer_class = PickupChangeRequestSerializer
    queryset = PickupChangeRequest.objects.select_related(
        "student", "requested_by", "requested_route", "requested_pickup_stop", "requested_dropoff_stop", "decided_by"
    )
    filterset_fields = ["student", "status", "change_type"]
    search_fields = ["student__first_name", "student__last_name", "details"]
    http_method_names = ["get", "post", "head", "options"]

    def perform_create(self, serializer):
        obj = serializer.save(school=self.school)
        record_audit(action="pickup_change.submitted", request=self.request, target=obj)

    @extend_schema(request=DecisionSerializer)
    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        ser = DecisionSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        req = services.decide_pickup_change(
            req=self.get_object(), approve=True, user=request.user, notes=ser.validated_data["notes"], request=request
        )
        return Response(self.get_serializer(req).data)

    @extend_schema(request=DecisionSerializer)
    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        ser = DecisionSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        req = services.decide_pickup_change(
            req=self.get_object(), approve=False, user=request.user, notes=ser.validated_data["notes"], request=request
        )
        return Response(self.get_serializer(req).data)


class ComplaintViewSet(TenantModelViewSet):
    required_perms = {"GET": Perm.ENGAGEMENT_VIEW, "POST": Perm.ENGAGEMENT_MANAGE}
    serializer_class = ComplaintSerializer
    queryset = Complaint.objects.select_related("student", "raised_by", "assigned_to").prefetch_related("comments__author")
    filterset_fields = ["status", "category", "priority", "student", "assigned_to"]
    search_fields = ["ticket_number", "subject", "description", "student__first_name"]
    ordering_fields = ["created_at", "priority", "status"]
    http_method_names = ["get", "post", "patch", "head", "options"]

    def create(self, request, *args, **kwargs):
        ser = self.get_serializer(data=request.data)
        ser.is_valid(raise_exception=True)
        complaint = services.submit_complaint(school=self.school, user=request.user, data=dict(ser.validated_data), request=request)
        return Response(self.get_serializer(complaint).data, status=201)

    @extend_schema(request=ComplaintStatusSerializer)
    @action(detail=True, methods=["post"], url_path="set-status")
    def set_status(self, request, pk=None):
        ser = ComplaintStatusSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        c = services.update_complaint_status(
            complaint=self.get_object(),
            status=ser.validated_data["status"],
            notes=ser.validated_data.get("resolution_notes", ""),
            user=request.user,
            request=request,
        )
        return Response(self.get_serializer(c).data)

    @extend_schema(request=ComplaintCommentSerializer)
    @action(detail=True, methods=["post"])
    def comments(self, request, pk=None):
        complaint = self.get_object()
        ser = ComplaintCommentSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        comment = ComplaintComment.objects.create(school=self.school, complaint=complaint, author=request.user, **ser.validated_data)
        if not comment.is_internal and complaint.raised_by_id and complaint.raised_by_id != request.user.id:
            from apps.notifications.services import notify_users

            notify_users(
                school=self.school,
                recipients=[complaint.raised_by],
                category="COMPLAINT",
                title=f"Reply on {complaint.ticket_number}",
                body=comment.body[:500],
                dedupe_key=f"complaint_comment:{comment.id}",
            )
        return Response(ComplaintCommentSerializer(comment).data, status=201)

    @action(detail=False, methods=["get"])
    def export(self, request):
        qs = self.filter_queryset(self.get_queryset())
        return csv_response(
            "complaints.csv",
            ["ticket", "subject", "category", "priority", "status", "student", "raised_by", "created_at"],
            (
                (
                    c.ticket_number,
                    c.subject,
                    c.category,
                    c.priority,
                    c.status,
                    c.student and c.student.full_name,
                    c.raised_by and c.raised_by.email,
                    c.created_at,
                )
                for c in qs
            ),
        )


class AnnouncementViewSet(TenantModelViewSet):
    required_perms = {"GET": Perm.ENGAGEMENT_VIEW, "POST": Perm.ANNOUNCEMENTS_MANAGE}
    serializer_class = AnnouncementSerializer
    queryset = Announcement.objects.select_related("route", "created_by")
    filterset_fields = ["audience", "is_pinned", "route"]
    search_fields = ["title", "body"]

    def perform_create(self, serializer):
        send = serializer.validated_data.pop("send_notification", True)
        obj = serializer.save(school=self.school, created_by=self.request.user)
        record_audit(action="announcement.created", request=self.request, target=obj)
        if send and obj.is_live:
            services.publish_announcement(announcement=obj, request=self.request)

    def perform_update(self, serializer):
        serializer.validated_data.pop("send_notification", None)
        obj = serializer.save()
        record_audit(action="announcement.updated", request=self.request, target=obj)

    @action(detail=True, methods=["post"])
    def publish(self, request, pk=None):
        count = services.publish_announcement(announcement=self.get_object(), request=request)
        return Response({"sent": count}, status=status.HTTP_200_OK)
