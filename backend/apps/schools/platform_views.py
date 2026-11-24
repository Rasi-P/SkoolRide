"""Super Admin (platform) API."""

from __future__ import annotations

from django.db.models import Count, Q
from django.utils import timezone
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from drf_spectacular.utils import extend_schema as _extend_schema
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import Invitation, User
from apps.accounts.serializers import InvitationSerializer
from apps.accounts.services import create_invitation
from apps.core.audit import record_audit
from apps.core.models import AuditLog
from apps.core.permissions import IsPlatformAdmin
from apps.core.serializers import AuditLogSerializer
from apps.core.utils import csv_response

from . import services
from .models import NotificationTemplate, PlatformSetting, School, SchoolApplication, SchoolSubscription, SubscriptionPlan
from .serializers import (
    ApplicationDecisionSerializer,
    InviteAdminSerializer,
    MembershipSerializer,
    NotificationTemplateSerializer,
    PlatformSettingSerializer,
    PlatformUserSerializer,
    SchoolApplicationSerializer,
    SchoolCreateSerializer,
    SchoolDetailSerializer,
    SchoolListSerializer,
    SubscriptionPlanSerializer,
    SubscriptionUpdateSerializer,
    SuspendSerializer,
)


@_extend_schema(responses={200: OpenApiTypes.OBJECT})
class PlatformOverviewView(APIView):
    permission_classes = [IsPlatformAdmin]

    def get(self, request):
        data = services.platform_overview()
        recent_apps = SchoolApplication.objects.order_by("-created_at")[:5]
        recent_audit = AuditLog.objects.select_related("school").order_by("-created_at")[:10]
        # schools created per month for the last 6 months
        from django.db.models.functions import TruncMonth

        growth = School.objects.annotate(month=TruncMonth("created_at")).values("month").annotate(count=Count("id")).order_by("month")
        data["recent_applications"] = SchoolApplicationSerializer(recent_apps, many=True).data
        data["recent_activity"] = AuditLogSerializer(recent_audit, many=True).data
        data["school_growth"] = [{"month": g["month"].strftime("%Y-%m"), "count": g["count"]} for g in growth]
        data["schools_by_status"] = list(School.objects.values("status").annotate(count=Count("id")))
        return Response(data)


class SchoolApplicationViewSet(viewsets.ModelViewSet):
    permission_classes = [IsPlatformAdmin]
    serializer_class = SchoolApplicationSerializer
    queryset = SchoolApplication.objects.select_related("requested_plan", "reviewed_by", "school")
    filterset_fields = ["status", "city", "state"]
    search_fields = ["school_name", "contact_name", "contact_email", "city", "tracking_code"]
    ordering_fields = ["created_at", "school_name", "status", "estimated_students"]
    http_method_names = ["get", "patch", "post", "head", "options"]

    @action(detail=True, methods=["post"])
    def review(self, request, pk=None):
        app = self.get_object()
        if app.status == SchoolApplication.Status.PENDING:
            app.status = SchoolApplication.Status.UNDER_REVIEW
            app.save(update_fields=["status"])
            record_audit(action="application.under_review", request=request, target=app)
        return Response(self.get_serializer(app).data)

    @extend_schema(request=ApplicationDecisionSerializer)
    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        app = self.get_object()
        ser = ApplicationDecisionSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        school, invitation = services.approve_application(
            application=app,
            reviewer=request.user,
            plan=ser.validated_data.get("plan"),
            notes=ser.validated_data.get("notes", ""),
            request=request,
        )
        return Response(
            {
                "application": self.get_serializer(app).data,
                "school": SchoolDetailSerializer(school).data,
                "invitation": InvitationSerializer(invitation).data,
            },
            status=status.HTTP_201_CREATED,
        )

    @extend_schema(request=ApplicationDecisionSerializer)
    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        app = self.get_object()
        ser = ApplicationDecisionSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        services.reject_application(application=app, reviewer=request.user, notes=ser.validated_data.get("notes", ""), request=request)
        return Response(self.get_serializer(app).data)

    @action(detail=False, methods=["get"])
    def export(self, request):
        qs = self.filter_queryset(self.get_queryset())
        return csv_response(
            "school_applications.csv",
            ["tracking_code", "school_name", "contact_name", "contact_email", "city", "status", "created_at"],
            ((a.tracking_code, a.school_name, a.contact_name, a.contact_email, a.city, a.status, a.created_at) for a in qs),
        )


