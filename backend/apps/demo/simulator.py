"""Development-only GPS simulator.

Moves a vehicle along its trip's polyline at a configurable speed, emitting GPS points through the same
`record_location` pipeline the driver PWA uses (so ETAs, ten-minute alerts and websockets all exercise real code).
Every emitted point is flagged `is_simulated=True` and the trip is marked `is_simulated`.
"""

from __future__ import annotations

import logging
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from apps.core.exceptions import DomainError
from apps.core.geo import bearing_deg, haversine_m, interpolate
from apps.trips import services as trip_services
from apps.trips.models import GPSLocation, Trip, TripStop, TripStudent

from .models import DemoSimulation

logger = logging.getLogger(__name__)


def _ensure_demo_mode():
    if not settings.DEMO_MODE:
        raise DomainError("The GPS simulator is only available when DEMO_MODE is enabled.")


def position_along(path: list[tuple[float, float]], distance_m: float) -> tuple[float, float, float, bool]:
    """Return (lat, lon, heading, finished) for a distance along the polyline."""
    remaining = distance_m
    for i in range(len(path) - 1):
        (alat, alon), (blat, blon) = path[i], path[i + 1]
        seg = haversine_m(alat, alon, blat, blon)
        if remaining <= seg or i == len(path) - 2 and remaining <= seg + 1e-6:
            t = 0 if seg == 0 else max(0.0, min(1.0, remaining / seg))
            lat, lon = interpolate(alat, alon, blat, blon, t)
            return lat, lon, bearing_deg(alat, alon, blat, blon), False
        remaining -= seg
    lat, lon = path[-1]
    return lat, lon, bearing_deg(*path[-2], *path[-1]), True


@transaction.atomic
def start_simulation(
    *, trip: Trip, user=None, speed_mps: float = 8.0, auto_board=True, auto_complete=True, start_offset_m: float = 0.0
) -> DemoSimulation:
    _ensure_demo_mode()
    if trip.status == Trip.Status.SCHEDULED:
        trip_services.start_trip(trip=trip, user=user)
        trip.refresh_from_db()
    if trip.status != Trip.Status.IN_PROGRESS:
        raise DomainError("Trip must be scheduled or in progress to simulate.")
    trip.is_simulated = True
    trip.save(update_fields=["is_simulated"])
    sim, _ = DemoSimulation.objects.update_or_create(
        trip=trip,
        defaults={
            "is_running": True,
            "speed_mps": max(1.0, min(30.0, speed_mps)),
            "auto_board": auto_board,
            "auto_complete": auto_complete,
            "started_by": user,
            "last_tick_at": timezone.now(),
            "dwell_until": None,
            "progress_m": start_offset_m,
        },
    )
    tick(sim)
    return sim


def stop_simulation(*, trip: Trip) -> DemoSimulation | None:
    sim = DemoSimulation.objects.filter(trip=trip).first()
    if sim:
        sim.is_running = False
        sim.save(update_fields=["is_running"])
    return sim


def _auto_board_at(trip: Trip, trip_stop: TripStop, user) -> None:
    for ts in trip.trip_students.filter(trip_stop=trip_stop):
        try:
            if trip.direction == "PICKUP" and ts.status == TripStudent.Status.EXPECTED:
                trip_services.mark_student(trip=trip, trip_student=ts, event_type="BOARDED", user=user, note="Simulated boarding")
            elif trip.direction == "DROPOFF" and ts.status == TripStudent.Status.BOARDED:
                trip_services.mark_student(trip=trip, trip_student=ts, event_type="DROPPED", user=user, note="Simulated drop-off")
        except Exception:  # noqa: BLE001
            logger.exception("Simulated boarding failed")


def tick(sim: DemoSimulation) -> dict | None:
    """Advance the simulation by the elapsed time since the last tick."""
    if not sim.is_running:
        return None
    trip = Trip.objects.select_related("route", "school", "vehicle").get(pk=sim.trip_id)
    if trip.status != Trip.Status.IN_PROGRESS:
        sim.is_running = False
        sim.save(update_fields=["is_running"])
        return None
    now = timezone.now()
    path = trip.route.polyline(trip.direction)
    if len(path) < 2:
        return None
    if sim.dwell_until and now < sim.dwell_until:
        sim.last_tick_at = now
        sim.save(update_fields=["last_tick_at"])
        return {"dwelling": True}
    elapsed = (now - sim.last_tick_at).total_seconds() if sim.last_tick_at else 5.0
    elapsed = max(0.0, min(elapsed, 60.0))
    sim.progress_m += sim.speed_mps * elapsed
    lat, lon, heading, finished = position_along(path, sim.progress_m)
    sim.last_tick_at = now
    sim.dwell_until = None
    try:
        trip_services.record_location(
            trip=trip,
            data={
                "latitude": lat,
                "longitude": lon,
                "accuracy_m": 8.0,
                "speed_mps": 0.0 if finished else sim.speed_mps,
                "heading": heading,
                "recorded_at": now,
            },
            source=GPSLocation.Source.SIMULATOR,
            is_simulated=True,
        )
    except DomainError as exc:
        logger.info("Simulator point rejected: %s", exc)
    # Dwell + auto-board at a stop when within arrival radius.
    next_pending = trip.stops.filter(status=TripStop.Status.PENDING).select_related("route_stop").order_by("sequence").first()
    if next_pending is not None:
        d = haversine_m(lat, lon, float(next_pending.route_stop.latitude), float(next_pending.route_stop.longitude))
        if d <= 45:
            trip_services.mark_stop_arrived(trip=trip, trip_stop=next_pending, user=sim.started_by, auto=True)
            if sim.auto_board:
                _auto_board_at(trip, next_pending, sim.started_by)
            trip_services.mark_stop_departed(trip=trip, trip_stop=next_pending, user=sim.started_by)
            sim.dwell_until = now + timedelta(seconds=sim.dwell_seconds)
    if finished:
        last = trip.stops.order_by("-sequence").first()
        if last and last.status == TripStop.Status.PENDING:
            trip_services.mark_stop_arrived(trip=trip, trip_stop=last, user=sim.started_by, auto=True)
        if sim.auto_complete:
            trip_services.end_trip(trip=trip, user=sim.started_by)
        sim.is_running = False
    sim.save()
    return {"latitude": lat, "longitude": lon, "progress_m": sim.progress_m, "finished": finished}
