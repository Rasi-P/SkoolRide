"""School-staff trip management API (/api/trips/)."""

from __future__ import annotations

from django.db.models import Prefetch
from django.utils import timezone
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from drf_spectacular.utils import extend_schema as _extend_schema
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.audit import record_audit
from apps.core.permissions import HasSchoolPerm
from apps.core.roles import Perm
from apps.core.tenancy import resolve_tenant
from apps.core.utils import csv_response
from apps.core.views import TenantModelViewSet, TenantReadOnlyViewSet

from . import services
from .models import BoardingEvent, GPSLocation, Incident, Trip, TripStop, TripStudent, VehicleLocation
from .serializers import (
    BoardingEventSerializer,
    CancelSerializer,
    GenerateTripsSerializer,
    GPSLocationSerializer,
    IncidentResolveSerializer,
    IncidentSerializer,
    MarkStudentSerializer,
    ReplaceVehicleSerializer,
    TripCreateSerializer,
    TripDetailSerializer,
    TripEventInputSerializer,
    TripEventSerializer,
    TripSerializer,
    TripStudentSerializer,
    VehicleLocationSerializer,
)


def trip_queryset():
    return Trip.objects.select_related("route", "vehicle", "driver", "attendant", "school", "replacement_of").prefetch_related(
        Prefetch("stops", queryset=TripStop.objects.select_related("route_stop").prefetch_related("trip_students").order_by("sequence")),
        Prefetch(
            "trip_students",
            queryset=TripStudent.objects.select_related("student", "trip_stop__route_stop").prefetch_related("student__guardian_links__parent"),
        ),
        "events",
    )


