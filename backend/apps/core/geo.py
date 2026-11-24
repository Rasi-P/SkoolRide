"""Pure geo helpers: distances, polyline projection, and ETA estimation.

These are deliberately dependency-free so they can be unit-tested and used by Celery tasks.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

EARTH_RADIUS_M = 6_371_000.0


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return 2 * EARTH_RADIUS_M * math.asin(math.sqrt(a))


def bearing_deg(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dlambda = math.radians(lon2 - lon1)
    x = math.sin(dlambda) * math.cos(phi2)
    y = math.cos(phi1) * math.sin(phi2) - math.sin(phi1) * math.cos(phi2) * math.cos(dlambda)
    return (math.degrees(math.atan2(x, y)) + 360) % 360


def interpolate(lat1: float, lon1: float, lat2: float, lon2: float, t: float) -> tuple[float, float]:
    return (lat1 + (lat2 - lat1) * t, lon1 + (lon2 - lon1) * t)


@dataclass
class Projection:
    segment_index: int  # index of the segment start point
    fraction: float  # 0..1 along that segment
    distance_from_path_m: float
    distance_along_m: float  # distance from path start to projected point


def project_onto_path(path: list[tuple[float, float]], lat: float, lon: float) -> Projection | None:
    """Project a point onto a polyline (list of (lat, lon)) using a local planar approximation."""
    if len(path) < 2:
        return None
    best: Projection | None = None
    cumulative = 0.0
    for i in range(len(path) - 1):
        (alat, alon), (blat, blon) = path[i], path[i + 1]
        # local planar coords in metres
        kx = math.cos(math.radians((alat + blat) / 2)) * 111_320.0
        ky = 110_540.0
        ax, ay = 0.0, 0.0
        bx, by = (blon - alon) * kx, (blat - alat) * ky
        px, py = (lon - alon) * kx, (lat - alat) * ky
        seg_len_sq = (bx - ax) ** 2 + (by - ay) ** 2
        if seg_len_sq == 0:
            t = 0.0
        else:
            t = max(0.0, min(1.0, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / seg_len_sq))
        qx, qy = ax + t * (bx - ax), ay + t * (by - ay)
        dist = math.hypot(px - qx, py - qy)
        seg_len = haversine_m(alat, alon, blat, blon)
        if best is None or dist < best.distance_from_path_m:
            best = Projection(i, t, dist, cumulative + seg_len * t)
        cumulative += seg_len
    return best


def path_length_m(path: list[tuple[float, float]]) -> float:
    return sum(haversine_m(*path[i], *path[i + 1]) for i in range(len(path) - 1))


def remaining_distance_to_index_m(path: list[tuple[float, float]], projection: Projection, target_index: int) -> float | None:
    """Distance along the path from the projected position to path[target_index].

    Returns None if the target is clearly behind the vehicle (allowing ~25 m of GPS jitter).
    """
    cumulative_to_target = sum(haversine_m(*path[i], *path[i + 1]) for i in range(target_index))
    remaining = cumulative_to_target - projection.distance_along_m
    if remaining < -25:
        return None
    return max(0.0, remaining)


def eta_seconds(distance_m: float, speed_mps: float | None, default_speed_kmh: float) -> float:
    speed = speed_mps if speed_mps and speed_mps > 1.5 else default_speed_kmh / 3.6
    return distance_m / speed
