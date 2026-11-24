from __future__ import annotations

from rest_framework import serializers

from apps.core.serializers import TenantPrimaryKeyRelatedField
from apps.people.models import StaffProfile

from .models import StaffVehicleAssignment, Vehicle, VehicleDocument, VehicleMaintenance


class VehicleDocumentSerializer(serializers.ModelSerializer):
    is_expired = serializers.BooleanField(read_only=True)

    class Meta:
        model = VehicleDocument
        fields = ("id", "vehicle", "doc_type", "title", "number", "issued_on", "expires_on", "file", "notes", "is_expired", "created_at")
        read_only_fields = ("vehicle",)


class VehicleMaintenanceSerializer(serializers.ModelSerializer):
    class Meta:
        model = VehicleMaintenance
        fields = ("id", "vehicle", "category", "description", "performed_on", "cost", "odometer_km", "vendor", "next_due_on", "created_at")
        read_only_fields = ("vehicle",)


class StaffVehicleAssignmentSerializer(serializers.ModelSerializer):
    staff = TenantPrimaryKeyRelatedField(queryset=StaffProfile.objects.all())
    vehicle = TenantPrimaryKeyRelatedField(queryset=Vehicle.objects.all())
    staff_name = serializers.CharField(source="staff.full_name", read_only=True)
    staff_type = serializers.CharField(source="staff.staff_type", read_only=True)
    staff_phone = serializers.CharField(source="staff.phone", read_only=True)
    vehicle_registration = serializers.CharField(source="vehicle.registration_number", read_only=True)

    class Meta:
        model = StaffVehicleAssignment
        fields = (
            "id",
            "vehicle",
            "vehicle_registration",
            "staff",
            "staff_name",
            "staff_type",
            "staff_phone",
            "role",
            "start_date",
            "end_date",
            "is_active",
            "notes",
            "created_at",
        )
        read_only_fields = ("is_active", "end_date")
        validators = []  # "one active assignment" is enforced by the service (it ends the previous one)

    def validate(self, attrs):
        staff = attrs["staff"]
        role = attrs["role"]
        expected = {"DRIVER": "DRIVER", "ATTENDANT": "ATTENDANT"}[role]
        if staff.staff_type != expected:
            raise serializers.ValidationError({"staff": f"Selected staff member is not a {expected.lower()}."})
        if staff.status == StaffProfile.Status.INACTIVE:
            raise serializers.ValidationError({"staff": "Staff member is inactive."})
        if role == "DRIVER" and staff.licence_expired:
            raise serializers.ValidationError({"staff": "Driver's licence has expired."})
        return attrs


class VehicleSerializer(serializers.ModelSerializer):
    display_name = serializers.CharField(read_only=True)
    document_alerts = serializers.ListField(read_only=True)
    has_expired_documents = serializers.BooleanField(read_only=True)
    driver = serializers.SerializerMethodField()
    attendant = serializers.SerializerMethodField()
    routes = serializers.SerializerMethodField()
    assigned_students = serializers.SerializerMethodField()
    documents = VehicleDocumentSerializer(many=True, read_only=True)

    class Meta:
        model = Vehicle
        fields = (
            "id",
            "registration_number",
            "fleet_number",
            "display_name",
            "vehicle_type",
            "make",
            "model",
            "year",
            "colour",
            "capacity",
            "status",
            "gps_device_id",
            "insurance_number",
            "insurance_expiry",
            "permit_number",
            "permit_expiry",
            "fitness_certificate_number",
            "fitness_expiry",
            "pollution_expiry",
            "last_service_date",
            "next_service_due",
            "odometer_km",
            "notes",
            "document_alerts",
            "has_expired_documents",
            "driver",
            "attendant",
            "routes",
            "assigned_students",
            "documents",
            "created_at",
            "updated_at",
        )

    def _active(self, obj, role):
        return next((a for a in obj.staff_assignments.all() if a.is_active and a.role == role), None)

    def get_driver(self, obj):
        a = self._active(obj, "DRIVER")
        return (
            {
                "assignment_id": str(a.id),
                "id": str(a.staff_id),
                "name": a.staff.full_name,
                "phone": a.staff.phone,
                "licence_expired": a.staff.licence_expired,
            }
            if a
            else None
        )

    def get_attendant(self, obj):
        a = self._active(obj, "ATTENDANT")
        return {"assignment_id": str(a.id), "id": str(a.staff_id), "name": a.staff.full_name, "phone": a.staff.phone} if a else None

    def get_routes(self, obj):
        return [{"id": str(r.id), "name": r.name, "code": r.code} for r in obj.routes.all() if r.is_active]

    def get_assigned_students(self, obj):
        return getattr(obj, "assigned_student_count", None)

    def validate_registration_number(self, value):
        value = value.upper().replace(" ", "")
        qs = Vehicle.objects.filter(school=self.context["school"], registration_number=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("A vehicle with this registration already exists.")
        return value

    def validate_capacity(self, value):
        if value < 1:
            raise serializers.ValidationError("Capacity must be at least 1.")
        if self.instance:
            from apps.routing.models import StudentTransportAssignment

            assigned = StudentTransportAssignment.objects.filter(route__vehicle=self.instance, is_active=True).count()
            if assigned > value:
                raise serializers.ValidationError(f"{assigned} students are assigned to routes on this vehicle; capacity cannot be below that.")
        return value


class VehicleListSerializer(VehicleSerializer):
    class Meta(VehicleSerializer.Meta):
        fields = tuple(f for f in VehicleSerializer.Meta.fields if f not in ("documents", "notes"))
