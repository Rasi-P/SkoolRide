from __future__ import annotations

import logging
from datetime import timedelta

from celery import shared_task
from django.utils import timezone

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3, default_retry_delay=5)
def process_location_update(self, trip_id: str, point_id: int):
    from . import services
    from .models import GPSLocation, Trip

    try:
        trip = Trip.objects.get(pk=trip_id)
        point = GPSLocation.objects.get(pk=point_id, trip=trip, school=trip.school)
    except (Trip.DoesNotExist, GPSLocation.DoesNotExist):
        return None
    # Skip if a newer point has already been processed (avoid out-of-order ETA regressions).
    newer = GPSLocation.objects.filter(trip=trip, recorded_at__gt=point.recorded_at).exists()
    if newer:
        return None
    try:
        return services.process_location(trip, point)
    except Exception as exc:  # pragma: no cover
        logger.exception("Location processing failed")
        raise self.retry(exc=exc) from exc


@shared_task
def detect_stale_trips():
    """Broadcast stale GPS state for active trips and notify staff when the signal is lost for long."""
    from apps.notifications.services import notify_school_staff

    from . import services
    from .models import Trip, TripEvent

    now = timezone.now()
    count = 0
    for trip in Trip.objects.filter(status="IN_PROGRESS").select_related("school", "route", "vehicle"):
        stale_after = trip.school.gps_stale_seconds or 120
        reference = trip.last_location_at or trip.started_at
        if reference is None:
            continue
        age = (now - reference).total_seconds()
        if age <= stale_after:
            continue
        services.broadcast(trip, "stale", {"stale": True, "last_location_at": reference.isoformat(), "age_seconds": int(age)})
        count += 1
        if age > 600:
            bucket = int(now.timestamp() // 1800)
            if not TripEvent.objects.filter(trip=trip, event_type="GPS_STALE", occurred_at__gte=now - timedelta(minutes=30)).exists():
                TripEvent.objects.create(
                    school=trip.school, trip=trip, event_type="GPS_STALE", description=f"No GPS update for {int(age // 60)} minutes"
                )
            notify_school_staff(
                school=trip.school,
                category="GPS_STALE",
                title=f"GPS signal lost: {trip.route.code}",
                body=f"No location update from {trip.vehicle.registration_number if trip.vehicle else 'the bus'} for {int(age // 60)} minutes.",
                dedupe_key=f"gpsstale:{trip.id}:{bucket}",
                data={"trip_id": str(trip.id)},
            )
    return count


@shared_task
def generate_scheduled_trips_for_today():
    """Materialise trips from route schedules for today and tomorrow (school local time)."""
    import zoneinfo

    from apps.schools.models import School

    from . import services

    created = 0
    for school in School.objects.filter(status="ACTIVE"):
        tz = zoneinfo.ZoneInfo(school.timezone)
        today = timezone.now().astimezone(tz).date()
        for d in (today, today + timedelta(days=1)):
            created += len(services.generate_trips_for_date(school, d))
    return created
