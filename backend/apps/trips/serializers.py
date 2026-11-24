from __future__ import annotations

from django.conf import settings
from rest_framework import serializers

from apps.core.serializers import TenantPrimaryKeyRelatedField
from apps.fleet.models import Vehicle
from apps.people.models import StaffProfile, Student
from apps.routing.models import Route, RouteSchedule

from .models import BoardingEvent, GPSLocation, Incident, Trip, TripEvent, TripStop, TripStudent, VehicleLocation


class TripStopSerializer(serializers.ModelSerializer):
    name = serializers.CharField(source="route_stop.name", read_only=True)
    latitude = serializers.DecimalField(source="route_stop.latitude", max_digits=9, decimal_places=6, read_only=True)
    longitude = serializers.DecimalField(source="route_stop.longitude", max_digits=9, decimal_places=6, read_only=True)
    is_school_stop = serializers.BooleanField(source="route_stop.is_school_stop", read_only=True)
    address = serializers.CharField(source="route_stop.address", read_only=True)
    expected_count = serializers.SerializerMethodField()
    boarded_count = serializers.SerializerMethodField()

    class Meta:
        model = TripStop
        fields = (
            "id",
            "route_stop",
            "sequence",
            "name",
            "latitude",
            "longitude",
            "address",
            "is_school_stop",
            "planned_time",
            "eta",
            "distance_remaining_m",
            "arrived_at",
            "departed_at",
            "status",
            "expected_count",
            "boarded_count",
        )

    def get_expected_count(self, obj):
        return sum(1 for s in obj.trip_students.all())

    def get_boarded_count(self, obj):
        return sum(1 for s in obj.trip_students.all() if s.status in ("BOARDED", "DROPPED"))


class TripStudentSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source="student.full_name", read_only=True)
    admission_number = serializers.CharField(source="student.admission_number", read_only=True)
    class_label = serializers.CharField(source="student.class_label", read_only=True)
    photo = serializers.ImageField(source="student.photo", read_only=True)
    stop_name = serializers.CharField(source="trip_stop.route_stop.name", read_only=True, default=None)
    stop_sequence = serializers.IntegerField(source="trip_stop.sequence", read_only=True, default=None)
    guardian_phone = serializers.SerializerMethodField()

    class Meta:
        model = TripStudent
        fields = (
            "id",
            "student",
            "student_name",
            "admission_number",
            "class_label",
            "photo",
            "trip_stop",
            "stop_name",
            "stop_sequence",
            "status",
            "boarded_at",
            "dropped_at",
            "absence_reason",
            "guardian_phone",
        )

    def get_guardian_phone(self, obj):
        # Only exposed to school staff / driver views (parents never receive other students' rows).
        links = getattr(obj.student, "_prefetched_objects_cache", {}).get("guardian_links")
        if links is None:
            link = (
                obj.student.guardian_links.select_related("parent").filter(is_primary=True).first()
                or obj.student.guardian_links.select_related("parent").first()
            )
        else:
            link = next((g for g in links if g.is_primary), links[0] if links else None)
        return link.parent.phone if link else None


class TripEventSerializer(serializers.ModelSerializer):
    created_by_name = serializers.CharField(source="created_by.full_name", read_only=True, default=None)

    class Meta:
        model = TripEvent
        fields = ("id", "event_type", "description", "data", "occurred_at", "created_by_name")


class GPSLocationSerializer(serializers.ModelSerializer):
    class Meta:
        model = GPSLocation
        fields = ("id", "latitude", "longitude", "accuracy_m", "speed_mps", "heading", "recorded_at", "received_at", "source", "is_simulated")


class VehicleLocationSerializer(serializers.ModelSerializer):
    vehicle_id = serializers.UUIDField(source="vehicle.id", read_only=True)
    registration_number = serializers.CharField(source="vehicle.registration_number", read_only=True)
    fleet_number = serializers.CharField(source="vehicle.fleet_number", read_only=True)
    trip_id = serializers.UUIDField(source="trip.id", read_only=True, default=None)
    is_stale = serializers.SerializerMethodField()

    class Meta:
        model = VehicleLocation
        fields = (
            "vehicle_id",
            "registration_number",
            "fleet_number",
            "trip_id",
            "latitude",
            "longitude",
            "accuracy_m",
            "speed_mps",
            "heading",
            "recorded_at",
            "is_simulated",
            "is_stale",
        )

    def get_is_stale(self, obj):
        from django.utils import timezone

        return (timezone.now() - obj.recorded_at).total_seconds() > settings.GPS_STALE_SECONDS


class LocationInputSerializer(serializers.Serializer):
    latitude = serializers.FloatField()
    longitude = serializers.FloatField()
    accuracy_m = serializers.FloatField(required=False, allow_null=True)
    speed_mps = serializers.FloatField(required=False, allow_null=True)
    heading = serializers.FloatField(required=False, allow_null=True)
    recorded_at = serializers.DateTimeField(required=False)


