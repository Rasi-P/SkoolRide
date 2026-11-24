"""ETA estimation for an in-progress trip.

Algorithm
---------
1. Build the trip's polyline (route path or straight lines between ordered stops).
2. Project the vehicle's latest position onto the polyline -> distance travelled along the path.
3. Project every pending stop onto the polyline -> distance of that stop along the path.
4. Remaining distance = stop_along - vehicle_along (+ dwell time at intermediate stops).
5. Speed = recent average GPS speed (if moving), otherwise the school/platform default.

This deliberately avoids external routing APIs so it works offline and in demos; swap
`estimate` for a routing provider (OSRM, Google, Mapbox) for production-grade ETAs.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta

from django.conf import settings
from django.utils import timezone

from apps.core.geo import eta_seconds, haversine_m, project_onto_path

ARRIVAL_RADIUS_M = 60.0


@dataclass
class StopEta:
    trip_stop_id: str
    sequence: int
    distance_m: float | None
    seconds: float | None
    eta_at: object | None
    passed: bool


def _recent_speed(trip) -> float | None:
    from .models import GPSLocation

    cutoff = timezone.now() - timedelta(minutes=3)
    speeds = [
        p.speed_mps for p in GPSLocation.objects.filter(trip=trip, recorded_at__gte=cutoff).order_by("-recorded_at")[:6] if p.speed_mps is not None
    ]
    if not speeds:
        return None
    return sum(speeds) / len(speeds)


def estimate(trip, lat: float, lon: float, *, speed_mps: float | None = None, now=None) -> list[StopEta]:
    now = now or timezone.now()
    path = trip.route.polyline(trip.direction)
    stops = list(trip.stops.select_related("route_stop").order_by("sequence"))
    if len(path) < 2 or not stops:
        return []
    vehicle_proj = project_onto_path(path, lat, lon)
    if vehicle_proj is None:
        return []
    if speed_mps is None:
        speed_mps = _recent_speed(trip)
    default_kmh = settings.ETA_DEFAULT_SPEED_KMH
    results: list[StopEta] = []
    dwell_s = 0.0
    for ts in stops:
        if ts.status in ("ARRIVED", "DEPARTED", "SKIPPED"):
            results.append(StopEta(str(ts.id), ts.sequence, 0.0, 0.0, ts.arrived_at or now, True))
            continue
        s_lat, s_lon = float(ts.route_stop.latitude), float(ts.route_stop.longitude)
        stop_proj = project_onto_path(path, s_lat, s_lon)
        direct = haversine_m(lat, lon, s_lat, s_lon)
        if direct <= ARRIVAL_RADIUS_M:
            results.append(StopEta(str(ts.id), ts.sequence, direct, 0.0, now, False))
            continue
        remaining = (stop_proj.distance_along_m - vehicle_proj.distance_along_m) if stop_proj else None
        if remaining is None or remaining < -ARRIVAL_RADIUS_M:
            # Stop is behind the vehicle on the path but was never marked: treat as passed for ETA purposes.
            results.append(StopEta(str(ts.id), ts.sequence, None, None, None, True))
            continue
        remaining = max(remaining, direct * 0.8)  # never below the straight-line distance (minus tolerance)
        secs = eta_seconds(remaining, speed_mps, default_kmh) + dwell_s
        results.append(StopEta(str(ts.id), ts.sequence, remaining, secs, now + timedelta(seconds=secs), False))
        dwell_s += (ts.route_stop.wait_minutes or 0) * 60
    return results
