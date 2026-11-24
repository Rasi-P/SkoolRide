"""Trip lifecycle, GPS ingestion, ETA/arrival notifications, boarding, incidents."""

from __future__ import annotations

import logging
import math
from datetime import UTC, datetime, timedelta

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.conf import settings
from django.db import transaction
from django.db.models import F, Q
from django.utils import timezone

from apps.core.audit import record_audit
from apps.core.exceptions import DomainError, StateTransitionError
from apps.core.geo import haversine_m
from apps.routing.models import Direction, Route, RouteSchedule, StudentTransportAssignment

from . import eta as eta_module
from .models import BoardingEvent, GPSLocation, Incident, Trip, TripEvent, TripStop, TripStudent, VehicleLocation

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Trip creation
# ---------------------------------------------------------------------------
def _build_trip_stops_and_students(trip: Trip) -> None:
    route = trip.route
    stops = route.ordered_stops(trip.direction)
    trip_stops = {}
    for idx, rs in enumerate(stops, start=1):
        planned = rs.planned_pickup_time if trip.direction == Direction.PICKUP else rs.planned_dropoff_time
        ts = TripStop.objects.create(school=trip.school, trip=trip, route_stop=rs, sequence=idx, planned_time=planned)
        trip_stops[rs.id] = ts
    assignments = StudentTransportAssignment.objects.filter(
        school=trip.school, route=route, is_active=True, start_date__lte=trip.scheduled_date
    ).filter(Q(end_date__isnull=True) | Q(end_date__gte=trip.scheduled_date)).select_related("student")
    from apps.engagement.models import AbsenceRequest

    absences = list(
        AbsenceRequest.objects.filter(school=trip.school, date_from__lte=trip.scheduled_date, date_to__gte=trip.scheduled_date).exclude(
            status=AbsenceRequest.Status.CANCELLED
        )
    )
    expected = 0
    for a in assignments:
        if a.student.status != "ACTIVE" or a.student.transport_status != "ACTIVE":
            continue
        if trip.direction == Direction.PICKUP and not a.uses_pickup:
            continue
        if trip.direction == Direction.DROPOFF and not a.uses_dropoff:
            continue
        stop = a.pickup_stop if trip.direction == Direction.PICKUP else (a.dropoff_stop or a.pickup_stop)
        absence = next((ab for ab in absences if ab.student_id == a.student_id and ab.covers(trip.scheduled_date, trip.direction)), None)
        TripStudent.objects.create(
            school=trip.school,
            trip=trip,
            student=a.student,
            assignment=a,
            trip_stop=trip_stops.get(stop.id) if stop else None,
            status=TripStudent.Status.ABSENT if absence else TripStudent.Status.EXPECTED,
            absence_reason=f"Reported by parent: {absence.reason}"[:255] if absence else "",
        )
        expected += 1
    trip.expected_students = expected
    trip.route_version = route.version
    trip.save(update_fields=["expected_students", "route_version"])


@transaction.atomic
def create_trip(
    *,
    school,
    route: Route,
    direction: str,
    scheduled_date,
    scheduled_start_time,
    vehicle=None,
    driver=None,
    attendant=None,
    schedule: RouteSchedule | None = None,
    actor=None,
    request=None,
    is_simulated=False,
    replacement_of=None,
    notes="",
) -> Trip:
    if route.school_id != school.id:
        raise DomainError("Route does not belong to this school.")
    if not school.is_operational or not route.is_active:
        raise DomainError("School and route must be active before scheduling a trip.")
    if route.stops.count() < 2:
        raise DomainError("Route needs at least two stops before trips can be scheduled.")
    vehicle = vehicle or route.vehicle
    driver = driver or route.driver
    attendant = attendant or route.attendant
    for staff, kind in ((driver, "DRIVER"), (attendant, "ATTENDANT")):
        if staff and (staff.school_id != school.id or staff.staff_type != kind or staff.status != "ACTIVE"):
            raise DomainError(f"Assigned {kind.lower()} must be active and belong to this school.")
    if vehicle is not None and vehicle.school_id != school.id:
        raise DomainError("Vehicle does not belong to this school.")
    if vehicle is not None and vehicle.status in ("INACTIVE", "MAINTENANCE"):
        raise DomainError(f"Vehicle {vehicle.registration_number} is {vehicle.status.lower()}.")
    if driver is not None and driver.staff_type != "DRIVER":
        raise DomainError("Assigned driver is not a driver.")
    if driver is not None and driver.licence_expired:
        raise DomainError("Driver's licence has expired.")
    trip = Trip.objects.create(
        school=school,
        route=route,
        schedule=schedule,
        direction=direction,
        scheduled_date=scheduled_date,
        scheduled_start_time=scheduled_start_time,
        vehicle=vehicle,
        driver=driver,
        attendant=attendant,
        is_simulated=is_simulated,
        replacement_of=replacement_of,
        notes=notes,
    )
    _build_trip_stops_and_students(trip)
    if vehicle and trip.expected_students > vehicle.capacity:
        raise DomainError("The assigned vehicle cannot accommodate all students on this trip.")
    record_audit(action="trip.created", request=request, actor=actor, target=trip)
    return trip


