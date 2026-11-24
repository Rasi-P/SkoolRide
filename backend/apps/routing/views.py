from __future__ import annotations

from django.db.models import Count, Q
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.core.audit import record_audit
from apps.core.models import AuditLog
from apps.core.roles import Perm
from apps.core.serializers import AuditLogSerializer
from apps.core.utils import csv_response, model_changes
from apps.core.views import TenantModelViewSet

from . import services
from .models import Route, RouteSchedule, RouteStop, StudentTransportAssignment
from .serializers import (
    RouteListSerializer,
    RouteScheduleSerializer,
    RouteSerializer,
    RouteStopSerializer,
    RouteStopWriteSerializer,
    StudentTransportAssignmentSerializer,
)


class EndAssignmentSerializer(serializers.Serializer):
    reason = serializers.CharField(required=False, allow_blank=True, default="")


class RouteViewSet(TenantModelViewSet):
    required_perms = {"GET": Perm.ROUTES_VIEW, "POST": Perm.ROUTES_MANAGE}
    queryset = Route.objects.select_related("vehicle", "driver", "attendant").prefetch_related("stops", "schedules")
    filterset_fields = ["is_active", "vehicle", "driver"]
    search_fields = ["name", "code", "description"]
    ordering_fields = ["code", "name", "created_at"]

    def get_queryset(self):
        return (
            super()
            .get_queryset()
            .annotate(active_student_count_annot=Count("student_assignments", filter=Q(student_assignments__is_active=True), distinct=True))
            .order_by("code", "name")
        )

    def get_serializer_class(self):
        return RouteListSerializer if self.action == "list" else RouteSerializer

    def perform_create(self, serializer):
        sub = getattr(self.school, "subscription", None)
        if sub and Route.objects.filter(school=self.school).count() >= sub.plan.max_routes:
            raise serializers.ValidationError({"detail": f"Your plan allows up to {sub.plan.max_routes} routes."})
        route = serializer.save(school=self.school)
        record_audit(action="route.created", request=self.request, target=route)

    def perform_update(self, serializer):
        changes = model_changes(serializer.instance, serializer.validated_data, serializer.validated_data.keys())
        route = serializer.save(version=serializer.instance.version + 1)
        record_audit(action="route.updated", request=self.request, target=route, changes=changes)

    def perform_destroy(self, instance):
        if instance.student_assignments.filter(is_active=True).exists():
            raise serializers.ValidationError({"detail": "Route has students assigned; end their assignments first."})
        instance.is_active = False
        instance.save(update_fields=["is_active"])
        record_audit(action="route.deactivated", request=self.request, target=instance)

    @extend_schema(request=RouteStopWriteSerializer(many=True), responses=RouteStopSerializer(many=True))
    @action(detail=True, methods=["get", "put"])
    def stops(self, request, pk=None):
        route = self.get_object()
        if request.method == "GET":
            qs = route.stops.annotate(student_count=Count("pickup_assignments", filter=Q(pickup_assignments__is_active=True)))
            return Response(RouteStopSerializer(qs.order_by("sequence"), many=True).data)
        ser = RouteStopWriteSerializer(data=request.data, many=True)
        ser.is_valid(raise_exception=True)
        if len(ser.validated_data) < 2:
            return Response({"detail": "A route needs at least two stops.", "code": "too_few_stops"}, status=400)
        services.replace_route_stops(route=route, stops=ser.validated_data, request=request)
        qs = route.stops.annotate(student_count=Count("pickup_assignments", filter=Q(pickup_assignments__is_active=True)))
        return Response(RouteStopSerializer(qs.order_by("sequence"), many=True).data)

    @action(detail=True, methods=["get"])
    def students(self, request, pk=None):
        route = self.get_object()
        qs = route.student_assignments.filter(is_active=True).select_related("student", "pickup_stop", "dropoff_stop", "route")
        return Response(StudentTransportAssignmentSerializer(qs, many=True).data)

    @action(detail=True, methods=["get"])
    def geojson(self, request, pk=None):
        return Response(services.route_geojson(self.get_object()))

    @action(detail=True, methods=["get"])
    def history(self, request, pk=None):
        route = self.get_object()
        audit = AuditLog.objects.filter(school=self.school, target_type="Route", target_id=str(route.pk)).order_by("-created_at")[:100]
        past = route.student_assignments.filter(is_active=False).select_related("student", "pickup_stop", "dropoff_stop").order_by("-end_date")[:100]
        return Response(
            {"audit": AuditLogSerializer(audit, many=True).data, "past_assignments": StudentTransportAssignmentSerializer(past, many=True).data}
        )

    @action(detail=False, methods=["get"])
    def export(self, request):
        qs = self.filter_queryset(self.get_queryset())
        return csv_response(
            "routes.csv",
            ["code", "name", "vehicle", "driver", "stops", "students", "distance_km", "active"],
            (
                (
                    r.code,
                    r.name,
                    r.vehicle and r.vehicle.registration_number,
                    r.driver and r.driver.full_name,
                    len(r.stops.all()),
                    r.active_student_count_annot,
                    r.distance_km,
                    r.is_active,
                )
                for r in qs
            ),
        )


