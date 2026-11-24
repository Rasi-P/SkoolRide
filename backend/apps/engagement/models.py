from __future__ import annotations

from django.conf import settings
from django.db import models
from django.utils import timezone

from apps.core.models import TenantModel


class AbsenceRequest(TenantModel):
    class Direction(models.TextChoices):
        PICKUP = "PICKUP", "Morning pickup"
        DROPOFF = "DROPOFF", "Afternoon drop-off"
        BOTH = "BOTH", "Both"

    class Status(models.TextChoices):
        SUBMITTED = "SUBMITTED", "Submitted"
        ACKNOWLEDGED = "ACKNOWLEDGED", "Acknowledged"
        CANCELLED = "CANCELLED", "Cancelled"

    student = models.ForeignKey("people.Student", on_delete=models.CASCADE, related_name="absence_requests")
    requested_by = models.ForeignKey("people.ParentProfile", null=True, blank=True, on_delete=models.SET_NULL, related_name="absence_requests")
    date_from = models.DateField(db_index=True)
    date_to = models.DateField()
    direction = models.CharField(max_length=8, choices=Direction.choices, default=Direction.BOTH)
    reason = models.CharField(max_length=255, blank=True)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.SUBMITTED, db_index=True)
    acknowledged_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    acknowledged_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-date_from"]
        indexes = [models.Index(fields=["school", "student", "date_from"])]

    def covers(self, date, direction: str) -> bool:
        return (
            self.status != self.Status.CANCELLED
            and self.date_from <= date <= self.date_to
            and (self.direction == self.Direction.BOTH or self.direction == direction)
        )


class PickupChangeRequest(TenantModel):
    class ChangeType(models.TextChoices):
        STOP_CHANGE = "STOP_CHANGE", "Change pickup/drop-off stop"
        ROUTE_CHANGE = "ROUTE_CHANGE", "Change route"
        TEMPORARY = "TEMPORARY", "Temporary change"
        WITHDRAW = "WITHDRAW", "Withdraw from transport"
        OTHER = "OTHER", "Other"

    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Rejected"
        CANCELLED = "CANCELLED", "Cancelled"

    student = models.ForeignKey("people.Student", on_delete=models.CASCADE, related_name="pickup_change_requests")
    requested_by = models.ForeignKey("people.ParentProfile", null=True, blank=True, on_delete=models.SET_NULL, related_name="pickup_change_requests")
    change_type = models.CharField(max_length=14, choices=ChangeType.choices)
    effective_date = models.DateField()
    end_date = models.DateField(null=True, blank=True)
    requested_route = models.ForeignKey("routing.Route", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    requested_pickup_stop = models.ForeignKey("routing.RouteStop", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    requested_dropoff_stop = models.ForeignKey("routing.RouteStop", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    details = models.TextField()
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING, db_index=True)
    decided_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    decided_at = models.DateTimeField(null=True, blank=True)
    decision_notes = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["school", "status"])]


class Complaint(TenantModel):
    class Category(models.TextChoices):
        DRIVER_BEHAVIOUR = "DRIVER_BEHAVIOUR", "Driver / attendant behaviour"
        DELAY = "DELAY", "Delays"
        SAFETY = "SAFETY", "Safety"
        VEHICLE = "VEHICLE", "Vehicle condition"
        BILLING = "BILLING", "Billing"
        APP = "APP", "App / tracking"
        OTHER = "OTHER", "Other"

    class Priority(models.TextChoices):
        LOW = "LOW", "Low"
        NORMAL = "NORMAL", "Normal"
        HIGH = "HIGH", "High"

    class Status(models.TextChoices):
        OPEN = "OPEN", "Open"
        IN_PROGRESS = "IN_PROGRESS", "In progress"
        RESOLVED = "RESOLVED", "Resolved"
        CLOSED = "CLOSED", "Closed"

    ticket_number = models.CharField(max_length=20, blank=True)
    student = models.ForeignKey("people.Student", null=True, blank=True, on_delete=models.SET_NULL, related_name="complaints")
    raised_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="complaints")
    category = models.CharField(max_length=18, choices=Category.choices, default=Category.OTHER)
    priority = models.CharField(max_length=8, choices=Priority.choices, default=Priority.NORMAL)
    subject = models.CharField(max_length=160)
    description = models.TextField()
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.OPEN, db_index=True)
    assigned_to = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="assigned_complaints")
    resolution_notes = models.TextField(blank=True)
    resolved_at = models.DateTimeField(null=True, blank=True)
    trip = models.ForeignKey("trips.Trip", null=True, blank=True, on_delete=models.SET_NULL, related_name="complaints")

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["school", "status", "-created_at"])]

    def save(self, *args, **kwargs):
        if not self.ticket_number:
            import secrets

            self.ticket_number = "TKT-" + secrets.token_hex(3).upper()
        super().save(*args, **kwargs)


class ComplaintComment(TenantModel):
    complaint = models.ForeignKey(Complaint, on_delete=models.CASCADE, related_name="comments")
    author = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    body = models.TextField()
    is_internal = models.BooleanField(default=False, help_text="Internal notes are hidden from parents")

    class Meta:
        ordering = ["created_at"]


class Announcement(TenantModel):
    class Audience(models.TextChoices):
        ALL = "ALL", "Everyone"
        PARENTS = "PARENTS", "Parents"
        STAFF = "STAFF", "Staff"
        ROUTE = "ROUTE", "Parents on a route"

    title = models.CharField(max_length=160)
    body = models.TextField()
    audience = models.CharField(max_length=8, choices=Audience.choices, default=Audience.PARENTS)
    route = models.ForeignKey("routing.Route", null=True, blank=True, on_delete=models.SET_NULL, related_name="announcements")
    is_pinned = models.BooleanField(default=False)
    publish_at = models.DateTimeField(default=timezone.now)
    expires_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    notification_sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-is_pinned", "-publish_at"]
        indexes = [models.Index(fields=["school", "audience", "-publish_at"])]

    @property
    def is_live(self) -> bool:
        now = timezone.now()
        return self.publish_at <= now and (self.expires_at is None or self.expires_at > now)
