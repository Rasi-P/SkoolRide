from __future__ import annotations

from django.conf import settings
from django.db import models
from django.utils import timezone

from apps.core.models import TenantModel
from apps.routing.models import Direction


class Trip(TenantModel):
    class Status(models.TextChoices):
        SCHEDULED = "SCHEDULED", "Scheduled"
        IN_PROGRESS = "IN_PROGRESS", "In progress"
        PAUSED = "PAUSED", "Paused"
        COMPLETED = "COMPLETED", "Completed"
        CANCELLED = "CANCELLED", "Cancelled"

    ACTIVE_STATUSES = ("IN_PROGRESS", "PAUSED")

    route = models.ForeignKey("routing.Route", on_delete=models.PROTECT, related_name="trips")
    schedule = models.ForeignKey("routing.RouteSchedule", null=True, blank=True, on_delete=models.SET_NULL, related_name="trips")
    direction = models.CharField(max_length=8, choices=Direction.choices)
    scheduled_date = models.DateField(db_index=True)
    scheduled_start_time = models.TimeField()
    vehicle = models.ForeignKey("fleet.Vehicle", null=True, blank=True, on_delete=models.SET_NULL, related_name="trips")
    driver = models.ForeignKey("people.StaffProfile", null=True, blank=True, on_delete=models.SET_NULL, related_name="driven_trips")
    attendant = models.ForeignKey("people.StaffProfile", null=True, blank=True, on_delete=models.SET_NULL, related_name="attended_trips")
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.SCHEDULED, db_index=True)
    started_at = models.DateTimeField(null=True, blank=True)
    paused_at = models.DateTimeField(null=True, blank=True)
    ended_at = models.DateTimeField(null=True, blank=True)
    cancelled_reason = models.CharField(max_length=255, blank=True)
    replacement_of = models.ForeignKey("self", null=True, blank=True, on_delete=models.SET_NULL, related_name="replacements")
    route_version = models.PositiveIntegerField(default=1)
    expected_students = models.PositiveSmallIntegerField(default=0)
    boarded_count = models.PositiveSmallIntegerField(default=0)
    dropped_count = models.PositiveSmallIntegerField(default=0)
    absent_count = models.PositiveSmallIntegerField(default=0)
    delay_minutes = models.IntegerField(default=0)
    last_location_at = models.DateTimeField(null=True, blank=True)
    is_simulated = models.BooleanField(default=False, help_text="Location feed comes from the demo simulator")
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["-scheduled_date", "-scheduled_start_time"]
        indexes = [
            models.Index(fields=["school", "scheduled_date", "status"]),
            models.Index(fields=["school", "status"]),
            models.Index(fields=["route", "scheduled_date"]),
            models.Index(fields=["driver", "scheduled_date"]),
            models.Index(fields=["vehicle", "status"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["schedule", "scheduled_date"],
                condition=models.Q(schedule__isnull=False, replacement_of__isnull=True),
                name="uniq_trip_per_schedule_day",
            )
        ]

    def __str__(self) -> str:
        return f"{self.route.code} {self.direction} {self.scheduled_date}"

    @property
    def is_active(self) -> bool:
        return self.status in self.ACTIVE_STATUSES

    @property
    def scheduled_start_at(self):
        import zoneinfo
        from datetime import datetime

        tz = zoneinfo.ZoneInfo(self.school.timezone)
        return datetime.combine(self.scheduled_date, self.scheduled_start_time, tzinfo=tz)

    def gps_is_stale(self, stale_seconds: int | None = None) -> bool:
        if not self.last_location_at:
            return True
        limit = stale_seconds or self.school.gps_stale_seconds or settings.GPS_STALE_SECONDS
        return (timezone.now() - self.last_location_at).total_seconds() > limit


class TripStop(TenantModel):
    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        ARRIVED = "ARRIVED", "Arrived"
        DEPARTED = "DEPARTED", "Departed"
        SKIPPED = "SKIPPED", "Skipped"

    trip = models.ForeignKey(Trip, on_delete=models.CASCADE, related_name="stops")
    route_stop = models.ForeignKey("routing.RouteStop", on_delete=models.PROTECT, related_name="trip_stops")
    sequence = models.PositiveSmallIntegerField()
    planned_time = models.TimeField(null=True, blank=True)
    eta = models.DateTimeField(null=True, blank=True)
    distance_remaining_m = models.FloatField(null=True, blank=True)
    arrived_at = models.DateTimeField(null=True, blank=True)
    departed_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)

    class Meta:
        ordering = ["trip", "sequence"]
        constraints = [models.UniqueConstraint(fields=["trip", "sequence"], name="uniq_trip_stop_sequence")]
        indexes = [models.Index(fields=["trip", "status"])]

    def __str__(self) -> str:
        return f"{self.trip} #{self.sequence} {self.route_stop.name}"


