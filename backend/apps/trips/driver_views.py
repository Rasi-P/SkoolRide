"""Driver / attendant API (/api/driver/). Every endpoint checks that the caller is assigned to the trip."""

from __future__ import annotations

from datetime import timedelta

from django.utils import timezone
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from drf_spectacular.utils import extend_schema as _extend_schema
from rest_framework import status
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.core.audit import record_audit
from apps.core.permissions import IsDriverOrAttendant
from apps.core.roles import Perm
from apps.core.tenancy import resolve_tenant
from apps.fleet.models import StaffVehicleAssignment
from apps.people.models import StaffProfile

from . import services
from .access import assigned_trips
from .models import Incident, Trip, TripStudent
from .serializers import (
    BoardingEventSerializer,
    CancelSerializer,
    IncidentSerializer,
    LocationInputSerializer,
    MarkStudentSerializer,
    TripDetailSerializer,
    TripEventInputSerializer,
    TripEventSerializer,
    TripSerializer,
    TripStudentSerializer,
)
from .views import trip_queryset


class DriverBase(APIView):
    permission_classes = [IsDriverOrAttendant]

    @property
    def tenant(self):
        return resolve_tenant(self.request)

    @property
    def staff(self) -> StaffProfile:
        profile = getattr(self.tenant.membership, "staff_profile", None)
        if profile is None:
            raise PermissionDenied("No staff profile is linked to your account. Ask your school to invite you again.")
        if profile.status == StaffProfile.Status.INACTIVE:
            raise PermissionDenied("Your staff profile is inactive.")
        return profile

    def my_trips(self):
        return assigned_trips(self.staff, trip_queryset()).filter(school=self.tenant.school)

    def get_trip(self, trip_id) -> Trip:
        trip = self.my_trips().filter(pk=trip_id).first()
        if trip is None:
            # Do not reveal whether the trip exists for another driver.
            raise NotFound("Trip not found or not assigned to you.")
        return trip


