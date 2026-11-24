from __future__ import annotations

import uuid

from django.conf import settings
from django.db import models

from apps.core.models import TimeStampedModel


class Channel(models.TextChoices):
    IN_APP = "IN_APP", "In-app"
    PUSH = "PUSH", "Web push"
    EMAIL = "EMAIL", "Email"
    SMS = "SMS", "SMS"
    WHATSAPP = "WHATSAPP", "WhatsApp"


class Category(models.TextChoices):
    ARRIVAL_SOON = "ARRIVAL_SOON", "Bus arriving soon"
    ETA_CHANGED = "ETA_CHANGED", "ETA changed"
    BOARDED = "BOARDED", "Student boarded"
    DROPPED = "DROPPED", "Student dropped off"
    NO_SHOW = "NO_SHOW", "Student did not board"
    SCHOOL_ARRIVAL = "SCHOOL_ARRIVAL", "Bus arrived at school"
    TRIP_STARTED = "TRIP_STARTED", "Trip started"
    TRIP_DELAY = "TRIP_DELAY", "Trip delayed"
    TRIP_CANCELLED = "TRIP_CANCELLED", "Trip cancelled"
    ANNOUNCEMENT = "ANNOUNCEMENT", "School announcement"
    FEE_DUE = "FEE_DUE", "Fee due"
    FEE_OVERDUE = "FEE_OVERDUE", "Fee overdue"
    PAYMENT_RECEIVED = "PAYMENT_RECEIVED", "Payment received"
    DOCUMENT_EXPIRY = "DOCUMENT_EXPIRY", "Document expiring"
    INCIDENT = "INCIDENT", "Incident"
    COMPLAINT = "COMPLAINT", "Complaint update"
    REQUEST_UPDATE = "REQUEST_UPDATE", "Request update"
    GPS_STALE = "GPS_STALE", "GPS signal lost"
    SYSTEM = "SYSTEM", "System"


class Notification(TimeStampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    school = models.ForeignKey("schools.School", null=True, blank=True, on_delete=models.CASCADE, related_name="notifications")
    recipient = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notifications")
    category = models.CharField(max_length=24, choices=Category.choices, db_index=True)
    title = models.CharField(max_length=160)
    body = models.TextField()
    data = models.JSONField(default=dict, blank=True)
    dedupe_key = models.CharField(max_length=200, blank=True, null=True)
    trip = models.ForeignKey("trips.Trip", null=True, blank=True, on_delete=models.SET_NULL, related_name="notifications")
    student = models.ForeignKey("people.Student", null=True, blank=True, on_delete=models.SET_NULL, related_name="notifications")
    is_read = models.BooleanField(default=False, db_index=True)
    read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(fields=["recipient", "dedupe_key"], condition=models.Q(dedupe_key__isnull=False), name="uniq_notification_dedupe")
        ]
        indexes = [
            models.Index(fields=["recipient", "is_read", "-created_at"]),
            models.Index(fields=["school", "-created_at"]),
            models.Index(fields=["school", "category", "-created_at"]),
        ]

    def __str__(self) -> str:
        return f"{self.category}: {self.title}"


class NotificationDelivery(models.Model):
    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        SENT = "SENT", "Sent"
        FAILED = "FAILED", "Failed"
        SKIPPED = "SKIPPED", "Skipped"

    id = models.BigAutoField(primary_key=True)
    notification = models.ForeignKey(Notification, on_delete=models.CASCADE, related_name="deliveries")
    channel = models.CharField(max_length=10, choices=Channel.choices)
    status = models.CharField(max_length=8, choices=Status.choices, default=Status.PENDING, db_index=True)
    attempts = models.PositiveSmallIntegerField(default=0)
    last_error = models.TextField(blank=True)
    provider_ref = models.CharField(max_length=120, blank=True)
    sent_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["notification", "channel"], name="uniq_delivery_channel")]
        indexes = [models.Index(fields=["status", "created_at"])]

    def __str__(self) -> str:
        return f"{self.channel} {self.status}"


class PushSubscription(TimeStampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="push_subscriptions")
    endpoint = models.URLField(max_length=600, unique=True)
    p256dh = models.CharField(max_length=200)
    auth = models.CharField(max_length=100)
    user_agent = models.CharField(max_length=255, blank=True)
    is_active = models.BooleanField(default=True)
    failure_count = models.PositiveSmallIntegerField(default=0)
    last_used_at = models.DateTimeField(null=True, blank=True)


class NotificationPreference(TimeStampedModel):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notification_preference")
    push_enabled = models.BooleanField(default=True)
    email_enabled = models.BooleanField(default=True)
    sms_enabled = models.BooleanField(default=False)
    muted_categories = models.JSONField(default=list, blank=True)
    quiet_hours_start = models.TimeField(null=True, blank=True)
    quiet_hours_end = models.TimeField(null=True, blank=True)

    def allows(self, channel: str, category: str) -> bool:
        if category in (self.muted_categories or []) and category not in ("INCIDENT", "TRIP_CANCELLED"):
            return False
        return {
            Channel.IN_APP: True,
            Channel.PUSH: self.push_enabled,
            Channel.EMAIL: self.email_enabled,
            Channel.SMS: self.sms_enabled,
            Channel.WHATSAPP: self.sms_enabled,
        }.get(channel, False)