class TripViewSet(TenantModelViewSet):
    required_perms = {"GET": Perm.TRIPS_VIEW, "POST": Perm.TRIPS_MANAGE}
    queryset = trip_queryset()
    filterset_fields = ["status", "direction", "route", "vehicle", "driver", "scheduled_date"]
    search_fields = ["route__name", "route__code", "vehicle__registration_number", "driver__first_name"]
    ordering_fields = ["scheduled_date", "scheduled_start_time", "status", "started_at"]
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_serializer_class(self):
        if self.action == "create":
            return TripCreateSerializer
        if self.action in ("retrieve",):
            return TripDetailSerializer
        return TripSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        date_from = self.request.query_params.get("date_from")
        date_to = self.request.query_params.get("date_to")
        if date_from:
            qs = qs.filter(scheduled_date__gte=date_from)
        if date_to:
            qs = qs.filter(scheduled_date__lte=date_to)
        return qs

    def create(self, request, *args, **kwargs):
        ser = TripCreateSerializer(data=request.data, context=self.get_serializer_context())
        ser.is_valid(raise_exception=True)
        trip = services.create_trip(school=self.school, actor=request.user, request=request, **ser.validated_data)
        return Response(TripDetailSerializer(trip_queryset().get(pk=trip.pk)).data, status=status.HTTP_201_CREATED)

    def perform_update(self, serializer):
        trip = serializer.instance
        if trip.status != Trip.Status.SCHEDULED:
            from rest_framework.exceptions import ValidationError

            raise ValidationError({"detail": "Only scheduled trips can be edited."})
        obj = serializer.save()
        record_audit(action="trip.updated", request=self.request, target=obj, changes={k: str(v) for k, v in serializer.validated_data.items()})

    @extend_schema(request=GenerateTripsSerializer)
    @action(detail=False, methods=["post"])
    def generate(self, request):
        ser = GenerateTripsSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        trips = services.generate_trips_for_date(self.school, ser.validated_data["date"], actor=request.user)
        record_audit(
            action="trips.generated", request=request, school=self.school, changes={"date": str(ser.validated_data["date"]), "count": len(trips)}
        )
        return Response({"created": len(trips), "trips": TripSerializer(trips, many=True).data}, status=201)

    @action(detail=False, methods=["get"])
    def live(self, request):
        """All active trips with current vehicle positions for the school map."""
        trips = self.get_queryset().filter(status__in=Trip.ACTIVE_STATUSES)
        locations = {str(vl.trip_id): vl for vl in VehicleLocation.objects.filter(school=self.school, trip__in=trips).select_related("vehicle")}
        data = TripSerializer(trips, many=True).data
        for row in data:
            vl = locations.get(row["id"])
            row["current_location"] = VehicleLocationSerializer(vl).data if vl else None
        return Response({"trips": data, "server_time": timezone.now()})

    @action(detail=True, methods=["post"])
    def start(self, request, pk=None):
        trip = services.start_trip(trip=self.get_object(), user=request.user, request=request)
        return Response(TripDetailSerializer(trip_queryset().get(pk=trip.pk)).data)

    @action(detail=True, methods=["post"])
    def end(self, request, pk=None):
        trip = services.end_trip(trip=self.get_object(), user=request.user, request=request, notes=request.data.get("notes", ""))
        return Response(TripDetailSerializer(trip_queryset().get(pk=trip.pk)).data)

    @extend_schema(request=CancelSerializer)
    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        ser = CancelSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        trip = services.cancel_trip(trip=self.get_object(), user=request.user, reason=ser.validated_data["reason"], request=request)
        return Response(TripDetailSerializer(trip_queryset().get(pk=trip.pk)).data)

    @extend_schema(request=ReplaceVehicleSerializer)
    @action(detail=True, methods=["post"], url_path="replace-vehicle")
    def replace_vehicle(self, request, pk=None):
        ser = ReplaceVehicleSerializer(data=request.data, context=self.get_serializer_context())
        ser.is_valid(raise_exception=True)
        new_trip = services.replace_vehicle(trip=self.get_object(), user=request.user, request=request, **ser.validated_data)
        return Response(TripDetailSerializer(trip_queryset().get(pk=new_trip.pk)).data, status=201)

    @action(detail=True, methods=["get"])
    def locations(self, request, pk=None):
        trip = self.get_object()
        qs = GPSLocation.objects.filter(trip=trip).order_by("recorded_at")[:5000]
        return Response(GPSLocationSerializer(qs, many=True).data)

    @action(detail=True, methods=["get"])
    def students(self, request, pk=None):
        trip = self.get_object()
        return Response(TripStudentSerializer(trip.trip_students.all(), many=True).data)

    @extend_schema(request=MarkStudentSerializer)
    @action(detail=True, methods=["post"], url_path=r"students/(?P<trip_student_id>[0-9a-f-]+)/(?P<event>boarded|dropped|absent)")
    def mark_student(self, request, pk=None, trip_student_id=None, event=None):
        trip = self.get_object()
        ts = trip.trip_students.filter(pk=trip_student_id).first()
        if ts is None:
            return Response({"detail": "Student not on this trip.", "code": "not_found"}, status=404)
        ser = MarkStudentSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        services.mark_student(
            trip=trip,
            trip_student=ts,
            event_type=event.upper(),
            user=request.user,
            request=request,
            note=ser.validated_data.get("note", ""),
            lat=ser.validated_data.get("latitude"),
            lon=ser.validated_data.get("longitude"),
        )
        return Response(TripStudentSerializer(TripStudent.objects.select_related("student", "trip_stop__route_stop").get(pk=ts.pk)).data)

    @extend_schema(request=TripEventInputSerializer)
    @action(detail=True, methods=["post"])
    def events(self, request, pk=None):
        trip = self.get_object()
        ser = TripEventInputSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        d = ser.validated_data
        event = services.add_trip_event(
            trip=trip,
            event_type=d["event_type"],
            description=d["description"],
            user=request.user,
            data={"minutes": d.get("minutes")} if d.get("minutes") is not None else {},
            request=request,
        )
        return Response(TripEventSerializer(event).data, status=201)

    @action(detail=False, methods=["get"])
    def export(self, request):
        qs = self.filter_queryset(self.get_queryset())[:5000]
        return csv_response(
            "trips.csv",
            ["date", "route", "direction", "vehicle", "driver", "status", "started_at", "ended_at", "expected", "boarded", "absent", "delay_minutes"],
            (
                (
                    t.scheduled_date,
                    t.route.code,
                    t.direction,
                    t.vehicle and t.vehicle.registration_number,
                    t.driver and t.driver.full_name,
                    t.status,
                    t.started_at,
                    t.ended_at,
                    t.expected_students,
                    t.boarded_count,
                    t.absent_count,
                    t.delay_minutes,
                )
                for t in qs
            ),
        )