class TripSerializer(serializers.ModelSerializer):
    route = TenantPrimaryKeyRelatedField(queryset=Route.objects.all())
    schedule = TenantPrimaryKeyRelatedField(queryset=RouteSchedule.objects.all(), required=False, allow_null=True)
    vehicle = TenantPrimaryKeyRelatedField(queryset=Vehicle.objects.all(), required=False, allow_null=True)
    driver = TenantPrimaryKeyRelatedField(queryset=StaffProfile.objects.filter(staff_type="DRIVER"), required=False, allow_null=True)
    attendant = TenantPrimaryKeyRelatedField(queryset=StaffProfile.objects.filter(staff_type="ATTENDANT"), required=False, allow_null=True)
    route_name = serializers.CharField(source="route.name", read_only=True)
    route_code = serializers.CharField(source="route.code", read_only=True)
    route_colour = serializers.CharField(source="route.colour", read_only=True)
    vehicle_registration = serializers.CharField(source="vehicle.registration_number", read_only=True, default=None)
    vehicle_display_name = serializers.CharField(source="vehicle.display_name", read_only=True, default=None)
    driver_name = serializers.CharField(source="driver.full_name", read_only=True, default=None)
    driver_phone = serializers.CharField(source="driver.phone", read_only=True, default=None)
    attendant_name = serializers.CharField(source="attendant.full_name", read_only=True, default=None)
    is_active = serializers.BooleanField(read_only=True)
    gps_stale = serializers.SerializerMethodField()
    current_location = serializers.SerializerMethodField()
    next_stop = serializers.SerializerMethodField()
    replacement_of_id = serializers.UUIDField(source="replacement_of.id", read_only=True, default=None)

    class Meta:
        model = Trip
        fields = (
            "id",
            "route",
            "route_name",
            "route_code",
            "route_colour",
            "schedule",
            "direction",
            "scheduled_date",
            "scheduled_start_time",
            "vehicle",
            "vehicle_registration",
            "vehicle_display_name",
            "driver",
            "driver_name",
            "driver_phone",
            "attendant",
            "attendant_name",
            "status",
            "started_at",
            "paused_at",
            "ended_at",
            "cancelled_reason",
            "replacement_of_id",
            "expected_students",
            "boarded_count",
            "dropped_count",
            "absent_count",
            "delay_minutes",
            "last_location_at",
            "is_simulated",
            "is_active",
            "gps_stale",
            "current_location",
            "next_stop",
            "notes",
            "created_at",
        )
        read_only_fields = (
            "status",
            "started_at",
            "paused_at",
            "ended_at",
            "cancelled_reason",
            "expected_students",
            "boarded_count",
            "dropped_count",
            "absent_count",
            "delay_minutes",
            "last_location_at",
            "is_simulated",
        )

    def get_gps_stale(self, obj):
        return obj.gps_is_stale() if obj.is_active else None

    def get_current_location(self, obj):
        if not obj.is_active or not obj.vehicle_id:
            return None
        loc = getattr(obj.vehicle, "current_location", None) if hasattr(obj.vehicle, "current_location") else None
        if loc is None or loc.trip_id != obj.id:
            return None
        return {
            "latitude": loc.latitude,
            "longitude": loc.longitude,
            "speed_mps": loc.speed_mps,
            "heading": loc.heading,
            "accuracy_m": loc.accuracy_m,
            "recorded_at": loc.recorded_at,
            "is_simulated": loc.is_simulated,
        }

    def get_next_stop(self, obj):
        stops = getattr(obj, "_prefetched_objects_cache", {}).get("stops")
        if stops is None:
            nxt = obj.stops.filter(status="PENDING").select_related("route_stop").order_by("sequence").first()
        else:
            nxt = next((s for s in sorted(stops, key=lambda s: s.sequence) if s.status == "PENDING"), None)
        if nxt is None:
            return None
        return {
            "id": str(nxt.id),
            "name": nxt.route_stop.name,
            "sequence": nxt.sequence,
            "eta": nxt.eta,
            "planned_time": nxt.planned_time,
            "distance_remaining_m": nxt.distance_remaining_m,
        }


class TripDetailSerializer(TripSerializer):
    stops = TripStopSerializer(many=True, read_only=True)
    students = TripStudentSerializer(source="trip_students", many=True, read_only=True)
    events = TripEventSerializer(many=True, read_only=True)
    route_path = serializers.SerializerMethodField()

    class Meta(TripSerializer.Meta):
        fields = TripSerializer.Meta.fields + ("stops", "students", "events", "route_path")

    def get_route_path(self, obj):
        return [[lat, lng] for lat, lng in obj.route.polyline(obj.direction)]


class TripLiveSerializer(serializers.ModelSerializer):
    """Compact snapshot pushed over websockets."""

    route_code = serializers.CharField(source="route.code", read_only=True)
    route_name = serializers.CharField(source="route.name", read_only=True)
    vehicle_registration = serializers.CharField(source="vehicle.registration_number", read_only=True, default=None)
    next_stop = serializers.SerializerMethodField()

    class Meta:
        model = Trip
        fields = (
            "id",
            "status",
            "direction",
            "route_code",
            "route_name",
            "vehicle_registration",
            "boarded_count",
            "dropped_count",
            "absent_count",
            "expected_students",
            "delay_minutes",
            "last_location_at",
            "started_at",
            "ended_at",
            "cancelled_reason",
            "is_simulated",
            "next_stop",
        )

    def get_next_stop(self, obj):
        nxt = obj.stops.filter(status="PENDING").select_related("route_stop").order_by("sequence").first()
        return {"id": str(nxt.id), "name": nxt.route_stop.name, "eta": nxt.eta.isoformat() if nxt.eta else None} if nxt else None


