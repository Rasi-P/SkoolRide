from __future__ import annotations

from django.db.models import Prefetch
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from apps.accounts.serializers import InvitationSerializer
from apps.core.audit import record_audit
from apps.core.roles import Perm
from apps.core.utils import csv_response, model_changes
from apps.core.views import TenantModelViewSet

from . import services
from .models import GuardianStudent, ParentProfile, StaffAttendance, StaffDocument, StaffLeave, StaffProfile, Student
from .serializers import (
    GuardianLinkSerializer,
    ParentProfileSerializer,
    StaffAttendanceSerializer,
    StaffDocumentSerializer,
    StaffInviteSerializer,
    StaffLeaveSerializer,
    StaffProfileSerializer,
    StudentSerializer,
    StudentStatusChangeSerializer,
)


class StaffProfileViewSet(TenantModelViewSet):
    required_perms = {"GET": Perm.STAFF_VIEW, "POST": Perm.STAFF_MANAGE}
    serializer_class = StaffProfileSerializer
    queryset = StaffProfile.objects.select_related("membership__user").prefetch_related("documents", "vehicle_assignments__vehicle")
    filterset_fields = ["staff_type", "status"]
    search_fields = ["first_name", "last_name", "employee_id", "phone", "email"]
    ordering_fields = ["first_name", "joining_date", "created_at", "staff_type"]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def perform_create(self, serializer):
        obj = serializer.save(school=self.school)
        record_audit(action="staff.created", request=self.request, target=obj)

    def perform_update(self, serializer):
        changes = model_changes(serializer.instance, serializer.validated_data, serializer.validated_data.keys())
        obj = serializer.save()
        record_audit(action="staff.updated", request=self.request, target=obj, changes=changes)

    def perform_destroy(self, instance):
        instance.status = StaffProfile.Status.INACTIVE
        instance.save(update_fields=["status"])
        if instance.membership_id:
            instance.membership.is_active = False
            instance.membership.save(update_fields=["is_active"])
        record_audit(action="staff.deactivated", request=self.request, target=instance)

    @extend_schema(request=StaffInviteSerializer, responses=InvitationSerializer)
    @action(detail=True, methods=["post"])
    def invite(self, request, pk=None):
        ser = StaffInviteSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        inv = services.invite_staff(staff=self.get_object(), actor=request.user, email=ser.validated_data.get("email"), request=request)
        return Response(InvitationSerializer(inv).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], url_path="deactivate-access")
    def deactivate_access(self, request, pk=None):
        services.set_membership_active(self.get_object(), False, request=request, action="staff.access_deactivated")
        return Response(self.get_serializer(self.get_object()).data)

    @action(detail=True, methods=["post"], url_path="activate-access")
    def activate_access(self, request, pk=None):
        services.set_membership_active(self.get_object(), True, request=request, action="staff.access_activated")
        return Response(self.get_serializer(self.get_object()).data)

    @action(detail=True, methods=["get", "post"])
    def documents(self, request, pk=None):
        staff = self.get_object()
        if request.method == "GET":
            return Response(StaffDocumentSerializer(staff.documents.all(), many=True).data)
        ser = StaffDocumentSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        doc = ser.save(staff=staff, school=self.school)
        record_audit(action="staff.document_added", request=request, target=doc)
        return Response(StaffDocumentSerializer(doc).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["get"])
    def history(self, request, pk=None):
        staff = self.get_object()
        assignments = staff.vehicle_assignments.select_related("vehicle").order_by("-start_date")
        return Response(
            [
                {
                    "id": str(a.id),
                    "vehicle": a.vehicle.registration_number,
                    "role": a.role,
                    "start_date": a.start_date,
                    "end_date": a.end_date,
                    "is_active": a.is_active,
                }
                for a in assignments
            ]
        )

    @action(detail=False, methods=["get"])
    def export(self, request):
        qs = self.filter_queryset(self.get_queryset())
        return csv_response(
            "staff.csv",
            ["employee_id", "name", "type", "phone", "email", "status", "licence_expiry", "joining_date"],
            ((s.employee_id, s.full_name, s.staff_type, s.phone, s.email, s.status, s.licence_expiry, s.joining_date) for s in qs),
        )


class StaffDocumentViewSet(TenantModelViewSet):
    required_perms = {"GET": Perm.STAFF_VIEW, "POST": Perm.STAFF_MANAGE}
    serializer_class = StaffDocumentSerializer
    queryset = StaffDocument.objects.select_related("staff")
    filterset_fields = ["staff", "doc_type"]
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    http_method_names = ["get", "patch", "delete", "head", "options"]


class StaffLeaveViewSet(TenantModelViewSet):
    required_perms = {"GET": Perm.STAFF_VIEW, "POST": Perm.STAFF_MANAGE}
    serializer_class = StaffLeaveSerializer
    queryset = StaffLeave.objects.select_related("staff")
    filterset_fields = ["staff", "status"]
    ordering_fields = ["start_date"]

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        leave = self.get_object()
        leave.status = StaffLeave.Status.APPROVED
        leave.decided_by = request.user
        leave.save(update_fields=["status", "decided_by"])
        leave.staff.status = StaffProfile.Status.ON_LEAVE
        leave.staff.save(update_fields=["status"])
        record_audit(action="staff.leave_approved", request=request, target=leave)
        return Response(self.get_serializer(leave).data)

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        leave = self.get_object()
        leave.status = StaffLeave.Status.REJECTED
        leave.decided_by = request.user
        leave.save(update_fields=["status", "decided_by"])
        record_audit(action="staff.leave_rejected", request=request, target=leave)
        return Response(self.get_serializer(leave).data)