class SchoolViewSet(viewsets.ModelViewSet):
    permission_classes = [IsPlatformAdmin]
    queryset = School.objects.select_related("subscription__plan").prefetch_related("memberships__user")
    filterset_fields = ["status", "city", "state", "subscription__status", "subscription__plan"]
    search_fields = ["name", "code", "city", "email"]
    ordering_fields = ["name", "created_at", "status", "activated_at"]
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_queryset(self):
        return (
            super()
            .get_queryset()
            .annotate(
                vehicle_count=Count("vehicle_set", distinct=True),
                student_count=Count("student_set", filter=Q(student_set__status="ACTIVE"), distinct=True),
                staff_count=Count("staffprofile_set", distinct=True),
                route_count=Count("route_set", distinct=True),
            )
            .order_by("name")
        )

    def get_serializer_class(self):
        if self.action == "list":
            return SchoolListSerializer
        if self.action == "create":
            return SchoolCreateSerializer
        return SchoolDetailSerializer

    def create(self, request):
        ser = SchoolCreateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        data = dict(ser.validated_data)
        plan = data.pop("plan", None)
        admin = {
            "email": data.pop("admin_email"),
            "first_name": data.pop("admin_first_name"),
            "last_name": data.pop("admin_last_name", ""),
        }
        school, invitation = services.create_school_with_admin(data=data, admin=admin, plan=plan, actor=request.user, request=request)
        return Response(
            {"school": SchoolDetailSerializer(school).data, "invitation": InvitationSerializer(invitation).data},
            status=status.HTTP_201_CREATED,
        )

    def perform_update(self, serializer):
        before = {f: getattr(serializer.instance, f) for f in serializer.validated_data}
        school = serializer.save()
        changes = {k: [str(before[k]), str(v)] for k, v in serializer.validated_data.items() if str(before[k]) != str(v)}
        record_audit(action="school.updated", request=self.request, school=school, target=school, changes=changes)

    @extend_schema(request=SuspendSerializer)
    @action(detail=True, methods=["post"])
    def suspend(self, request, pk=None):
        ser = SuspendSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        school = services.suspend_school(school=self.get_object(), actor=request.user, reason=ser.validated_data["reason"], request=request)
        return Response(SchoolDetailSerializer(school).data)

    @action(detail=True, methods=["post"])
    def reactivate(self, request, pk=None):
        school = services.reactivate_school(school=self.get_object(), actor=request.user, request=request)
        return Response(SchoolDetailSerializer(school).data)

    @extend_schema(request=SubscriptionUpdateSerializer)
    @action(detail=True, methods=["post", "patch"])
    def subscription(self, request, pk=None):
        school = self.get_object()
        sub = getattr(school, "subscription", None)
        ser = SubscriptionUpdateSerializer(instance=sub, data=request.data, partial=sub is not None)
        ser.is_valid(raise_exception=True)
        sub = ser.save(school=school)
        record_audit(
            action="subscription.updated", request=request, school=school, target=sub, changes={k: str(v) for k, v in ser.validated_data.items()}
        )
        school.refresh_from_db()
        return Response(SchoolDetailSerializer(school).data)

    @action(detail=True, methods=["get"])
    def onboarding(self, request, pk=None):
        return Response(services.onboarding_progress(self.get_object()))

    @extend_schema(request=InviteAdminSerializer, responses=InvitationSerializer)
    @action(detail=True, methods=["post"], url_path="invite-admin")
    def invite_admin(self, request, pk=None):
        school = self.get_object()
        ser = InviteAdminSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        invitation = create_invitation(school=school, invited_by=request.user, **ser.validated_data)
        return Response(InvitationSerializer(invitation).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["get"])
    def invitations(self, request, pk=None):
        qs = Invitation.objects.filter(school=self.get_object()).select_related("invited_by")
        return Response(InvitationSerializer(qs, many=True).data)

    @action(detail=True, methods=["get"])
    def members(self, request, pk=None):
        qs = self.get_object().memberships.select_related("user").order_by("role", "user__first_name")
        return Response(MembershipSerializer(qs, many=True).data)

    @action(detail=False, methods=["get"])
    def export(self, request):
        qs = self.filter_queryset(self.get_queryset())
        return csv_response(
            "schools.csv",
            ["code", "name", "city", "status", "plan", "subscription_status", "vehicles", "students", "created_at"],
            (
                (
                    s.code,
                    s.name,
                    s.city,
                    s.status,
                    getattr(getattr(s, "subscription", None), "plan", None) and s.subscription.plan.name,
                    getattr(getattr(s, "subscription", None), "status", ""),
                    s.vehicle_count,
                    s.student_count,
                    s.created_at,
                )
                for s in qs
            ),
        )