class TripCreateSerializer(serializers.Serializer):
    route = TenantPrimaryKeyRelatedField(queryset=Route.objects.all())
    direction = serializers.ChoiceField(choices=["PICKUP", "DROPOFF"])
    scheduled_date = serializers.DateField()
    scheduled_start_time = serializers.TimeField()
    vehicle = TenantPrimaryKeyRelatedField(queryset=Vehicle.objects.all(), required=False, allow_null=True)
    driver = TenantPrimaryKeyRelatedField(queryset=StaffProfile.objects.filter(staff_type="DRIVER"), required=False, allow_null=True)
    attendant = TenantPrimaryKeyRelatedField(queryset=StaffProfile.objects.filter(staff_type="ATTENDANT"), required=False, allow_null=True)
    notes = serializers.CharField(required=False, allow_blank=True, default="")


class GenerateTripsSerializer(serializers.Serializer):
    date = serializers.DateField()


class CancelSerializer(serializers.Serializer):
    reason = serializers.CharField()


class ReplaceVehicleSerializer(serializers.Serializer):
    vehicle = TenantPrimaryKeyRelatedField(queryset=Vehicle.objects.all())
    driver = TenantPrimaryKeyRelatedField(queryset=StaffProfile.objects.filter(staff_type="DRIVER"), required=False, allow_null=True)
    reason = serializers.CharField()


class TripEventInputSerializer(serializers.Serializer):
    event_type = serializers.ChoiceField(choices=["DELAY", "BREAKDOWN", "NOTE"])
    description = serializers.CharField()
    minutes = serializers.IntegerField(required=False, min_value=0, max_value=600)


class MarkStudentSerializer(serializers.Serializer):
    note = serializers.CharField(required=False, allow_blank=True, default="")
    latitude = serializers.FloatField(required=False, allow_null=True)
    longitude = serializers.FloatField(required=False, allow_null=True)


class BoardingEventSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source="student.full_name", read_only=True)
    admission_number = serializers.CharField(source="student.admission_number", read_only=True)
    class_label = serializers.CharField(source="student.class_label", read_only=True)
    stop_name = serializers.CharField(source="trip_stop.route_stop.name", read_only=True, default=None)
    recorded_by_name = serializers.CharField(source="recorded_by.full_name", read_only=True, default=None)
    trip_direction = serializers.CharField(source="trip.direction", read_only=True)
    trip_date = serializers.DateField(source="trip.scheduled_date", read_only=True)
    route_code = serializers.CharField(source="trip.route.code", read_only=True)
    vehicle_registration = serializers.CharField(source="trip.vehicle.registration_number", read_only=True, default=None)

    class Meta:
        model = BoardingEvent
        fields = (
            "id",
            "trip",
            "trip_direction",
            "trip_date",
            "route_code",
            "vehicle_registration",
            "student",
            "student_name",
            "admission_number",
            "class_label",
            "trip_stop",
            "stop_name",
            "event_type",
            "occurred_at",
            "recorded_by_name",
            "latitude",
            "longitude",
            "note",
        )


class IncidentSerializer(serializers.ModelSerializer):
    trip = TenantPrimaryKeyRelatedField(queryset=Trip.objects.all(), required=False, allow_null=True)
    vehicle = TenantPrimaryKeyRelatedField(queryset=Vehicle.objects.all(), required=False, allow_null=True)
    students = TenantPrimaryKeyRelatedField(queryset=Student.objects.all(), many=True, required=False)
    reported_by_name = serializers.CharField(source="reported_by.full_name", read_only=True, default=None)
    resolved_by_name = serializers.CharField(source="resolved_by.full_name", read_only=True, default=None)
    vehicle_registration = serializers.CharField(source="vehicle.registration_number", read_only=True, default=None)
    route_code = serializers.CharField(source="trip.route.code", read_only=True, default=None)
    student_names = serializers.SerializerMethodField()

    class Meta:
        model = Incident
        fields = (
            "id",
            "trip",
            "route_code",
            "vehicle",
            "vehicle_registration",
            "reported_by_name",
            "category",
            "severity",
            "title",
            "description",
            "occurred_at",
            "latitude",
            "longitude",
            "status",
            "is_emergency",
            "resolution_notes",
            "resolved_at",
            "resolved_by_name",
            "students",
            "student_names",
            "created_at",
        )
        read_only_fields = ("status", "resolution_notes", "resolved_at")

    def get_student_names(self, obj):
        return [s.full_name for s in obj.students.all()]


class IncidentResolveSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=["INVESTIGATING", "RESOLVED", "CLOSED"])
    resolution_notes = serializers.CharField(required=False, allow_blank=True, default="")