class StaffAttendanceViewSet(TenantModelViewSet):
    required_perms = {"GET": Perm.STAFF_VIEW, "POST": Perm.STAFF_MANAGE}
    serializer_class = StaffAttendanceSerializer
    queryset = StaffAttendance.objects.select_related("staff")
    filterset_fields = ["staff", "date", "status"]
    ordering_fields = ["date"]

    def create(self, request, *args, **kwargs):
        """Upsert attendance for (staff, date)."""
        ser = self.get_serializer(data=request.data)
        ser.is_valid(raise_exception=True)
        obj, _ = StaffAttendance.objects.update_or_create(
            school=self.school,
            staff=ser.validated_data["staff"],
            date=ser.validated_data["date"],
            defaults={"status": ser.validated_data["status"], "note": ser.validated_data.get("note", "")},
        )
        return Response(self.get_serializer(obj).data, status=status.HTTP_201_CREATED)


class StudentViewSet(TenantModelViewSet):
    required_perms = {"GET": Perm.STUDENTS_VIEW, "POST": Perm.STUDENTS_MANAGE}
    serializer_class = StudentSerializer
    queryset = Student.objects.prefetch_related(
        "guardian_links__parent",
        "transport_assignments__route__vehicle",
        "transport_assignments__pickup_stop",
        "transport_assignments__dropoff_stop",
        "fee_assignments__fee_plan",
    )
    filterset_fields = ["grade", "section", "status", "transport_status", "transport_assignments__route"]
    search_fields = ["first_name", "last_name", "admission_number", "guardian_links__parent__phone"]
    ordering_fields = ["first_name", "grade", "admission_number", "created_at"]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get_queryset(self):
        return super().get_queryset().distinct()

    def perform_create(self, serializer):
        obj = serializer.save(school=self.school)
        record_audit(action="student.created", request=self.request, target=obj)

    def perform_update(self, serializer):
        changes = model_changes(serializer.instance, serializer.validated_data, serializer.validated_data.keys())
        obj = serializer.save()
        record_audit(action="student.updated", request=self.request, target=obj, changes=changes)

    def perform_destroy(self, instance):
        services.change_student_status(student=instance, status=Student.Status.INACTIVE, reason="Deleted by admin", request=self.request)

    @extend_schema(request=StudentStatusChangeSerializer)
    @action(detail=True, methods=["post"])
    def transfer(self, request, pk=None):
        ser = StudentStatusChangeSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        services.change_student_status(
            student=self.get_object(), status=Student.Status.TRANSFERRED, reason=ser.validated_data.get("reason", ""), request=request
        )
        return Response(self.get_serializer(self.get_object()).data)

    @extend_schema(request=StudentStatusChangeSerializer)
    @action(detail=True, methods=["post"], url_path="withdraw-transport")
    def withdraw_transport(self, request, pk=None):
        ser = StudentStatusChangeSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        services.withdraw_transport(student=self.get_object(), reason=ser.validated_data.get("reason", ""), request=request)
        return Response(self.get_serializer(self.get_object()).data)

    @action(detail=True, methods=["post"])
    def reactivate(self, request, pk=None):
        student = self.get_object()
        student.status = Student.Status.ACTIVE
        student.transport_status = Student.TransportStatus.ACTIVE
        student.status_reason = ""
        student.save()
        record_audit(action="student.reactivated", request=request, target=student)
        return Response(self.get_serializer(student).data)

    @action(detail=True, methods=["get"])
    def history(self, request, pk=None):
        from apps.routing.serializers import StudentTransportAssignmentSerializer

        student = self.get_object()
        qs = student.transport_assignments.select_related("route", "pickup_stop", "dropoff_stop").order_by("-start_date")
        return Response(StudentTransportAssignmentSerializer(qs, many=True).data)

    @action(detail=False, methods=["post"], url_path="import", parser_classes=[MultiPartParser, FormParser, JSONParser])
    def import_csv(self, request):
        """Upload a CSV. `?commit=true` writes valid rows, otherwise returns a validation preview."""
        commit = str(request.query_params.get("commit", "false")).lower() == "true"
        if "file" in request.FILES:
            rows = services.parse_student_csv(request.FILES["file"])
        else:
            rows = request.data.get("rows") or []
        if commit:
            return Response(services.commit_student_import(self.school, rows, request=request))
        return Response(services.validate_student_import(self.school, rows))

    @action(detail=False, methods=["get"], url_path="import-template")
    def import_template(self, request):
        return csv_response(
            "student_import_template.csv",
            [
                "admission_number",
                "first_name",
                "last_name",
                "grade",
                "section",
                "gender",
                "date_of_birth",
                "pickup_address",
                "parent_first_name",
                "parent_last_name",
                "parent_email",
                "parent_phone",
                "parent_relationship",
            ],
            [
                [
                    "ADM1001",
                    "Aarav",
                    "Sharma",
                    "5",
                    "A",
                    "M",
                    "2015-06-12",
                    "12 Rose Garden Lane",
                    "Rohit",
                    "Sharma",
                    "rohit.sharma@example.com",
                    "+919800000001",
                    "FATHER",
                ]
            ],
        )

    @action(detail=False, methods=["get"])
    def export(self, request):
        qs = self.filter_queryset(self.get_queryset())
        rows = []
        for s in qs:
            active = next((a for a in s.transport_assignments.all() if a.is_active), None)
            primary = next((g for g in s.guardian_links.all() if g.is_primary), None) or next(iter(s.guardian_links.all()), None)
            rows.append(
                (
                    s.admission_number,
                    s.full_name,
                    s.grade,
                    s.section,
                    s.status,
                    s.transport_status,
                    active.route.name if active else "",
                    active.pickup_stop.name if active and active.pickup_stop else "",
                    primary.parent.full_name if primary else "",
                    primary.parent.phone if primary else "",
                )
            )
        return csv_response(
            "students.csv",
            ["admission_number", "name", "grade", "section", "status", "transport_status", "route", "pickup_stop", "guardian", "guardian_phone"],
            rows,
        )