@_extend_schema(responses={200: OpenApiTypes.OBJECT})
class DriverHomeView(DriverBase):
    def get(self, request):
        staff = self.staff
        school = self.tenant.school
        import zoneinfo

        today = timezone.now().astimezone(zoneinfo.ZoneInfo(school.timezone)).date()
        assignment = StaffVehicleAssignment.objects.filter(staff=staff, is_active=True).select_related("vehicle").first()
        trips = self.my_trips().filter(scheduled_date=today).order_by("scheduled_start_time")
        active = next((t for t in trips if t.is_active), None)
        routes = list({t.route for t in trips})
        from apps.fleet.serializers import VehicleListSerializer

        vehicle = assignment.vehicle if assignment else (active.vehicle if active else None)
        return Response(
            {
                "staff": {
                    "id": str(staff.id),
                    "name": staff.full_name,
                    "type": staff.staff_type,
                    "employee_id": staff.employee_id,
                    "licence_expired": staff.licence_expired,
                },
                "school": {
                    "id": str(school.id),
                    "name": school.name,
                    "timezone": school.timezone,
                    "transport_office_phone": school.transport_office_phone,
                    "emergency_contact_phone": school.emergency_contact_phone,
                    "transport_office_email": school.transport_office_email,
                },
                "vehicle": VehicleListSerializer(vehicle, context={"school": school}).data if vehicle else None,
                "routes": [{"id": str(r.id), "code": r.code, "name": r.name} for r in routes],
                "today": today,
                "trips": TripSerializer(trips, many=True).data,
                "active_trip": TripDetailSerializer(active).data if active else None,
                "location_interval_seconds": school.gps_stale_seconds and min(30, max(5, school.gps_stale_seconds // 6)) or 10,
            }
        )


@_extend_schema(responses={200: OpenApiTypes.OBJECT})
class DriverTripListView(DriverBase):
    def get(self, request):
        qs = self.my_trips()
        status_param = request.query_params.get("status")
        if status_param:
            qs = qs.filter(status=status_param)
        days = int(request.query_params.get("days", 30))
        qs = qs.filter(scheduled_date__gte=timezone.localdate() - timedelta(days=days)).order_by("-scheduled_date", "-scheduled_start_time")[:200]
        return Response(TripSerializer(qs, many=True).data)


@_extend_schema(responses={200: OpenApiTypes.OBJECT})
class DriverTripDetailView(DriverBase):
    def get(self, request, trip_id):
        return Response(TripDetailSerializer(self.get_trip(trip_id)).data)


@_extend_schema(responses={200: OpenApiTypes.OBJECT})
class DriverTripActionView(DriverBase):
    """POST /api/driver/trips/<id>/<action>/ where action in start|pause|resume|end|cancel."""

    @extend_schema(request=CancelSerializer)
    def post(self, request, trip_id, action):
        trip = self.get_trip(trip_id)
        if action == "start":
            if trip.driver_id and trip.driver_id != self.staff.id and self.staff.staff_type == "DRIVER":
                raise PermissionDenied("This trip is assigned to another driver.")
            # Attendants may start a trip only if no driver is assigned or they are the assigned attendant.
            trip = services.start_trip(trip=trip, user=request.user, request=request)
        elif action == "pause":
            trip = services.pause_trip(trip=trip, user=request.user, reason=request.data.get("reason", ""), request=request)
        elif action == "resume":
            trip = services.resume_trip(trip=trip, user=request.user, request=request)
        elif action == "end":
            trip = services.end_trip(trip=trip, user=request.user, request=request, notes=request.data.get("notes", ""))
        elif action == "cancel":
            ser = CancelSerializer(data=request.data)
            ser.is_valid(raise_exception=True)
            trip = services.cancel_trip(trip=trip, user=request.user, reason=ser.validated_data["reason"], request=request)
        else:
            raise NotFound()
        return Response(TripDetailSerializer(trip_queryset().get(pk=trip.pk)).data)


@_extend_schema(responses={200: OpenApiTypes.OBJECT})
class DriverLocationView(DriverBase):
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "gps"

    @extend_schema(request=LocationInputSerializer)
    def post(self, request, trip_id):
        if not self.tenant.has_perm(Perm.GPS_SHARE):
            raise PermissionDenied("Only the assigned driver may share GPS locations.")
        trip = self.get_trip(trip_id)
        ser = LocationInputSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        point = services.record_location(trip=trip, data=ser.validated_data)
        return Response(
            {"accepted": True, "recorded_at": point.recorded_at, "trip_status": trip.status, "is_simulated": point.is_simulated},
            status=status.HTTP_202_ACCEPTED,
        )


@_extend_schema(request=None, responses={200: OpenApiTypes.OBJECT})
class DriverStopActionView(DriverBase):
    def post(self, request, trip_id, trip_stop_id, action):
        trip = self.get_trip(trip_id)
        stop = trip.stops.filter(pk=trip_stop_id).first()
        if stop is None:
            raise NotFound("Stop not found on this trip.")
        if action == "arrive":
            services.mark_stop_arrived(trip=trip, trip_stop=stop, user=request.user, request=request)
        elif action == "depart":
            services.mark_stop_departed(trip=trip, trip_stop=stop, user=request.user, request=request)
        else:
            raise NotFound()
        return Response(TripDetailSerializer(trip_queryset().get(pk=trip.pk)).data)


@_extend_schema(responses={200: OpenApiTypes.OBJECT})
class DriverStudentActionView(DriverBase):
    @extend_schema(request=MarkStudentSerializer)
    def post(self, request, trip_id, trip_student_id, action):
        trip = self.get_trip(trip_id)
        ts = trip.trip_students.filter(pk=trip_student_id).first()
        if ts is None:
            raise NotFound("Student not found on this trip.")
        ser = MarkStudentSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        event_type = {"board": "BOARDED", "drop": "DROPPED", "absent": "ABSENT"}.get(action)
        if event_type is None:
            raise NotFound()
        services.mark_student(
            trip=trip,
            trip_student=ts,
            event_type=event_type,
            user=request.user,
            request=request,
            note=ser.validated_data.get("note", ""),
            lat=ser.validated_data.get("latitude"),
            lon=ser.validated_data.get("longitude"),
        )
        return Response(TripStudentSerializer(TripStudent.objects.select_related("student", "trip_stop__route_stop").get(pk=ts.pk)).data)


@_extend_schema(responses={200: OpenApiTypes.OBJECT})
class DriverTripEventView(DriverBase):
    @extend_schema(request=TripEventInputSerializer)
    def post(self, request, trip_id):
        trip = self.get_trip(trip_id)
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


@_extend_schema(request=OpenApiTypes.OBJECT, responses={200: OpenApiTypes.OBJECT})
class DriverEmergencyView(DriverBase):
    """Emergency alert with explicit confirmation flag to avoid accidental triggers."""

    def post(self, request, trip_id):
        trip = self.get_trip(trip_id)
        if not request.data.get("confirm"):
            return Response({"detail": "Confirmation required.", "code": "confirm_required"}, status=400)
        incident = services.report_incident(
            school=self.tenant.school,
            user=request.user,
            request=request,
            data={
                "trip": trip,
                "vehicle": trip.vehicle,
                "category": Incident.Category.EMERGENCY,
                "severity": Incident.Severity.CRITICAL,
                "is_emergency": True,
                "title": request.data.get("title") or f"Emergency on {trip.route.code}",
                "description": request.data.get("description") or "Emergency alert triggered by the driver.",
                "latitude": request.data.get("latitude"),
                "longitude": request.data.get("longitude"),
            },
        )
        record_audit(action="trip.emergency_triggered", request=request, target=incident)
        return Response(IncidentSerializer(incident).data, status=201)


@_extend_schema(responses={200: OpenApiTypes.OBJECT})
class DriverIncidentView(DriverBase):
    def get(self, request):
        qs = Incident.objects.filter(school=self.tenant.school, reported_by=request.user).select_related("trip__route", "vehicle")[:100]
        return Response(IncidentSerializer(qs, many=True).data)

    @extend_schema(request=IncidentSerializer)
    def post(self, request):
        ser = IncidentSerializer(data=request.data, context={"school": self.tenant.school})
        ser.is_valid(raise_exception=True)
        data = dict(ser.validated_data)
        if data.get("trip") and data["trip"].id not in self.my_trips().values_list("id", flat=True):
            raise PermissionDenied("You can only report incidents on your own trips.")
        incident = services.report_incident(school=self.tenant.school, user=request.user, data=data, request=request)
        return Response(IncidentSerializer(incident).data, status=201)


@_extend_schema(responses={200: OpenApiTypes.OBJECT})
class DriverBoardingHistoryView(DriverBase):
    def get(self, request, trip_id):
        trip = self.get_trip(trip_id)
        return Response(BoardingEventSerializer(trip.boarding_events.select_related("student", "trip_stop__route_stop"), many=True).data)
