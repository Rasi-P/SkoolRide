from __future__ import annotations

from rest_framework import serializers

from apps.core.serializers import TenantPrimaryKeyRelatedField
from apps.fleet.models import Vehicle
from apps.people.models import StaffProfile, Student

from .models import Route, RouteSchedule, RouteStop, StudentTransportAssignment


class RouteStopSerializer(serializers.ModelSerializer):
    student_count = serializers.SerializerMethodField()

    class Meta:
        model = RouteStop
        fields = (
            "id",
            "route",
            "name",
            "sequence",
            "latitude",
            "longitude",
            "address",
            "landmark",
            "planned_pickup_time",
            "planned_dropoff_time",
            "is_school_stop",
            "wait_minutes",
            "student_count",
        )
        read_only_fields = ("route",)

    def get_student_count(self, obj):
        return getattr(obj, "student_count", None)


class RouteStopWriteSerializer(serializers.Serializer):
    id = serializers.UUIDField(required=False)
    name = serializers.CharField(max_length=120)
    latitude = serializers.DecimalField(max_digits=9, decimal_places=6)
    longitude = serializers.DecimalField(max_digits=9, decimal_places=6)
    address = serializers.CharField(max_length=255, required=False, allow_blank=True, default="")
    landmark = serializers.CharField(max_length=120, required=False, allow_blank=True, default="")
    planned_pickup_time = serializers.TimeField(required=False, allow_null=True, default=None)
    planned_dropoff_time = serializers.TimeField(required=False, allow_null=True, default=None)
    is_school_stop = serializers.BooleanField(required=False, default=False)
    wait_minutes = serializers.IntegerField(required=False, default=1, min_value=0, max_value=60)

    def validate_latitude(self, v):
        if not -90 <= v <= 90:
            raise serializers.ValidationError("Latitude out of range.")
        return v

    def validate_longitude(self, v):
        if not -180 <= v <= 180:
            raise serializers.ValidationError("Longitude out of range.")
        return v


class RouteScheduleSerializer(serializers.ModelSerializer):
    route = TenantPrimaryKeyRelatedField(queryset=Route.objects.all())
    route_name = serializers.CharField(source="route.name", read_only=True)
    route_code = serializers.CharField(source="route.code", read_only=True)

    class Meta:
        model = RouteSchedule
        fields = (
            "id",
            "route",
            "route_name",
            "route_code",
            "direction",
            "label",
            "weekdays",
            "start_time",
            "is_active",
            "effective_from",
            "effective_to",
            "created_at",
        )

    def validate_weekdays(self, v):
        if not v or any((not isinstance(d, int)) or d < 0 or d > 6 for d in v):
            raise serializers.ValidationError("Weekdays must be a non-empty list of integers 0 (Mon) to 6 (Sun).")
        return sorted(set(v))