class ParentProfileViewSet(TenantModelViewSet):
    required_perms = {"GET": Perm.PARENTS_VIEW, "POST": Perm.PARENTS_MANAGE}
    serializer_class = ParentProfileSerializer
    queryset = ParentProfile.objects.select_related("membership__user").prefetch_related(
        Prefetch("guardian_links", queryset=GuardianStudent.objects.select_related("student"))
    )
    filterset_fields = ["status"]
    search_fields = ["first_name", "last_name", "email", "phone", "guardian_links__student__first_name"]
    ordering_fields = ["first_name", "created_at", "status"]

    def get_queryset(self):
        return super().get_queryset().distinct()

    def perform_create(self, serializer):
        obj = serializer.save(school=self.school)
        record_audit(action="parent.created", request=self.request, target=obj)

    def perform_update(self, serializer):
        changes = model_changes(serializer.instance, serializer.validated_data, serializer.validated_data.keys())
        obj = serializer.save()
        record_audit(action="parent.updated", request=self.request, target=obj, changes=changes)

    def perform_destroy(self, instance):
        if instance.membership_id:
            services.set_membership_active(instance, False, request=self.request, action="parent.suspended")
        else:
            instance.status = ParentProfile.Status.SUSPENDED
            instance.save(update_fields=["status"])

    @action(detail=True, methods=["post"])
    def invite(self, request, pk=None):
        inv = services.invite_parent(parent=self.get_object(), actor=request.user, request=request)
        return Response(InvitationSerializer(inv).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def suspend(self, request, pk=None):
        services.set_membership_active(self.get_object(), False, request=request, action="parent.suspended")
        return Response(self.get_serializer(self.get_object()).data)

    @action(detail=True, methods=["post"])
    def activate(self, request, pk=None):
        services.set_membership_active(self.get_object(), True, request=request, action="parent.activated")
        return Response(self.get_serializer(self.get_object()).data)

    @action(detail=True, methods=["post"], url_path="reset-password")
    def reset_password(self, request, pk=None):
        from apps.accounts.services import send_password_reset_email

        parent = self.get_object()
        send_password_reset_email(parent.email)
        record_audit(action="parent.password_reset_sent", request=request, target=parent)
        return Response({"detail": "Password reset email sent."})

    @action(detail=True, methods=["get"])
    def communications(self, request, pk=None):
        from apps.notifications.models import Notification
        from apps.notifications.serializers import NotificationSerializer

        parent = self.get_object()
        if parent.membership_id is None:
            return Response([])
        qs = Notification.objects.filter(school=self.school, recipient=parent.membership.user).order_by("-created_at")[:50]
        return Response(NotificationSerializer(qs, many=True).data)

    @action(detail=False, methods=["get"])
    def export(self, request):
        qs = self.filter_queryset(self.get_queryset())
        return csv_response(
            "parents.csv",
            ["name", "email", "phone", "status", "children"],
            ((p.full_name, p.email, p.phone, p.status, "; ".join(g.student.full_name for g in p.guardian_links.all())) for p in qs),
        )


class GuardianLinkViewSet(TenantModelViewSet):
    required_perms = {"GET": Perm.STUDENTS_VIEW, "POST": Perm.STUDENTS_MANAGE}
    serializer_class = GuardianLinkSerializer
    queryset = GuardianStudent.objects.select_related("parent", "student")
    filterset_fields = ["parent", "student", "relationship", "is_primary"]

    def perform_create(self, serializer):
        obj = serializer.save(school=self.school)
        record_audit(action="guardian.linked", request=self.request, target=obj)

    def perform_destroy(self, instance):
        record_audit(action="guardian.unlinked", request=self.request, target=instance)
        instance.delete()