def generate_trips_for_date(school, date, *, actor=None) -> list[Trip]:
    created = []
    schedules = RouteSchedule.objects.filter(school=school, is_active=True, route__is_active=True).select_related("route")
    for sched in schedules:
        if not sched.runs_on(date):
            continue
        if Trip.objects.filter(schedule=sched, scheduled_date=date, replacement_of__isnull=True).exists():
            continue
        try:
            created.append(
                create_trip(
                    school=school,
                    route=sched.route,
                    direction=sched.direction,
                    scheduled_date=date,
                    scheduled_start_time=sched.start_time,
                    schedule=sched,
                    actor=actor,
                )
            )
        except DomainError as exc:
            logger.warning("Skipping schedule %s for %s: %s", sched, date, exc)
    return created


# ---------------------------------------------------------------------------
# Broadcasting
# ---------------------------------------------------------------------------
def trip_group(trip_id) -> str:
    return f"trip_{trip_id}"


def school_group(school_id) -> str:
    return f"school_{school_id}_live"


def broadcast(trip: Trip, event: str, payload: dict) -> None:
    layer = get_channel_layer()
    if layer is None:
        return
    message = {"type": "trip.message", "event": event, "trip_id": str(trip.id), "payload": payload}
    try:
        async_to_sync(layer.group_send)(trip_group(trip.id), message)
        async_to_sync(layer.group_send)(school_group(trip.school_id), message)
    except Exception:  # pragma: no cover - channel layer unavailable in some dev setups
        logger.exception("Failed to broadcast trip event")


def trip_snapshot(trip: Trip) -> dict:
    from .serializers import TripLiveSerializer

    return TripLiveSerializer(trip).data


# ---------------------------------------------------------------------------
# Lifecycle
# ---------------------------------------------------------------------------
def _event(trip, event_type, description="", data=None, user=None):
    return TripEvent.objects.create(school=trip.school, trip=trip, event_type=event_type, description=description, data=data or {}, created_by=user)


@transaction.atomic
def start_trip(*, trip: Trip, user, request=None) -> Trip:
    Trip.objects.select_for_update(of=("self",)).get(pk=trip.pk)  # row lock
    trip.refresh_from_db()
    if trip.status != Trip.Status.SCHEDULED:
        raise StateTransitionError(f"Trip cannot be started from status {trip.status}.")
    if trip.vehicle is None:
        raise DomainError("Assign a vehicle before starting the trip.")
    from apps.fleet.models import Vehicle

    trip.vehicle = Vehicle.objects.select_for_update().get(pk=trip.vehicle_id)
    if not trip.school.is_operational:
        raise DomainError("This school is not active.")
    if trip.driver and (trip.driver.status != "ACTIVE" or trip.driver.licence_expired):
        raise DomainError("The assigned driver is unavailable or has an expired licence.")
    if trip.expected_students > trip.vehicle.capacity:
        raise DomainError("The assigned vehicle cannot accommodate all students on this trip.")
    if trip.vehicle.status in ("INACTIVE", "MAINTENANCE"):
        raise DomainError("Assigned vehicle is not available.")
    active = Trip.objects.filter(vehicle=trip.vehicle, status__in=Trip.ACTIVE_STATUSES).exclude(pk=trip.pk).first()
    if active:
        raise DomainError(f"Vehicle already has an active trip ({active}).")
    if trip.trip_students.count() == 0 and trip.expected_students == 0:
        _build_trip_stops_and_students(trip) if trip.stops.count() == 0 else None
    trip.status = Trip.Status.IN_PROGRESS
    trip.started_at = timezone.now()
    trip.save(update_fields=["status", "started_at", "updated_at"])
    trip.vehicle.status = "IN_SERVICE"
    trip.vehicle.save(update_fields=["status"])
    _event(trip, TripEvent.EventType.STARTED, user=user)
    record_audit(action="trip.started", request=request, actor=user, target=trip)
    from apps.notifications.services import notify_trip_guardians

    notify_trip_guardians(
        trip,
        category="TRIP_STARTED",
        title="Bus trip started",
        body="{vehicle} has started the {direction} trip on route {route}.",
        dedupe_suffix="start",
    )
    broadcast(trip, "status", trip_snapshot(trip))
    return trip


@transaction.atomic
def pause_trip(*, trip: Trip, user, reason="", request=None) -> Trip:
    if trip.status != Trip.Status.IN_PROGRESS:
        raise StateTransitionError("Only an in-progress trip can be paused.")
    trip.status = Trip.Status.PAUSED
    trip.paused_at = timezone.now()
    trip.save(update_fields=["status", "paused_at", "updated_at"])
    _event(trip, TripEvent.EventType.PAUSED, description=reason, user=user)
    broadcast(trip, "status", trip_snapshot(trip))
    return trip