class TripStudent(TenantModel):
    class Status(models.TextChoices):
        EXPECTED = "EXPECTED", "Expected"
        BOARDED = "BOARDED", "Boarded"
        DROPPED = "DROPPED", "Dropped off"
        ABSENT = "ABSENT", "Absent"
        NO_SHOW = "NO_SHOW", "No show"

    trip = models.ForeignKey(Trip, on_delete=models.CASCADE, related_name="trip_students")
    student = models.ForeignKey("people.Student", on_delete=models.CASCADE, related_name="trip_students")
    assignment = models.ForeignKey("routing.StudentTransportAssignment", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    trip_stop = models.ForeignKey(TripStop, null=True, blank=True, on_delete=models.SET_NULL, related_name="trip_students")
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.EXPECTED, db_index=True)
    boarded_at = models.DateTimeField(null=True, blank=True)
    dropped_at = models.DateTimeField(null=True, blank=True)
    absence_reason = models.CharField(max_length=255, blank=True)
    marked_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    last_notified_eta = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["trip", "student"], name="uniq_trip_student")]
        indexes = [models.Index(fields=["school", "student"]), models.Index(fields=["trip", "trip_stop"])]

    def __str__(self) -> str:
        return f"{self.student} on {self.trip} ({self.status})"


class GPSLocation(models.Model):
    """Append-only GPS history. Current positions live on VehicleLocation for cheap reads."""

    class Source(models.TextChoices):
        DRIVER_PWA = "DRIVER_PWA", "Driver PWA"
        SIMULATOR = "SIMULATOR", "Demo simulator"
        DEVICE = "DEVICE", "GPS device"

    id = models.BigAutoField(primary_key=True)
    school = models.ForeignKey("schools.School", on_delete=models.CASCADE, related_name="gps_locations")
    trip = models.ForeignKey(Trip, on_delete=models.CASCADE, related_name="locations")
    vehicle = models.ForeignKey("fleet.Vehicle", null=True, blank=True, on_delete=models.SET_NULL, related_name="locations")
    latitude = models.FloatField()
    longitude = models.FloatField()
    accuracy_m = models.FloatField(null=True, blank=True)
    speed_mps = models.FloatField(null=True, blank=True)
    heading = models.FloatField(null=True, blank=True)
    recorded_at = models.DateTimeField(db_index=True)  # device timestamp (validated)
    received_at = models.DateTimeField(auto_now_add=True)
    source = models.CharField(max_length=12, choices=Source.choices, default=Source.DRIVER_PWA)
    is_simulated = models.BooleanField(default=False)

    class Meta:
        ordering = ["-recorded_at"]
        indexes = [
            models.Index(fields=["trip", "-recorded_at"]),
            models.Index(fields=["school", "-recorded_at"]),
        ]

    def __str__(self) -> str:
        return f"{self.trip_id} @ {self.recorded_at:%H:%M:%S}"


