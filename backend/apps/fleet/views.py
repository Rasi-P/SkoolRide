from __future__ import annotations

from django.db.models import Count, Q
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from apps.core.audit import record_audit
from apps.core.models import AuditLog
from apps.core.roles import Perm
from apps.core.serializers import AuditLogSerializer
from apps.core.utils import csv_response, model_changes
from apps.core.views import TenantModelViewSet

from . import services
from .models import StaffVehicleAssignment, Vehicle, VehicleDocument, VehicleMaintenance
from .serializers import (
    StaffVehicleAssignmentSerializer,
    VehicleDocumentSerializer,
    VehicleListSerializer,
    VehicleMaintenanceSerializer,
    VehicleSerializer,
)


class VehicleStatusSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=Vehicle.Status.choices)


class VehicleViewSet(TenantModelViewSet):
    required_perms = {"GET": Perm.VEHICLES_VIEW, "POST": Perm.VEHICLES_MANAGE}
    queryset = Vehicle.objects.prefetch_related("staff_assignments__staff", "documents", "routes")
    filterset_fields = ["status", "vehicle_type"]
    search_fields = ["registration_number", "fleet_number", "make", "model"]
    ordering_fields = ["registration_number", "fleet_number", "capacity", "status", "created_at"]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get_queryset(self):
        return (
            super()
            .get_queryset()
            .annotate(
                assigned_student_count=Count("routes__student_assignments", filter=Q(routes__student_assignments__is_active=True), distinct=True)
            )
            .order_by("fleet_number", "registration_number")
        )

    def get_serializer_class(self):
        return VehicleListSerializer if self.action == "list" else VehicleSerializer

    def perform_create(self, serializer):
        sub = getattr(self.school, "subscription", None)
        if sub and Vehicle.objects.filter(school=self.school).count() >= sub.plan.max_vehicles:
            raise serializers.ValidationError({"detail": f"Your plan allows up to {sub.plan.max_vehicles} vehicles. Upgrade to add more."})
        obj = serializer.save(school=self.school)
        record_audit(action="vehicle.created", request=self.request, target=obj)

    def perform_update(self, serializer):
        changes = model_changes(serializer.instance, serializer.validated_data, serializer.validated_data.keys())
        obj = serializer.save()
        record_audit(action="vehicle.updated", request=self.request, target=obj, changes=changes)

    def perform_destroy(self, instance):
        services.change_vehicle_status(vehicle=instance, status=Vehicle.Status.INACTIVE, request=self.request)

    @extend_schema(request=VehicleStatusSerializer)
    @action(detail=True, methods=["post"], url_path="set-status")
    def set_status(self, request, pk=None):
        ser = VehicleStatusSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        vehicle = services.change_vehicle_status(vehicle=self.get_object(), status=ser.validated_data["status"], request=request)
        return Response(VehicleSerializer(vehicle, context=self.get_serializer_context()).data)

    @extend_schema(request=StaffVehicleAssignmentSerializer)
    @action(detail=True, methods=["post"], url_path="assign-staff")
    def assign_staff(self, request, pk=None):
        vehicle = self.get_object()
        data = {**request.data, "vehicle": str(vehicle.id)}
        ser = StaffVehicleAssignmentSerializer(data=data, context=self.get_serializer_context())
        ser.is_valid(raise_exception=True)
        assignment = services.assign_staff_to_vehicle(
            school=self.school,
            vehicle=vehicle,
            staff=ser.validated_data["staff"],
            role=ser.validated_data["role"],
            start_date=ser.validated_data.get("start_date"),
            notes=ser.validated_data.get("notes", ""),
            request=request,
        )
        return Response(StaffVehicleAssignmentSerializer(assignment).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["get", "post"])
    def documents(self, request, pk=None):
        vehicle = self.get_object()
        if request.method == "GET":
            return Response(VehicleDocumentSerializer(vehicle.documents.all(), many=True).data)
        ser = VehicleDocumentSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        doc = ser.save(vehicle=vehicle, school=self.school)
        record_audit(action="vehicle.document_added", request=request, target=doc)
        return Response(VehicleDocumentSerializer(doc).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["get", "post"])
    def maintenance(self, request, pk=None):
        vehicle = self.get_object()
        if request.method == "GET":
            return Response(VehicleMaintenanceSerializer(vehicle.maintenance.all(), many=True).data)
        ser = VehicleMaintenanceSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        rec = ser.save(vehicle=vehicle, school=self.school)
        if rec.next_due_on:
            vehicle.next_service_due = rec.next_due_on
        vehicle.last_service_date = rec.performed_on
        if rec.odometer_km:
            vehicle.odometer_km = max(vehicle.odometer_km, rec.odometer_km)
        vehicle.save()
        record_audit(action="vehicle.maintenance_logged", request=request, target=rec)
        return Response(VehicleMaintenanceSerializer(rec).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["get"])
    def history(self, request, pk=None):
        vehicle = self.get_object()
        assignments = vehicle.staff_assignments.select_related("staff").order_by("-start_date")
        audit = AuditLog.objects.filter(target_type="Vehicle", target_id=str(vehicle.pk)).order_by("-created_at")[:50]
        return Response(
            {
                "assignments": StaffVehicleAssignmentSerializer(assignments, many=True).data,
                "audit": AuditLogSerializer(audit, many=True).data,
            }
        )

    @action(detail=False, methods=["get"])
    def export(self, request):
        qs = self.filter_queryset(self.get_queryset())
        return csv_response(
            "vehicles.csv",
            ["registration", "fleet_number", "type", "capacity", "status", "insurance_expiry", "permit_expiry", "fitness_expiry", "driver"],
            (
                (
                    v.registration_number,
                    v.fleet_number,
                    v.vehicle_type,
                    v.capacity,
                    v.status,
                    v.insurance_expiry,
                    v.permit_expiry,
                    v.fitness_expiry,
                    next((a.staff.full_name for a in v.staff_assignments.all() if a.is_active and a.role == "DRIVER"), ""),
                )
                for v in qs
            ),
        )