class RouteStopViewSet(TenantModelViewSet):
    required_perms = {"GET": Perm.ROUTES_VIEW, "POST": Perm.ROUTES_MANAGE}
    serializer_class = RouteStopSerializer
    queryset = RouteStop.objects.select_related("route")
    filterset_fields = ["route", "is_school_stop"]
    search_fields = ["name", "address", "landmark"]
    http_method_names = ["get", "patch", "head", "options"]


class RouteScheduleViewSet(TenantModelViewSet):
    required_perms = {"GET": Perm.ROUTES_VIEW, "POST": Perm.ROUTES_MANAGE}
    serializer_class = RouteScheduleSerializer
    queryset = RouteSchedule.objects.select_related("route")
    filterset_fields = ["route", "direction", "is_active"]

    def perform_create(self, serializer):
        obj = serializer.save(school=self.school)
        record_audit(action="route.schedule_created", request=self.request, target=obj)

    def perform_update(self, serializer):
        obj = serializer.save()
        record_audit(action="route.schedule_updated", request=self.request, target=obj)


class StudentTransportAssignmentViewSet(TenantModelViewSet):
    required_perms = {"GET": Perm.ROUTES_VIEW, "POST": Perm.ROUTES_MANAGE}
    serializer_class = StudentTransportAssignmentSerializer
    queryset = StudentTransportAssignment.objects.select_related("student", "route", "pickup_stop", "dropoff_stop")
    filterset_fields = ["route", "student", "is_active", "pickup_stop"]
    search_fields = ["student__first_name", "student__last_name", "student__admission_number"]
    http_method_names = ["get", "post", "head", "options"]

    def create(self, request, *args, **kwargs):
        ser = self.get_serializer(data=request.data)
        ser.is_valid(raise_exception=True)
        d = ser.validated_data
        assignment = services.assign_student(
            school=self.school,
            student=d["student"],
            route=d["route"],
            pickup_stop=d.get("pickup_stop"),
            dropoff_stop=d.get("dropoff_stop"),
            uses_pickup=d.get("uses_pickup", True),
            uses_dropoff=d.get("uses_dropoff", True),
            start_date=d.get("start_date"),
            notes=d.get("notes", ""),
            request=request,
        )
        return Response(self.get_serializer(assignment).data, status=status.HTTP_201_CREATED)

    @extend_schema(request=EndAssignmentSerializer)
    @action(detail=True, methods=["post"])
    def end(self, request, pk=None):
        ser = EndAssignmentSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        assignment = services.end_assignment(assignment=self.get_object(), reason=ser.validated_data["reason"], request=request)
        return Response(self.get_serializer(assignment).data)
