from __future__ import annotations

from django.db import models

from apps.core.models import TimeStampedModel


class DemoSimulation(TimeStampedModel):
    """State of the development-only GPS simulator for one trip. Every point it emits is flagged simulated."""

    trip = models.OneToOneField("trips.Trip", on_delete=models.CASCADE, related_name="simulation")
    is_running = models.BooleanField(default=False)
    progress_m = models.FloatField(default=0.0)
    speed_mps = models.FloatField(default=8.0)
    auto_board = models.BooleanField(default=True)
    auto_complete = models.BooleanField(default=True)
    dwell_seconds = models.PositiveSmallIntegerField(default=20)
    dwell_until = models.DateTimeField(null=True, blank=True)
    last_tick_at = models.DateTimeField(null=True, blank=True)
    started_by = models.ForeignKey("accounts.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")

    def __str__(self) -> str:
        return f"Simulation<{self.trip_id} running={self.is_running}>"