@transaction.atomic
def resume_trip(*, trip: Trip, user, request=None) -> Trip:
    if trip.status != Trip.Status.PAUSED:
        raise StateTransitionError("Only a paused trip can be resumed.")
    trip.status = Trip.Status.IN_PROGRESS
    trip.paused_at = None
    trip.save(update_fields=["status", "paused_at", "updated_at"])
    _event(trip, TripEvent.EventType.RESUMED, user=user)
    broadcast(trip, "status", trip_snapshot(trip))
    return trip


@transaction.atomic
def end_trip(*, trip: Trip, user, request=None, notes="") -> Trip:
    Trip.objects.select_for_update(of=("self",)).get(pk=trip.pk)  # row lock
    trip.refresh_from_db()
    if trip.status not in Trip.ACTIVE_STATUSES:
        raise StateTransitionError(f"Trip cannot be ended from status {trip.status}.")
    now = timezone.now()
    # Students still on board at the end of a drop-off trip: record a drop at the final stop.
    last_stop = trip.stops.order_by("-sequence").first()
    if trip.direction == Direction.DROPOFF:
        from apps.notifications.services import notify_student_guardians as _notify

        for ts in trip.trip_students.filter(status=TripStudent.Status.BOARDED).select_related("student"):
            _record_boarding(trip, ts, BoardingEvent.EventType.DROPPED, user, stop=last_stop, note="Auto-recorded at trip end")
            _notify(
                student=ts.student,
                trip=trip,
                category="DROPPED",
                title=f"{ts.student.first_name} dropped off",
                body=f"{ts.student.first_name} was dropped off at the end of the trip.",
                dedupe_key=f"dropped:{trip.id}:{ts.student_id}",
            )
    else:
        # Pickup: students boarded are dropped at school at trip end.
        for ts in trip.trip_students.filter(status=TripStudent.Status.BOARDED):
            _record_boarding(trip, ts, BoardingEvent.EventType.DROPPED, user, stop=last_stop, note="Arrived at school")
        trip.trip_students.filter(status=TripStudent.Status.EXPECTED).update(status=TripStudent.Status.NO_SHOW)
    trip.stops.filter(status=TripStop.Status.PENDING).update(status=TripStop.Status.SKIPPED)
    trip.status = Trip.Status.COMPLETED
    trip.ended_at = now
    if notes:
        trip.notes = (trip.notes + "\n" + notes).strip()
    _recount(trip)
    trip.save()
    if trip.vehicle and not Trip.objects.filter(vehicle=trip.vehicle, status__in=Trip.ACTIVE_STATUSES).exclude(pk=trip.pk).exists():
        trip.vehicle.status = "AVAILABLE"
        trip.vehicle.save(update_fields=["status"])
    _event(trip, TripEvent.EventType.COMPLETED, user=user)
    record_audit(action="trip.completed", request=request, actor=user, target=trip)
    from apps.notifications.services import notify_trip_guardians

    if trip.direction == Direction.PICKUP:
        notify_trip_guardians(
            trip,
            category="SCHOOL_ARRIVAL",
            title="Bus arrived at school",
            body="{vehicle} has arrived at {school}. Students on board have been dropped off.",
            dedupe_suffix="arrival",
            only_statuses=("DROPPED",),
        )
    broadcast(trip, "status", trip_snapshot(trip))
    return trip


@transaction.atomic
def cancel_trip(*, trip: Trip, user, reason: str, request=None) -> Trip:
    if trip.status in (Trip.Status.COMPLETED, Trip.Status.CANCELLED):
        raise StateTransitionError(f"Trip is already {trip.status.lower()}.")
    trip.status = Trip.Status.CANCELLED
    trip.cancelled_reason = reason
    trip.ended_at = timezone.now()
    trip.save(update_fields=["status", "cancelled_reason", "ended_at", "updated_at"])
    if trip.vehicle and trip.vehicle.status == "IN_SERVICE":
        trip.vehicle.status = "AVAILABLE"
        trip.vehicle.save(update_fields=["status"])
    _event(trip, TripEvent.EventType.CANCELLED, description=reason, user=user)
    record_audit(action="trip.cancelled", request=request, actor=user, target=trip, changes={"reason": reason})
    from apps.notifications.services import notify_trip_guardians

    notify_trip_guardians(
        trip,
        category="TRIP_CANCELLED",
        title="Bus trip cancelled",
        body="The {direction} trip on route {route} for {date} has been cancelled. Reason: " + (reason or "not specified"),
        dedupe_suffix="cancel",
    )
    broadcast(trip, "status", trip_snapshot(trip))
    return trip


