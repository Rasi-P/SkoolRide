from __future__ import annotations

from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from apps.core.audit import record_audit
from apps.core.exceptions import DomainError
from apps.core.geo import path_length_m
from apps.people.models import Student

from .models import Route, RouteStop, StudentTransportAssignment


@transaction.atomic
def replace_route_stops(*, route: Route, stops: list[dict], request=None) -> list[RouteStop]:
    """Replace the ordered stop list of a route, preserving ids where provided so assignments survive edits."""
    existing = {str(s.id): s for s in route.stops.all()}
    keep_ids = set()
    # Temporarily offset sequences to avoid unique collisions while re-ordering.
    for s in existing.values():
        s.sequence += 1000
        s.save(update_fields=["sequence"])
    result = []
    for idx, data in enumerate(stops, start=1):
        sid = str(data.get("id")) if data.get("id") else None
        payload = {k: v for k, v in data.items() if k != "id"}
        payload["sequence"] = idx
        if sid and sid in existing:
            stop = existing[sid]
            for k, v in payload.items():
                setattr(stop, k, v)
            stop.save()
            keep_ids.add(sid)
        else:
            stop = RouteStop.objects.create(school=route.school, route=route, **payload)
        result.append(stop)
    removed = [s for sid, s in existing.items() if sid not in keep_ids]
    for s in removed:
        if s.pickup_assignments.filter(is_active=True).exists() or s.dropoff_assignments.filter(is_active=True).exists():
            raise DomainError(f"Stop '{s.name}' has students assigned; move them before removing the stop.")
        s.delete()
    route.version += 1
    route.distance_km = Decimal(path_length_m(route.polyline()) / 1000).quantize(Decimal("0.01"))
    route.save(update_fields=["version", "distance_km", "updated_at"])
    record_audit(action="route.stops_updated", request=request, target=route, changes={"version": route.version, "stops": [s.name for s in result]})
    return result


def check_capacity(route: Route, extra: int = 1) -> None:
    if route.vehicle_id and route.vehicle:
        current = route.student_assignments.filter(is_active=True).count()
        if current + extra > route.vehicle.capacity:
            raise DomainError(
                f"Vehicle {route.vehicle.registration_number} capacity is {route.vehicle.capacity}; {current} students already assigned."
            )


@transaction.atomic
def assign_student(
    *, school, student: Student, route: Route, pickup_stop, dropoff_stop, uses_pickup=True, uses_dropoff=True, start_date=None, notes="", request=None
) -> StudentTransportAssignment:
    if student.status != Student.Status.ACTIVE:
        raise DomainError("Only active students can be assigned to transport.")
    if not route.is_active:
        raise DomainError("Route is inactive.")
    current = StudentTransportAssignment.objects.filter(student=student, is_active=True).first()
    if current and current.route_id != route.id:
        check_capacity(route)
    elif current is None:
        check_capacity(route)
    if current:
        current.is_active = False
        current.end_date = timezone.localdate()
        current.ended_reason = "Reassigned"
        current.save(update_fields=["is_active", "end_date", "ended_reason"])
    assignment = StudentTransportAssignment.objects.create(
        school=school,
        student=student,
        route=route,
        pickup_stop=pickup_stop,
        dropoff_stop=dropoff_stop,
        uses_pickup=uses_pickup,
        uses_dropoff=uses_dropoff,
        start_date=start_date or timezone.localdate(),
        notes=notes,
    )
    if student.transport_status != Student.TransportStatus.ACTIVE:
        student.transport_status = Student.TransportStatus.ACTIVE
        student.save(update_fields=["transport_status"])
    record_audit(
        action="student.transport_assigned",
        request=request,
        target=assignment,
        changes={"route": route.code, "pickup_stop": pickup_stop.name if pickup_stop else None},
    )
    return assignment


def end_assignment(*, assignment: StudentTransportAssignment, reason="", request=None):
    if not assignment.is_active:
        raise DomainError("Assignment already ended.")
    assignment.is_active = False
    assignment.end_date = timezone.localdate()
    assignment.ended_reason = reason
    assignment.save(update_fields=["is_active", "end_date", "ended_reason"])
    record_audit(action="student.transport_assignment_ended", request=request, target=assignment, changes={"reason": reason})
    return assignment


def end_student_assignments(student: Student, reason: str = "") -> int:
    return StudentTransportAssignment.objects.filter(student=student, is_active=True).update(
        is_active=False, end_date=timezone.localdate(), ended_reason=reason
    )


def route_geojson(route: Route) -> dict:
    stops = route.ordered_stops()
    features = [
        {
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [float(s.longitude), float(s.latitude)]},
            "properties": {
                "id": str(s.id),
                "name": s.name,
                "sequence": s.sequence,
                "is_school_stop": s.is_school_stop,
                "planned_pickup_time": s.planned_pickup_time,
                "planned_dropoff_time": s.planned_dropoff_time,
            },
        }
        for s in stops
    ]
    line = [[lng, lat] for lat, lng in route.polyline()]
    features.append(
        {"type": "Feature", "geometry": {"type": "LineString", "coordinates": line}, "properties": {"route": route.code, "colour": route.colour}}
    )
    return {"type": "FeatureCollection", "features": features}