class VehicleLocation(models.Model):
    """Latest known position per vehicle (one row per vehicle)."""

    vehicle = models.OneToOneField("fleet.Vehicle", on_delete=models.CASCADE, primary_key=True, related_name="current_location")
    school = models.ForeignKey("schools.School", on_delete=models.CASCADE, related_name="vehicle_locations")
    trip = models.ForeignKey(Trip, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    latitude = models.FloatField()
    longitude = models.FloatField()
    accuracy_m = models.FloatField(null=True, blank=True)
    speed_mps = models.FloatField(null=True, blank=True)
    heading = models.FloatField(null=True, blank=True)
    recorded_at = models.DateTimeField()
    is_simulated = models.BooleanField(default=False)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f"{self.vehicle_id} @ {self.recorded_at:%H:%M:%S}"


class BoardingEvent(TenantModel):
    """Immutable record that a student was marked boarded/dropped/absent at a given time and place.

    It records an operational event, not proof of the student's physical location.
    """

    class EventType(models.TextChoices):
        BOARDED = "BOARDED", "Boarded"
        DROPPED = "DROPPED", "Dropped off"
        ABSENT = "ABSENT", "Marked absent"
        NO_SHOW = "NO_SHOW", "No show"

    trip = models.ForeignKey(Trip, on_delete=models.CASCADE, related_name="boarding_events")
    trip_student = models.ForeignKey(TripStudent, on_delete=models.CASCADE, related_name="events")
    student = models.ForeignKey("people.Student", on_delete=models.CASCADE, related_name="boarding_events")
    trip_stop = models.ForeignKey(TripStop, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    event_type = models.CharField(max_length=10, choices=EventType.choices, db_index=True)
    occurred_at = models.DateTimeField(default=timezone.now, db_index=True)
    recorded_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    latitude = models.FloatField(null=True, blank=True)
    longitude = models.FloatField(null=True, blank=True)
    note = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ["-occurred_at"]
        indexes = [models.Index(fields=["school", "student", "-occurred_at"]), models.Index(fields=["trip", "event_type"])]


class TripEvent(TenantModel):
    class EventType(models.TextChoices):
        STARTED = "STARTED", "Started"
        PAUSED = "PAUSED", "Paused"
        RESUMED = "RESUMED", "Resumed"
        COMPLETED = "COMPLETED", "Completed"
        CANCELLED = "CANCELLED", "Cancelled"
        STOP_ARRIVED = "STOP_ARRIVED", "Arrived at stop"
        STOP_DEPARTED = "STOP_DEPARTED", "Departed stop"
        DELAY = "DELAY", "Delay reported"
        BREAKDOWN = "BREAKDOWN", "Breakdown"
        EMERGENCY = "EMERGENCY", "Emergency"
        REPLACEMENT = "REPLACEMENT", "Replacement vehicle"
        GPS_STALE = "GPS_STALE", "GPS signal lost"
        NOTE = "NOTE", "Note"

    trip = models.ForeignKey(Trip, on_delete=models.CASCADE, related_name="events")
    event_type = models.CharField(max_length=16, choices=EventType.choices, db_index=True)
    description = models.CharField(max_length=500, blank=True)
    data = models.JSONField(default=dict, blank=True)
    occurred_at = models.DateTimeField(default=timezone.now)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")

    class Meta:
        ordering = ["-occurred_at"]


class Incident(TenantModel):
    class Category(models.TextChoices):
        BREAKDOWN = "BREAKDOWN", "Breakdown"
        ACCIDENT = "ACCIDENT", "Accident"
        MEDICAL = "MEDICAL", "Medical"
        BEHAVIOUR = "BEHAVIOUR", "Student behaviour"
        DELAY = "DELAY", "Delay"
        EMERGENCY = "EMERGENCY", "Emergency"
        SAFETY = "SAFETY", "Safety concern"
        OTHER = "OTHER", "Other"

    class Severity(models.TextChoices):
        LOW = "LOW", "Low"
        MEDIUM = "MEDIUM", "Medium"
        HIGH = "HIGH", "High"
        CRITICAL = "CRITICAL", "Critical"

    class Status(models.TextChoices):
        OPEN = "OPEN", "Open"
        INVESTIGATING = "INVESTIGATING", "Investigating"
        RESOLVED = "RESOLVED", "Resolved"
        CLOSED = "CLOSED", "Closed"

    trip = models.ForeignKey(Trip, null=True, blank=True, on_delete=models.SET_NULL, related_name="incidents")
    vehicle = models.ForeignKey("fleet.Vehicle", null=True, blank=True, on_delete=models.SET_NULL, related_name="incidents")
    reported_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="reported_incidents")
    category = models.CharField(max_length=12, choices=Category.choices, db_index=True)
    severity = models.CharField(max_length=10, choices=Severity.choices, default=Severity.MEDIUM)
    title = models.CharField(max_length=160)
    description = models.TextField()
    occurred_at = models.DateTimeField(default=timezone.now)
    latitude = models.FloatField(null=True, blank=True)
    longitude = models.FloatField(null=True, blank=True)
    status = models.CharField(max_length=14, choices=Status.choices, default=Status.OPEN, db_index=True)
    is_emergency = models.BooleanField(default=False)
    resolution_notes = models.TextField(blank=True)
    resolved_at = models.DateTimeField(null=True, blank=True)
    resolved_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    students = models.ManyToManyField("people.Student", blank=True, related_name="incidents")

    class Meta:
        ordering = ["-occurred_at"]
        indexes = [models.Index(fields=["school", "status", "-occurred_at"])]

    def __str__(self) -> str:
        return f"[{self.severity}] {self.title}"