@transaction.atomic
def replace_vehicle(*, trip: Trip, vehicle, driver=None, reason="", user=None, request=None) -> Trip:
    """Handle a breakdown: cancel the current trip and create a replacement that inherits boarding state."""
    if trip.status not in (Trip.Status.SCHEDULED, *Trip.ACTIVE_STATUSES):
        raise StateTransitionError("Only scheduled or active trips can be replaced.")
    if vehicle.school_id != trip.school_id:
        raise DomainError("Vehicle does not belong to this school.")
    if Trip.objects.filter(vehicle=vehicle, status__in=Trip.ACTIVE_STATUSES).exists():
        raise DomainError("Replacement vehicle already has an active trip.")
    old_vehicle = trip.vehicle
    was_active = trip.status in Trip.ACTIVE_STATUSES
    _event(
        trip, TripEvent.EventType.BREAKDOWN, description=reason, user=user, data={"vehicle": old_vehicle.registration_number if old_vehicle else None}
    )
    new_trip = Trip.objects.create(
        school=trip.school,
        route=trip.route,
        schedule=None,
        direction=trip.direction,
        scheduled_date=trip.scheduled_date,
        scheduled_start_time=trip.scheduled_start_time,
        vehicle=vehicle,
        driver=driver or trip.driver,
        attendant=trip.attendant,
        replacement_of=trip,
        route_version=trip.route_version,
        notes=f"Replacement for {trip.id} ({reason})",
    )
    # Copy stops and students, carrying over statuses.
    stop_map = {}
    for ts in trip.stops.order_by("sequence"):
        stop_map[ts.id] = TripStop.objects.create(
            school=trip.school,
            trip=new_trip,
            route_stop=ts.route_stop,
            sequence=ts.sequence,
            planned_time=ts.planned_time,
            status=ts.status,
            arrived_at=ts.arrived_at,
            departed_at=ts.departed_at,
        )
    for s in trip.trip_students.all():
        TripStudent.objects.create(
            school=trip.school,
            trip=new_trip,
            student=s.student,
            assignment=s.assignment,
            trip_stop=stop_map.get(s.trip_stop_id),
            status=s.status,
            boarded_at=s.boarded_at,
            dropped_at=s.dropped_at,
            absence_reason=s.absence_reason,
        )
    new_trip.expected_students = trip.expected_students
    if was_active:
        new_trip.status = Trip.Status.IN_PROGRESS
        new_trip.started_at = timezone.now()
        vehicle.status = "IN_SERVICE"
        vehicle.save(update_fields=["status"])
    _recount(new_trip)
    new_trip.save()
    trip.status = Trip.Status.CANCELLED
    trip.cancelled_reason = f"Replaced by vehicle {vehicle.registration_number}: {reason}"
    trip.ended_at = timezone.now()
    trip.save(update_fields=["status", "cancelled_reason", "ended_at", "updated_at"])
    if old_vehicle:
        old_vehicle.status = "MAINTENANCE"
        old_vehicle.save(update_fields=["status"])
    _event(
        new_trip,
        TripEvent.EventType.REPLACEMENT,
        description=reason,
        user=user,
        data={"replaced_trip": str(trip.id), "old_vehicle": old_vehicle.registration_number if old_vehicle else None},
    )
    record_audit(
        action="trip.vehicle_replaced",
        request=request,
        actor=user,
        target=new_trip,
        changes={"old_trip": str(trip.id), "vehicle": vehicle.registration_number, "reason": reason},
    )
    from apps.notifications.services import notify_trip_guardians

    notify_trip_guardians(
        new_trip,
        category="TRIP_DELAY",
        title="Replacement bus assigned",
        body=f"A replacement bus ({vehicle.registration_number}) has been assigned to route {{route}}. Reason: {reason}",
        dedupe_suffix="replacement",
    )
    broadcast(trip, "status", trip_snapshot(trip))
    broadcast(new_trip, "status", trip_snapshot(new_trip))
    return new_trip


def _recount(trip: Trip) -> None:
    counts = {s: 0 for s in TripStudent.Status.values}
    for row in trip.trip_students.values("status"):
        counts[row["status"]] += 1
    trip.boarded_count = counts["BOARDED"] + counts["DROPPED"]
    trip.dropped_count = counts["DROPPED"]
    trip.absent_count = counts["ABSENT"] + counts["NO_SHOW"]


