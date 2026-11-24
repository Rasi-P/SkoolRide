"""Object-level transport access shared by HTTP and WebSocket consumers."""

from django.db.models import F, Q

from .models import Trip


def assigned_trips(staff, queryset=None):
    from apps.fleet.models import StaffVehicleAssignment

    qs = queryset if queryset is not None else Trip.objects.all()
    if staff is None or staff.status == "INACTIVE":
        return qs.none()
    vehicles = StaffVehicleAssignment.objects.filter(staff=staff, school=staff.school, is_active=True).values("vehicle_id")
    return qs.filter(school=staff.school).filter(
        Q(driver=staff) | Q(attendant=staff) | Q(vehicle_id__in=vehicles, driver__isnull=True)
    )


def authorized_child_trips(queryset):
    """Keep historical records, but revoke live access when transport eligibility ends."""
    eligible = Q(
        assignment__is_active=True,
        assignment__route_id=F("trip__route_id"),
        assignment__start_date__lte=F("trip__scheduled_date"),
        student__status="ACTIVE",
        student__transport_status="ACTIVE",
    ) & (Q(assignment__end_date__isnull=True) | Q(assignment__end_date__gte=F("trip__scheduled_date")))
    return queryset.filter(~Q(trip__status__in=["SCHEDULED", *Trip.ACTIVE_STATUSES]) | eligible)