class RouteSerializer(serializers.ModelSerializer):
    vehicle = TenantPrimaryKeyRelatedField(queryset=Vehicle.objects.all(), required=False, allow_null=True)
    driver = TenantPrimaryKeyRelatedField(queryset=StaffProfile.objects.filter(staff_type="DRIVER"), required=False, allow_null=True)
    attendant = TenantPrimaryKeyRelatedField(queryset=StaffProfile.objects.filter(staff_type="ATTENDANT"), required=False, allow_null=True)
    stops = RouteStopSerializer(many=True, read_only=True)
    schedules = RouteScheduleSerializer(many=True, read_only=True)
    vehicle_registration = serializers.CharField(source="vehicle.registration_number", read_only=True, default=None)
    vehicle_capacity = serializers.IntegerField(source="vehicle.capacity", read_only=True, default=None)
    vehicle_fleet_number = serializers.CharField(source="vehicle.fleet_number", read_only=True, default=None)
    driver_name = serializers.CharField(source="driver.full_name", read_only=True, default=None)
    attendant_name = serializers.CharField(source="attendant.full_name", read_only=True, default=None)
    student_count = serializers.SerializerMethodField()
    stop_count = serializers.SerializerMethodField()
    capacity_warning = serializers.SerializerMethodField()

    class Meta:
        model = Route
        fields = (
            "id",
            "name",
            "code",
            "description",
            "colour",
            "vehicle",
            "vehicle_registration",
            "vehicle_fleet_number",
            "vehicle_capacity",
            "driver",
            "driver_name",
            "attendant",
            "attendant_name",
            "is_active",
            "distance_km",
            "estimated_duration_minutes",
            "path",
            "version",
            "stops",
            "schedules",
            "student_count",
            "stop_count",
            "capacity_warning",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("version", "distance_km")

    def get_student_count(self, obj):
        val = getattr(obj, "active_student_count_annot", None)
        return val if val is not None else obj.active_student_count

    def get_stop_count(self, obj):
        return len(obj.stops.all())

    def get_capacity_warning(self, obj):
        if obj.vehicle_id and obj.vehicle:
            count = self.get_student_count(obj)
            if count > obj.vehicle.capacity:
                return f"{count} students assigned but vehicle capacity is {obj.vehicle.capacity}."
        return None

    def validate_code(self, value):
        value = value.upper().strip()
        qs = Route.objects.filter(school=self.context["school"], code=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("Route code already exists.")
        return value

    def validate(self, attrs):
        driver = attrs.get("driver")
        attendant = attrs.get("attendant")
        if driver and driver.staff_type != "DRIVER":
            raise serializers.ValidationError({"driver": "Selected staff member is not a driver."})
        if attendant and attendant.staff_type != "ATTENDANT":
            raise serializers.ValidationError({"attendant": "Selected staff member is not an attendant."})
        vehicle = attrs.get("vehicle")
        if vehicle and vehicle.status == Vehicle.Status.INACTIVE:
            raise serializers.ValidationError({"vehicle": "Vehicle is inactive."})
        return attrs


class RouteListSerializer(RouteSerializer):
    class Meta(RouteSerializer.Meta):
        fields = tuple(f for f in RouteSerializer.Meta.fields if f not in ("stops", "schedules", "path"))


class StudentTransportAssignmentSerializer(serializers.ModelSerializer):
    student = TenantPrimaryKeyRelatedField(queryset=Student.objects.all())
    route = TenantPrimaryKeyRelatedField(queryset=Route.objects.all())
    pickup_stop = TenantPrimaryKeyRelatedField(queryset=RouteStop.objects.all(), required=False, allow_null=True)
    dropoff_stop = TenantPrimaryKeyRelatedField(queryset=RouteStop.objects.all(), required=False, allow_null=True)
    student_name = serializers.CharField(source="student.full_name", read_only=True)
    student_admission_number = serializers.CharField(source="student.admission_number", read_only=True)
    student_class = serializers.CharField(source="student.class_label", read_only=True)
    route_name = serializers.CharField(source="route.name", read_only=True)
    route_code = serializers.CharField(source="route.code", read_only=True)
    pickup_stop_name = serializers.CharField(source="pickup_stop.name", read_only=True, default=None)
    dropoff_stop_name = serializers.CharField(source="dropoff_stop.name", read_only=True, default=None)

    class Meta:
        model = StudentTransportAssignment
        fields = (
            "id",
            "student",
            "student_name",
            "student_admission_number",
            "student_class",
            "route",
            "route_name",
            "route_code",
            "pickup_stop",
            "pickup_stop_name",
            "dropoff_stop",
            "dropoff_stop_name",
            "uses_pickup",
            "uses_dropoff",
            "start_date",
            "end_date",
            "is_active",
            "ended_reason",
            "notes",
            "created_at",
        )
        read_only_fields = ("end_date", "is_active", "ended_reason")
        validators = []  # reassignment ends the previous active assignment in the service

    def validate(self, attrs):
        route = attrs.get("route") or (self.instance and self.instance.route)
        for key in ("pickup_stop", "dropoff_stop"):
            stop = attrs.get(key)
            if stop and stop.route_id != route.id:
                raise serializers.ValidationError({key: "Stop does not belong to the selected route."})
        if attrs.get("uses_pickup", True) and not attrs.get("pickup_stop"):
            raise serializers.ValidationError({"pickup_stop": "Pickup stop is required when the student uses pickup."})
        if attrs.get("uses_dropoff", True) and not attrs.get("dropoff_stop"):
            attrs["dropoff_stop"] = attrs.get("pickup_stop")
        return attrs
