from __future__ import annotations

from django.db import models
from django.utils import timezone

from apps.core.models import TenantModel


class Direction(models.TextChoices):
    PICKUP = "PICKUP", "Morning pickup"
    DROPOFF = "DROPOFF", "Afternoon drop-off"


class Route(TenantModel):
    name = models.CharField(max_length=120)
    code = models.CharField(max_length=16)
    description = models.TextField(blank=True)
    colour = models.CharField(max_length=7, default="#1d4ed8")
    vehicle = models.ForeignKey("fleet.Vehicle", null=True, blank=True, on_delete=models.SET_NULL, related_name="routes")
    driver = models.ForeignKey("people.StaffProfile", null=True, blank=True, on_delete=models.SET_NULL, related_name="driver_routes")
    attendant = models.ForeignKey("people.StaffProfile", null=True, blank=True, on_delete=models.SET_NULL, related_name="attendant_routes")
    is_active = models.BooleanField(default=True, db_index=True)
    distance_km = models.DecimalField(max_digits=7, decimal_places=2, default=0)
    estimated_duration_minutes = models.PositiveSmallIntegerField(default=0)
    path = models.JSONField(default=list, blank=True, help_text="Optional detailed polyline [[lat, lng], ...]")
    version = models.PositiveIntegerField(default=1)

    class Meta:
        ordering = ["code", "name"]
        constraints = [models.UniqueConstraint(fields=["school", "code"], name="uniq_route_code")]
        indexes = [models.Index(fields=["school", "is_active"])]

    def __str__(self) -> str:
        return f"{self.code} {self.name}"

    def ordered_stops(self, direction: str = Direction.PICKUP):
        stops = list(self.stops.order_by("sequence"))
        return stops if direction == Direction.PICKUP else list(reversed(stops))

    def polyline(self, direction: str = Direction.PICKUP) -> list[tuple[float, float]]:
        """Points used for ETA computation: detailed path if present, else straight lines between stops."""
        if self.path:
            pts = [(float(p[0]), float(p[1])) for p in self.path]
            return pts if direction == Direction.PICKUP else list(reversed(pts))
        return [(float(s.latitude), float(s.longitude)) for s in self.ordered_stops(direction)]

    @property
    def active_student_count(self) -> int:
        return self.student_assignments.filter(is_active=True).count()


class RouteStop(TenantModel):
    route = models.ForeignKey(Route, on_delete=models.CASCADE, related_name="stops")
    name = models.CharField(max_length=120)
    sequence = models.PositiveSmallIntegerField()
    latitude = models.DecimalField(max_digits=9, decimal_places=6)
    longitude = models.DecimalField(max_digits=9, decimal_places=6)
    address = models.CharField(max_length=255, blank=True)
    landmark = models.CharField(max_length=120, blank=True)
    planned_pickup_time = models.TimeField(null=True, blank=True)
    planned_dropoff_time = models.TimeField(null=True, blank=True)
    is_school_stop = models.BooleanField(default=False)
    wait_minutes = models.PositiveSmallIntegerField(default=1)

    class Meta:
        ordering = ["route", "sequence"]
        constraints = [models.UniqueConstraint(fields=["route", "sequence"], name="uniq_route_stop_sequence")]
        indexes = [models.Index(fields=["school", "route"])]

    def __str__(self) -> str:
        return f"{self.sequence}. {self.name}"


class RouteSchedule(TenantModel):
    """When a route runs: direction + weekdays + start time. Trips are generated from schedules."""

    route = models.ForeignKey(Route, on_delete=models.CASCADE, related_name="schedules")
    direction = models.CharField(max_length=8, choices=Direction.choices)
    label = models.CharField(max_length=80, blank=True)
    weekdays = models.JSONField(default=list, help_text="0=Mon .. 6=Sun")
    start_time = models.TimeField()
    is_active = models.BooleanField(default=True)
    effective_from = models.DateField(null=True, blank=True)
    effective_to = models.DateField(null=True, blank=True)

    class Meta:
        ordering = ["route", "direction", "start_time"]
        indexes = [models.Index(fields=["school", "is_active"])]

    def __str__(self) -> str:
        return f"{self.route.code} {self.direction} {self.start_time}"

    def runs_on(self, date) -> bool:
        if not self.is_active or date.weekday() not in self.weekdays:
            return False
        if self.effective_from and date < self.effective_from:
            return False
        if self.effective_to and date > self.effective_to:
            return False
        return True


class StudentTransportAssignment(TenantModel):
    student = models.ForeignKey("people.Student", on_delete=models.CASCADE, related_name="transport_assignments")
    route = models.ForeignKey(Route, on_delete=models.PROTECT, related_name="student_assignments")
    pickup_stop = models.ForeignKey(RouteStop, null=True, blank=True, on_delete=models.SET_NULL, related_name="pickup_assignments")
    dropoff_stop = models.ForeignKey(RouteStop, null=True, blank=True, on_delete=models.SET_NULL, related_name="dropoff_assignments")
    uses_pickup = models.BooleanField(default=True)
    uses_dropoff = models.BooleanField(default=True)
    start_date = models.DateField(default=timezone.localdate)
    end_date = models.DateField(null=True, blank=True)
    is_active = models.BooleanField(default=True, db_index=True)
    ended_reason = models.CharField(max_length=255, blank=True)
    notes = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ["-start_date"]
        constraints = [models.UniqueConstraint(fields=["student"], condition=models.Q(is_active=True), name="uniq_active_student_assignment")]
        indexes = [
            models.Index(fields=["school", "route", "is_active"]),
            models.Index(fields=["school", "student", "is_active"]),
        ]

    def __str__(self) -> str:
        return f"{self.student} on {self.route}"