class SubscriptionPlanViewSet(viewsets.ModelViewSet):
    permission_classes = [IsPlatformAdmin]
    serializer_class = SubscriptionPlanSerializer
    queryset = SubscriptionPlan.objects.all()
    filterset_fields = ["is_active"]
    search_fields = ["name", "code"]

    def perform_destroy(self, instance):
        if SchoolSubscription.objects.filter(plan=instance).exists():
            instance.is_active = False
            instance.save(update_fields=["is_active"])
        else:
            instance.delete()


class PlatformSettingViewSet(viewsets.ModelViewSet):
    permission_classes = [IsPlatformAdmin]
    serializer_class = PlatformSettingSerializer
    queryset = PlatformSetting.objects.all().order_by("key")
    lookup_field = "key"
    pagination_class = None
    http_method_names = ["get", "put", "patch", "post", "head", "options"]

    def perform_update(self, serializer):
        obj = serializer.save()
        record_audit(action="platform.setting_updated", request=self.request, target=obj, changes={"value": obj.value})


class NotificationTemplateViewSet(viewsets.ModelViewSet):
    permission_classes = [IsPlatformAdmin]
    serializer_class = NotificationTemplateSerializer
    queryset = NotificationTemplate.objects.filter(school__isnull=True).order_by("category", "channel")
    filterset_fields = ["category", "channel", "is_active"]
    pagination_class = None


class PlatformAuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [IsPlatformAdmin]
    serializer_class = AuditLogSerializer
    queryset = AuditLog.objects.select_related("school", "actor")
    filterset_fields = ["action", "target_type", "school"]
    search_fields = ["actor_email", "target_repr", "target_id", "action"]
    ordering_fields = ["created_at"]

    @action(detail=False, methods=["get"])
    def export(self, request):
        qs = self.filter_queryset(self.get_queryset())[:5000]
        return csv_response(
            "audit_logs.csv",
            ["created_at", "action", "actor", "school", "target_type", "target_id", "ip"],
            ((a.created_at, a.action, a.actor_email, a.school and a.school.name, a.target_type, a.target_id, a.ip_address) for a in qs),
        )


class PlatformUserViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [IsPlatformAdmin]
    serializer_class = PlatformUserSerializer
    queryset = User.objects.prefetch_related("memberships__school").order_by("-created_at")
    filterset_fields = ["is_active", "is_platform_admin"]
    search_fields = ["email", "first_name", "last_name"]

    @action(detail=True, methods=["post"])
    def deactivate(self, request, pk=None):
        user = self.get_object()
        if user == request.user:
            return Response({"detail": "You cannot deactivate yourself.", "code": "self_deactivate"}, status=400)
        user.is_active = False
        user.save(update_fields=["is_active"])
        record_audit(action="user.deactivated", request=request, target=user)
        return Response(self.get_serializer(user).data)

    @action(detail=True, methods=["post"])
    def activate(self, request, pk=None):
        user = self.get_object()
        user.is_active = True
        user.save(update_fields=["is_active"])
        record_audit(action="user.activated", request=request, target=user)
        return Response(self.get_serializer(user).data)


@_extend_schema(responses={200: OpenApiTypes.OBJECT})
class PlatformStatsView(APIView):
    """System-level operational statistics for the platform dashboard."""

    permission_classes = [IsPlatformAdmin]

    def get(self, request):
        from apps.notifications.models import Notification, NotificationDelivery
        from apps.trips.models import GPSLocation, Trip

        today = timezone.localdate()
        return Response(
            {
                "gps_points_today": GPSLocation.objects.filter(recorded_at__date=today).count(),
                "trips_completed_today": Trip.objects.filter(scheduled_date=today, status=Trip.Status.COMPLETED).count(),
                "notifications_today": Notification.objects.filter(created_at__date=today).count(),
                "deliveries_failed_today": NotificationDelivery.objects.filter(
                    created_at__date=today, status=NotificationDelivery.Status.FAILED
                ).count(),
                "users_total": User.objects.count(),
                "users_active_last_7_days": User.objects.filter(last_login__gte=timezone.now() - timezone.timedelta(days=7)).count(),
            }
        )