# ---------------------------------------------------------------------------
# GPS ingestion
# ---------------------------------------------------------------------------
def validate_location(data: dict) -> dict:
    try:
        numeric = {k: float(data[k]) for k in ("latitude", "longitude", "accuracy_m", "speed_mps", "heading") if data.get(k) is not None}
        lat, lon = numeric["latitude"], numeric["longitude"]
    except (KeyError, TypeError, ValueError) as exc:
        raise DomainError("GPS coordinates and measurements must be numeric.") from exc
    if not all(math.isfinite(v) for v in numeric.values()):
        raise DomainError("GPS measurements must be finite numbers.")
    if not (-90 <= lat <= 90) or not (-180 <= lon <= 180):
        raise DomainError("Coordinates out of range.")
    accuracy = data.get("accuracy_m")
    if accuracy is not None and float(accuracy) < 0:
        raise DomainError("GPS accuracy cannot be negative.")
    if accuracy is not None and float(accuracy) > settings.GPS_MAX_ACCURACY_METERS:
        raise DomainError(f"GPS accuracy too poor ({float(accuracy):.0f} m). Waiting for a better fix.")
    recorded_at = data.get("recorded_at") or timezone.now()
    if isinstance(recorded_at, str):
        try:
            recorded_at = datetime.fromisoformat(recorded_at.replace("Z", "+00:00"))
        except ValueError as exc:
            raise DomainError("Invalid location timestamp.") from exc
    if not isinstance(recorded_at, datetime):
        raise DomainError("Invalid location timestamp.")
    if timezone.is_naive(recorded_at):
        recorded_at = timezone.make_aware(recorded_at, UTC)
    now = timezone.now()
    if recorded_at > now + timedelta(seconds=settings.GPS_MAX_FUTURE_SKEW_SECONDS):
        raise DomainError("Location timestamp is in the future.")
    if recorded_at < now - timedelta(seconds=settings.GPS_MAX_AGE_SECONDS):
        raise DomainError("Location timestamp is too old to be useful.")
    speed = data.get("speed_mps")
    if speed is not None and (float(speed) < 0 or float(speed) > 60):
        speed = None
    heading = data.get("heading")
    if heading is not None and not 0 <= float(heading) < 360:
        raise DomainError("GPS heading must be between 0 and 360 degrees.")
    return {
        "latitude": lat,
        "longitude": lon,
        "accuracy_m": float(accuracy) if accuracy is not None else None,
        "speed_mps": float(speed) if speed is not None else None,
        "heading": float(heading) if heading is not None else None,
        "recorded_at": recorded_at,
    }


@transaction.atomic
def record_location(*, trip: Trip, data: dict, source: str = GPSLocation.Source.DRIVER_PWA, is_simulated=False) -> GPSLocation:
    trip = Trip.objects.select_for_update().get(pk=trip.pk)
    if not trip.school.is_operational:
        raise DomainError("This school is not active.")
    if trip.status != Trip.Status.IN_PROGRESS:
        raise StateTransitionError("Location updates are only accepted for in-progress trips.")
    clean = validate_location(data)
    last = GPSLocation.objects.filter(trip=trip).order_by("-recorded_at").first()
    if last and clean["recorded_at"] == last.recorded_at:
        return last  # same fix re-sent (stationary device or client retry): idempotent, nothing to record
    if last and clean["recorded_at"] < last.recorded_at:
        raise DomainError("Out-of-order location ignored.")
    if last and clean["speed_mps"] is None:
        dt = (clean["recorded_at"] - last.recorded_at).total_seconds()
        if dt > 0:
            dist = haversine_m(last.latitude, last.longitude, clean["latitude"], clean["longitude"])
            implied = dist / dt
            clean["speed_mps"] = implied if implied <= 50 else None
    point = GPSLocation.objects.create(
        school=trip.school, trip=trip, vehicle=trip.vehicle, source=source, is_simulated=is_simulated or trip.is_simulated, **clean
    )
    if trip.vehicle_id:
        VehicleLocation.objects.update_or_create(
            vehicle=trip.vehicle,
            defaults={"school": trip.school, "trip": trip, "is_simulated": point.is_simulated, **clean},
        )
    Trip.objects.filter(pk=trip.pk).update(last_location_at=clean["recorded_at"])
    trip.last_location_at = clean["recorded_at"]
    transaction.on_commit(lambda: _after_location_commit(trip.pk, point.pk))
    return point


def _after_location_commit(trip_id, point_id):
    from .tasks import process_location_update

    try:
        process_location_update.delay(str(trip_id), point_id)
    except Exception:  # broker unavailable -> run inline so demos keep working
        logger.warning("Celery broker unavailable; processing location inline")
        process_location_update(str(trip_id), point_id)