class BoardingEventViewSet(TenantReadOnlyViewSet):
    required_perms = Perm.ATTENDANCE_VIEW
    serializer_class = BoardingEventSerializer
    queryset = BoardingEvent.objects.select_related("student", "trip__route", "trip__vehicle", "trip_stop__route_stop", "recorded_by")
    filterset_fields = ["trip", "student", "event_type", "trip__scheduled_date", "trip__route", "trip__direction"]
    search_fields = ["student__first_name", "student__last_name", "student__admission_number"]
    ordering_fields = ["occurred_at"]

    def get_queryset(self):
        qs = super().get_queryset()
        date_from = self.request.query_params.get("date_from")
        date_to = self.request.query_params.get("date_to")
        if date_from:
            qs = qs.filter(trip__scheduled_date__gte=date_from)
        if date_to:
            qs = qs.filter(trip__scheduled_date__lte=date_to)
        return qs

    @action(detail=False, methods=["get"])
    def export(self, request):
        qs = self.filter_queryset(self.get_queryset())[:10000]
        return csv_response(
            "boarding_events.csv",
            ["occurred_at", "date", "route", "direction", "student", "admission_number", "class", "event", "stop", "recorded_by"],
            (
                (
                    e.occurred_at,
                    e.trip.scheduled_date,
                    e.trip.route.code,
                    e.trip.direction,
                    e.student.full_name,
                    e.student.admission_number,
                    e.student.class_label,
                    e.event_type,
                    e.trip_stop and e.trip_stop.route_stop.name,
                    e.recorded_by and e.recorded_by.full_name,
                )
                for e in qs
            ),
        )


class IncidentViewSet(TenantModelViewSet):
    required_perms = {"GET": Perm.ENGAGEMENT_VIEW, "POST": Perm.INCIDENTS_REPORT, "PATCH": Perm.ENGAGEMENT_MANAGE}
    serializer_class = IncidentSerializer
    queryset = Incident.objects.select_related("trip__route", "vehicle", "reported_by", "resolved_by").prefetch_related("students")
    filterset_fields = ["status", "category", "severity", "is_emergency", "trip", "vehicle"]
    search_fields = ["title", "description"]
    ordering_fields = ["occurred_at", "severity", "status"]
    http_method_names = ["get", "post", "patch", "head", "options"]

    def create(self, request, *args, **kwargs):
        ser = self.get_serializer(data=request.data)
        ser.is_valid(raise_exception=True)
        incident = services.report_incident(school=self.school, user=request.user, data=dict(ser.validated_data), request=request)
        return Response(self.get_serializer(incident).data, status=201)

    @extend_schema(request=IncidentResolveSerializer)
    @action(detail=True, methods=["post"])
    def resolve(self, request, pk=None):
        incident = self.get_object()
        ser = IncidentResolveSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        incident.status = ser.validated_data["status"]
        if ser.validated_data.get("resolution_notes"):
            incident.resolution_notes = ser.validated_data["resolution_notes"]
        if incident.status in ("RESOLVED", "CLOSED"):
            incident.resolved_at = timezone.now()
            incident.resolved_by = request.user
        incident.save()
        record_audit(action="incident.status_changed", request=request, target=incident, changes={"status": incident.status})
        return Response(self.get_serializer(incident).data)

    @action(detail=False, methods=["get"])
    def export(self, request):
        qs = self.filter_queryset(self.get_queryset())
        return csv_response(
            "incidents.csv",
            ["occurred_at", "category", "severity", "title", "status", "vehicle", "reported_by"],
            (
                (
                    i.occurred_at,
                    i.category,
                    i.severity,
                    i.title,
                    i.status,
                    i.vehicle and i.vehicle.registration_number,
                    i.reported_by and i.reported_by.full_name,
                )
                for i in qs
            ),
        )


@_extend_schema(responses={200: OpenApiTypes.OBJECT})
class VehicleLocationsView(APIView):
    """Latest known positions for every vehicle in the school (fleet overview)."""

    permission_classes = [HasSchoolPerm]
    required_perms = Perm.TRIPS_VIEW

    def get(self, request):
        school = resolve_tenant(request).school
        qs = VehicleLocation.objects.filter(school=school).select_related("vehicle", "trip")
        return Response(VehicleLocationSerializer(qs, many=True).data)
