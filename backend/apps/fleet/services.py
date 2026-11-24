from __future__ import annotations

from django.db import transaction
from django.utils import timezone

from apps.core.audit import record_audit
from apps.core.exceptions import DomainError

from .models import StaffVehicleAssignment, Vehicle


@transaction.atomic
def assign_staff_to_vehicle(*, school, vehicle: Vehicle, staff, role: str, start_date=None, notes="", request=None):
    """Assign a driver/attendant to a vehicle, ending any conflicting active assignments (with history)."""
    today = timezone.localdate()
    start_date = start_date or today
    if vehicle.status == Vehicle.Status.INACTIVE:
        raise DomainError("Cannot assign staff to an inactive vehicle.")
    # End the staff member's existing active assignment (one vehicle at a time).
    StaffVehicleAssignment.objects.filter(staff=staff, is_active=True).update(is_active=False, end_date=today)
    # End the vehicle's existing assignment for this role.
    StaffVehicleAssignment.objects.filter(vehicle=vehicle, role=role, is_active=True).update(is_active=False, end_date=today)
    assignment = StaffVehicleAssignment.objects.create(school=school, vehicle=vehicle, staff=staff, role=role, start_date=start_date, notes=notes)
    record_audit(
        action="vehicle.staff_assigned",
        request=request,
        target=assignment,
        changes={"vehicle": vehicle.registration_number, "staff": staff.full_name, "role": role},
    )
    return assignment


def unassign_staff(*, assignment: StaffVehicleAssignment, request=None):
    if not assignment.is_active:
        raise DomainError("Assignment is already ended.")
    assignment.is_active = False
    assignment.end_date = timezone.localdate()
    assignment.save(update_fields=["is_active", "end_date"])
    record_audit(action="vehicle.staff_unassigned", request=request, target=assignment)
    return assignment


def change_vehicle_status(*, vehicle: Vehicle, status: str, request=None):
    from apps.trips.models import Trip

    if (
        status in (Vehicle.Status.MAINTENANCE, Vehicle.Status.INACTIVE)
        and Trip.objects.filter(vehicle=vehicle, status=Trip.Status.IN_PROGRESS).exists()
    ):
        raise DomainError("Vehicle has a trip in progress; finish it first.")
    old = vehicle.status
    vehicle.status = status
    vehicle.save(update_fields=["status", "updated_at"])
    record_audit(action="vehicle.status_changed", request=request, target=vehicle, changes={"status": [old, status]})
    return vehicle