def process_location(trip: Trip, point: GPSLocation) -> dict:
    """Recompute ETAs, auto-detect stop arrivals, fire arrival/delay notifications, broadcast."""
    from apps.notifications.services import notify_student_guardians

    trip = Trip.objects.select_related("school", "route", "vehicle").get(pk=trip.pk)
    if trip.status != Trip.Status.IN_PROGRESS or not trip.school.is_operational:
        return {}
    if point.trip_id != trip.id or point.school_id != trip.school_id or trip.gps_is_stale():
        return {}
    etas = eta_module.estimate(trip, point.latitude, point.longitude, speed_mps=point.speed_mps)
    eta_by_stop = {e.trip_stop_id: e for e in etas}
    stops = {str(s.id): s for s in trip.stops.select_related("route_stop")}
    school = trip.school
    threshold = school.arrival_alert_minutes or settings.ARRIVAL_ALERT_MINUTES
    delay_threshold = school.delay_alert_minutes or 10
    now = timezone.now()

    # Auto-arrival for the next pending stop when within radius.
    next_pending = next((s for s in sorted(stops.values(), key=lambda s: s.sequence) if s.status == TripStop.Status.PENDING), None)
    if next_pending:
        e = eta_by_stop.get(str(next_pending.id))
        if e and e.distance_m is not None and e.distance_m <= eta_module.ARRIVAL_RADIUS_M and not e.passed:
            mark_stop_arrived(trip=trip, trip_stop=next_pending, user=None, auto=True)
            stops[str(next_pending.id)] = next_pending

    # Persist ETAs.
    for e in etas:
        ts = stops.get(e.trip_stop_id)
        if ts is None or ts.status != TripStop.Status.PENDING:
            continue
        ts.eta = e.eta_at
        ts.distance_remaining_m = e.distance_m
        ts.save(update_fields=["eta", "distance_remaining_m"])

    # Arrival-soon / delay notifications per expected student.
    from .access import authorized_child_trips

    alert_status = TripStudent.Status.BOARDED if trip.direction == Direction.DROPOFF else TripStudent.Status.EXPECTED
    expected = authorized_child_trips(trip.trip_students.filter(status=alert_status, trip_stop__isnull=False)).select_related(
        "student", "trip_stop__route_stop"
    )
    for ts_student in expected:
        e = eta_by_stop.get(str(ts_student.trip_stop_id))
        if e is None or e.seconds is None or e.passed:
            continue
        minutes = e.seconds / 60
        stop_name = ts_student.trip_stop.route_stop.name
        if minutes <= threshold:
            notify_student_guardians(
                student=ts_student.student,
                trip=trip,
                category="ARRIVAL_SOON",
                title="Bus arriving soon",
                body=f"Your child's school bus is approximately {max(1, round(minutes))} minutes away from {stop_name}. Please get ready.",
                dedupe_key=f"arrival:{trip.id}:{ts_student.student_id}:{ts_student.trip_stop_id}",
                data={"eta_minutes": round(minutes, 1), "stop": stop_name, "stop_id": str(ts_student.trip_stop_id)},
            )
        # Significant ETA change after an alert was sent (bus got delayed after "10 minutes away").
        if ts_student.last_notified_eta and e.eta_at and (e.eta_at - ts_student.last_notified_eta) > timedelta(minutes=5):
            notify_student_guardians(
                student=ts_student.student,
                trip=trip,
                category="ETA_CHANGED",
                title="Bus ETA updated",
                body=f"The bus is now expected at {stop_name} in about {max(1, round(minutes))} minutes.",
                dedupe_key=f"etachange:{trip.id}:{ts_student.student_id}:{ts_student.trip_stop_id}:{int(e.eta_at.timestamp() // 600)}",
                data={"eta_minutes": round(minutes, 1), "stop": stop_name},
            )
        # Delay vs planned time.
        planned = ts_student.trip_stop.planned_time
        if planned and e.eta_at:
            planned_dt = datetime.combine(trip.scheduled_date, planned, tzinfo=trip.scheduled_start_at.tzinfo)
            delay = (e.eta_at - planned_dt).total_seconds() / 60
            if delay >= delay_threshold:
                notify_student_guardians(
                    student=ts_student.student,
                    trip=trip,
                    category="TRIP_DELAY",
                    title="Bus running late",
                    body=f"The bus is running about {round(delay)} minutes late for {stop_name}.",
                    dedupe_key=f"delay:{trip.id}:{ts_student.student_id}:{ts_student.trip_stop_id}",
                    data={"delay_minutes": round(delay)},
                )
        if e.eta_at and (ts_student.last_notified_eta is None or minutes <= threshold):
            TripStudent.objects.filter(pk=ts_student.pk).update(last_notified_eta=e.eta_at)

    # Trip-level delay estimate (next pending stop vs. its planned time).
    pending_sorted = [s for s in sorted(stops.values(), key=lambda s: s.sequence) if s.status == TripStop.Status.PENDING]
    if pending_sorted and pending_sorted[0].planned_time and pending_sorted[0].eta:
        planned_dt = datetime.combine(trip.scheduled_date, pending_sorted[0].planned_time, tzinfo=trip.scheduled_start_at.tzinfo)
        trip.delay_minutes = int((pending_sorted[0].eta - planned_dt).total_seconds() // 60)
        Trip.objects.filter(pk=trip.pk).update(delay_minutes=trip.delay_minutes)

    payload = {
        "location": {
            "latitude": point.latitude,
            "longitude": point.longitude,
            "speed_mps": point.speed_mps,
            "heading": point.heading,
            "accuracy_m": point.accuracy_m,
            "recorded_at": point.recorded_at.isoformat(),
            "is_simulated": point.is_simulated,
        },
        "etas": [
            {
                "trip_stop_id": e.trip_stop_id,
                "sequence": e.sequence,
                "distance_m": e.distance_m,
                "seconds": e.seconds,
                "eta_at": e.eta_at.isoformat() if e.eta_at else None,
                "passed": e.passed,
            }
            for e in etas
        ],
        "delay_minutes": trip.delay_minutes,
        "stale": False,
        "server_time": now.isoformat(),
    }
    broadcast(trip, "location", payload)
    return payload


# ---------------------------------------------------------------------------
# Stops and boarding
# ---------------------------------------------------------------------------
@transaction.atomic
def mark_stop_arrived(*, trip: Trip, trip_stop: TripStop, user, auto=False, request=None) -> TripStop:
    if trip.status != Trip.Status.IN_PROGRESS:
        raise StateTransitionError("Trip is not in progress.")
    if trip_stop.status != TripStop.Status.PENDING:
        return trip_stop
    # Earlier pending stops are skipped (driver may have passed them).
    trip.stops.filter(sequence__lt=trip_stop.sequence, status=TripStop.Status.PENDING).update(status=TripStop.Status.SKIPPED)
    trip_stop.status = TripStop.Status.ARRIVED
    trip_stop.arrived_at = timezone.now()
    trip_stop.eta = trip_stop.arrived_at
    trip_stop.distance_remaining_m = 0
    trip_stop.save(update_fields=["status", "arrived_at", "eta", "distance_remaining_m"])
    _event(
        trip,
        TripEvent.EventType.STOP_ARRIVED,
        description=trip_stop.route_stop.name,
        user=user,
        data={"trip_stop_id": str(trip_stop.id), "auto": auto},
    )
    broadcast(trip, "stop", {"trip_stop_id": str(trip_stop.id), "status": trip_stop.status, "arrived_at": trip_stop.arrived_at.isoformat()})
    return trip_stop


@transaction.atomic
def mark_stop_departed(*, trip: Trip, trip_stop: TripStop, user, request=None) -> TripStop:
    if trip.status != Trip.Status.IN_PROGRESS:
        raise StateTransitionError("Trip is not in progress.")
    if trip_stop.status == TripStop.Status.PENDING:
        mark_stop_arrived(trip=trip, trip_stop=trip_stop, user=user)
    if trip_stop.status == TripStop.Status.DEPARTED:
        return trip_stop
    trip_stop.status = TripStop.Status.DEPARTED
    trip_stop.departed_at = timezone.now()
    trip_stop.save(update_fields=["status", "departed_at"])
    # Pickup: anyone still expected at this stop is a no-show.
    if trip.direction == Direction.PICKUP:
        from apps.notifications.services import notify_student_guardians as _notify

        for ts in trip.trip_students.filter(trip_stop=trip_stop, status=TripStudent.Status.EXPECTED).select_related("student"):
            _record_boarding(trip, ts, BoardingEvent.EventType.NO_SHOW, user, stop=trip_stop, note="Not present at departure")
            _notify(
                student=ts.student,
                trip=trip,
                category="NO_SHOW",
                title=f"{ts.student.first_name} did not board",
                body=f"{ts.student.first_name} was not present when the bus left {trip_stop.route_stop.name}.",
                dedupe_key=f"noshow:{trip.id}:{ts.student_id}",
            )
    _event(trip, TripEvent.EventType.STOP_DEPARTED, description=trip_stop.route_stop.name, user=user, data={"trip_stop_id": str(trip_stop.id)})
    _recount(trip)
    trip.save(update_fields=["boarded_count", "dropped_count", "absent_count"])
    broadcast(trip, "stop", {"trip_stop_id": str(trip_stop.id), "status": trip_stop.status, "departed_at": trip_stop.departed_at.isoformat()})
    return trip_stop


def _record_boarding(trip, trip_student, event_type, user, stop=None, note="", lat=None, lon=None):
    now = timezone.now()
    trip_student.status = {
        "BOARDED": TripStudent.Status.BOARDED,
        "DROPPED": TripStudent.Status.DROPPED,
        "ABSENT": TripStudent.Status.ABSENT,
        "NO_SHOW": TripStudent.Status.NO_SHOW,
    }[event_type]
    if event_type == "BOARDED":
        trip_student.boarded_at = now
    elif event_type == "DROPPED":
        trip_student.dropped_at = now
    elif event_type in ("ABSENT", "NO_SHOW"):
        trip_student.absence_reason = note or trip_student.absence_reason
    trip_student.marked_by = user
    trip_student.save()
    loc = None
    if lat is None and trip.vehicle_id:
        loc = VehicleLocation.objects.filter(vehicle=trip.vehicle).first()
    event = BoardingEvent.objects.create(
        school=trip.school,
        trip=trip,
        trip_student=trip_student,
        student=trip_student.student,
        trip_stop=stop or trip_student.trip_stop,
        event_type=event_type,
        occurred_at=now,
        recorded_by=user,
        latitude=lat if lat is not None else (loc.latitude if loc else None),
        longitude=lon if lon is not None else (loc.longitude if loc else None),
        note=note,
    )
    return event


@transaction.atomic
def mark_student(*, trip: Trip, trip_student: TripStudent, event_type: str, user, note="", lat=None, lon=None, request=None) -> BoardingEvent:
    if trip.status != Trip.Status.IN_PROGRESS:
        raise StateTransitionError("Trip is not in progress.")
    current = trip_student.status
    allowed = {
        "BOARDED": (TripStudent.Status.EXPECTED, TripStudent.Status.NO_SHOW, TripStudent.Status.ABSENT),
        "DROPPED": (TripStudent.Status.BOARDED,),
        "ABSENT": (TripStudent.Status.EXPECTED,),
        "NO_SHOW": (TripStudent.Status.EXPECTED,),
    }[event_type]
    if current not in allowed:
        raise StateTransitionError(f"Cannot mark {event_type.lower()} from status {current}.")
    event = _record_boarding(trip, trip_student, event_type, user, note=note, lat=lat, lon=lon)
    _recount(trip)
    trip.save(update_fields=["boarded_count", "dropped_count", "absent_count"])
    record_audit(action=f"boarding.{event_type.lower()}", request=request, actor=user, target=event)
    from apps.notifications.services import notify_student_guardians

    student = trip_student.student
    stop_name = trip_student.trip_stop.route_stop.name if trip_student.trip_stop else "the stop"
    if event_type == "BOARDED":
        notify_student_guardians(
            student=student,
            trip=trip,
            category="BOARDED",
            title=f"{student.first_name} boarded the bus",
            body=f"{student.first_name} boarded {trip.vehicle.display_name if trip.vehicle else 'the bus'} at {stop_name}.",
            dedupe_key=f"boarded:{trip.id}:{student.id}",
            data={"event_id": str(event.id)},
        )
    elif event_type == "DROPPED":
        where = "school" if trip.direction == Direction.PICKUP else stop_name
        notify_student_guardians(
            student=student,
            trip=trip,
            category="DROPPED",
            title=f"{student.first_name} dropped off",
            body=f"{student.first_name} was dropped off at {where}.",
            dedupe_key=f"dropped:{trip.id}:{student.id}",
            data={"event_id": str(event.id)},
        )
    elif event_type == "NO_SHOW":
        notify_student_guardians(
            student=student,
            trip=trip,
            category="NO_SHOW",
            title=f"{student.first_name} did not board",
            body=f"{student.first_name} was not present when the bus left {stop_name}.",
            dedupe_key=f"noshow:{trip.id}:{student.id}",
            data={"event_id": str(event.id)},
        )
    broadcast(
        trip,
        "student",
        {
            "trip_student_id": str(trip_student.id),
            "student_id": str(student.id),
            "status": trip_student.status,
            "occurred_at": event.occurred_at.isoformat(),
        },
    )
    return event


def add_trip_event(*, trip: Trip, event_type: str, description: str, user, data=None, request=None) -> TripEvent:
    event = _event(trip, event_type, description=description, data=data, user=user)
    if event_type == TripEvent.EventType.DELAY:
        minutes = (data or {}).get("minutes")
        Trip.objects.filter(pk=trip.pk).update(delay_minutes=F("delay_minutes") + int(minutes or 0))
        from apps.notifications.services import notify_trip_guardians

        notify_trip_guardians(
            trip,
            category="TRIP_DELAY",
            title="Bus delayed",
            body=f"The driver reported a delay of about {minutes or 'a few'} minutes: {description}",
            dedupe_suffix=f"delay:{event.id}",
        )
    broadcast(trip, "event", {"event_type": event_type, "description": description, "occurred_at": event.occurred_at.isoformat()})
    return event


@transaction.atomic
def report_incident(*, school, user, data: dict, request=None) -> Incident:
    students = data.pop("students", [])
    incident = Incident.objects.create(school=school, reported_by=user, **data)
    if students:
        incident.students.set(students)
    if incident.trip_id:
        _event(
            incident.trip,
            TripEvent.EventType.EMERGENCY if incident.is_emergency else TripEvent.EventType.NOTE,
            description=incident.title,
            user=user,
            data={"incident_id": str(incident.id)},
        )
    record_audit(
        action="incident.reported",
        request=request,
        actor=user,
        target=incident,
        changes={"category": incident.category, "severity": incident.severity},
    )
    from apps.notifications.services import notify_school_staff

    notify_school_staff(
        school=school,
        category="INCIDENT",
        title=("EMERGENCY: " if incident.is_emergency else "Incident: ") + incident.title,
        body=incident.description[:500],
        dedupe_key=f"incident:{incident.id}",
        data={"incident_id": str(incident.id), "severity": incident.severity, "trip_id": str(incident.trip_id) if incident.trip_id else None},
    )
    if incident.is_emergency and incident.trip_id:
        broadcast(incident.trip, "emergency", {"incident_id": str(incident.id), "title": incident.title})
    return incident
