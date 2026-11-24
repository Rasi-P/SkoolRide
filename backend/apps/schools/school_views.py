"""School-scoped settings, dashboard, memberships and audit log (School Admin / Transport Manager)."""

from __future__ import annotations

from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema as _extend_schema
from rest_framework import generics, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import Invitation
from apps.accounts.serializers import InvitationSerializer
from apps.core.audit import record_audit
from apps.core.models import AuditLog
from apps.core.permissions import HasSchoolPerm
from apps.core.roles import Perm
from apps.core.serializers import AuditLogSerializer
from apps.core.tenancy import resolve_tenant
from apps.core.utils import csv_response

from . import services
from .models import NotificationTemplate, SchoolMembership
from .serializers import MembershipSerializer, NotificationTemplateSerializer, SchoolProfileSerializer


class SchoolProfileView(generics.RetrieveUpdateAPIView):
    permission_classes = [HasSchoolPerm]
    required_perms = {"GET": Perm.SCHOOL_VIEW, "PUT": Perm.SCHOOL_MANAGE, "PATCH": Perm.SCHOOL_MANAGE}
    serializer_class = SchoolProfileSerializer
    allow_non_operational = True  # admins of a suspended school can still see their status

    def get_object(self):
        return resolve_tenant(self.request).school

    def perform_update(self, serializer):
        before = {f: str(getattr(serializer.instance, f)) for f in serializer.validated_data}
        school = serializer.save()
        changes = {k: [before[k], str(v)] for k, v in serializer.validated_data.items() if before[k] != str(v)}
        record_audit(action="school.profile_updated", request=self.request, school=school, target=school, changes=changes)


@_extend_schema(request=None, responses={200: OpenApiTypes.OBJECT})
class SchoolOnboardingView(APIView):
    permission_classes = [HasSchoolPerm]
    required_perms = Perm.DASHBOARD_VIEW

    def get(self, request):
        return Response(services.onboarding_progress(resolve_tenant(request).school))

    def post(self, request):
        school = resolve_tenant(request).school
        school.onboarding_dismissed = True
        school.save(update_fields=["onboarding_dismissed"])
        return Response({"dismissed": True})


@_extend_schema(responses={200: OpenApiTypes.OBJECT})
class SchoolDashboardView(APIView):
    permission_classes = [HasSchoolPerm]
    required_perms = Perm.DASHBOARD_VIEW

    def get(self, request):
        from apps.reports.services import school_dashboard

        return Response(school_dashboard(resolve_tenant(request).school))


class SchoolMembershipViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [HasSchoolPerm]
    required_perms = {"GET": Perm.STAFF_VIEW, "POST": Perm.STAFF_MANAGE}
    serializer_class = MembershipSerializer
    filterset_fields = ["role", "is_active"]
    search_fields = ["user__email", "user__first_name", "user__last_name"]

    def get_queryset(self):
        return SchoolMembership.objects.select_related("user").filter(school=resolve_tenant(self.request).school)

    @action(detail=True, methods=["post"])
    def deactivate(self, request, pk=None):
        m = self.get_object()
        if m.user_id == request.user.id:
            return Response({"detail": "You cannot deactivate your own access.", "code": "self"}, status=400)
        m.is_active = False
        m.save(update_fields=["is_active"])
        record_audit(action="membership.deactivated", request=request, target=m)
        return Response(self.get_serializer(m).data)

    @action(detail=True, methods=["post"])
    def activate(self, request, pk=None):
        m = self.get_object()
        m.is_active = True
        m.save(update_fields=["is_active"])
        record_audit(action="membership.activated", request=request, target=m)
        return Response(self.get_serializer(m).data)


class SchoolInvitationViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [HasSchoolPerm]
    required_perms = {"GET": Perm.STAFF_VIEW, "POST": Perm.STAFF_MANAGE}
    serializer_class = InvitationSerializer
    filterset_fields = ["status", "role"]
    search_fields = ["email", "first_name", "last_name"]

    def get_queryset(self):
        return Invitation.objects.select_related("invited_by").filter(school=resolve_tenant(self.request).school)

    @action(detail=True, methods=["post"])
    def revoke(self, request, pk=None):
        inv = self.get_object()
        inv.status = Invitation.Status.REVOKED
        inv.save(update_fields=["status"])
        record_audit(action="invitation.revoked", request=request, target=inv)
        return Response(self.get_serializer(inv).data)

    @action(detail=True, methods=["post"])
    def resend(self, request, pk=None):
        from apps.accounts.services import create_invitation

        inv = self.get_object()
        new = create_invitation(
            school=inv.school,
            email=inv.email,
            role=inv.role,
            invited_by=request.user,
            first_name=inv.first_name,
            last_name=inv.last_name,
            metadata=inv.metadata,
        )
        return Response(self.get_serializer(new).data, status=status.HTTP_201_CREATED)


class SchoolAuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [HasSchoolPerm]
    required_perms = Perm.AUDIT_VIEW
    serializer_class = AuditLogSerializer
    filterset_fields = ["action", "target_type"]
    search_fields = ["actor_email", "target_repr", "action"]
    ordering_fields = ["created_at"]

    def get_queryset(self):
        return AuditLog.objects.select_related("school").filter(school=resolve_tenant(self.request).school)

    @action(detail=False, methods=["get"])
    def export(self, request):
        qs = self.filter_queryset(self.get_queryset())[:5000]
        return csv_response(
            "audit_logs.csv",
            ["created_at", "action", "actor", "target_type", "target_id", "target"],
            ((a.created_at, a.action, a.actor_email, a.target_type, a.target_id, a.target_repr) for a in qs),
        )


class SchoolNotificationTemplateViewSet(viewsets.ModelViewSet):
    permission_classes = [HasSchoolPerm]
    required_perms = {"GET": Perm.SCHOOL_VIEW, "POST": Perm.NOTIFICATIONS_MANAGE}
    serializer_class = NotificationTemplateSerializer
    pagination_class = None

    def get_queryset(self):
        return NotificationTemplate.objects.filter(school=resolve_tenant(self.request).school)

    def perform_create(self, serializer):
        serializer.save(school=resolve_tenant(self.request).school)

    @action(detail=False, methods=["get"])
    def effective(self, request):
        """Platform defaults merged with the school's overrides."""
        school = resolve_tenant(request).school
        defaults = {(t.category, t.channel): t for t in NotificationTemplate.objects.filter(school__isnull=True)}
        for t in NotificationTemplate.objects.filter(school=school):
            defaults[(t.category, t.channel)] = t
        return Response(NotificationTemplateSerializer(list(defaults.values()), many=True).data)