class VehicleDocumentViewSet(TenantModelViewSet):
    required_perms = {"GET": Perm.VEHICLES_VIEW, "POST": Perm.VEHICLES_MANAGE}
    serializer_class = VehicleDocumentSerializer
    queryset = VehicleDocument.objects.select_related("vehicle")
    filterset_fields = ["vehicle", "doc_type"]
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    http_method_names = ["get", "patch", "delete", "head", "options"]


class StaffVehicleAssignmentViewSet(TenantModelViewSet):
    required_perms = {"GET": Perm.VEHICLES_VIEW, "POST": Perm.VEHICLES_MANAGE}
    serializer_class = StaffVehicleAssignmentSerializer
    queryset = StaffVehicleAssignment.objects.select_related("staff", "vehicle")
    filterset_fields = ["vehicle", "staff", "role", "is_active"]
    http_method_names = ["get", "post", "head", "options"]

    def create(self, request, *args, **kwargs):
        ser = self.get_serializer(data=request.data)
        ser.is_valid(raise_exception=True)
        assignment = services.assign_staff_to_vehicle(
            school=self.school,
            vehicle=ser.validated_data["vehicle"],
            staff=ser.validated_data["staff"],
            role=ser.validated_data["role"],
            start_date=ser.validated_data.get("start_date"),
            notes=ser.validated_data.get("notes", ""),
            request=request,
        )
        return Response(self.get_serializer(assignment).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def end(self, request, pk=None):
        assignment = services.unassign_staff(assignment=self.get_object(), request=request)
        return Response(self.get_serializer(assignment).data)


class VehicleMaintenanceViewSet(TenantModelViewSet):
    required_perms = {"GET": Perm.VEHICLES_VIEW, "POST": Perm.VEHICLES_MANAGE}
    serializer_class = VehicleMaintenanceSerializer
    queryset = VehicleMaintenance.objects.select_related("vehicle")
    filterset_fields = ["vehicle", "category"]
    http_method_names = ["get", "patch", "delete", "head", "options"]
