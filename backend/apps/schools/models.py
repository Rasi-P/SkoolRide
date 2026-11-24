from __future__ import annotations

import secrets
import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone
from django.utils.text import slugify

from apps.core.models import TimeStampedModel, UUIDModel
from apps.core.roles import Role


class SubscriptionPlan(UUIDModel):
    code = models.SlugField(max_length=40, unique=True)
    name = models.CharField(max_length=80)
    description = models.TextField(blank=True)
    price_monthly = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    currency = models.CharField(max_length=3, default="INR")
    max_vehicles = models.PositiveIntegerField(default=10)
    max_students = models.PositiveIntegerField(default=500)
    max_staff = models.PositiveIntegerField(default=50)
    max_routes = models.PositiveIntegerField(default=20)
    features = models.JSONField(default=list, blank=True)
    is_active = models.BooleanField(default=True)
    sort_order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["sort_order", "price_monthly"]

    def __str__(self) -> str:
        return self.name


class School(UUIDModel):
    class Status(models.TextChoices):
        APPROVED = "APPROVED", "Approved (awaiting admin)"
        ACTIVE = "ACTIVE", "Active"
        SUSPENDED = "SUSPENDED", "Suspended"
        INACTIVE = "INACTIVE", "Inactive"

    name = models.CharField(max_length=160)
    slug = models.SlugField(max_length=80, unique=True)
    code = models.CharField(max_length=16, unique=True, help_text="Short code used in identifiers")
    logo = models.ImageField(upload_to="school_logos/", blank=True, null=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.APPROVED, db_index=True)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=32, blank=True)
    website = models.URLField(blank=True)
    address_line1 = models.CharField(max_length=160, blank=True)
    address_line2 = models.CharField(max_length=160, blank=True)
    city = models.CharField(max_length=80, blank=True)
    state = models.CharField(max_length=80, blank=True)
    country = models.CharField(max_length=80, default="India")
    postal_code = models.CharField(max_length=16, blank=True)
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    timezone = models.CharField(max_length=64, default=settings.DEFAULT_SCHOOL_TIMEZONE)
    currency = models.CharField(max_length=3, default=settings.DEFAULT_CURRENCY)

    # Operating period
    academic_year_label = models.CharField(max_length=32, blank=True)
    academic_year_start = models.DateField(null=True, blank=True)
    academic_year_end = models.DateField(null=True, blank=True)
    operating_weekdays = models.JSONField(default=list, blank=True, help_text="0=Mon .. 6=Sun")

    # Pickup / drop-off operational rules
    morning_pickup_window_start = models.TimeField(null=True, blank=True)
    afternoon_dropoff_window_start = models.TimeField(null=True, blank=True)
    pickup_change_cutoff_hours = models.PositiveSmallIntegerField(default=12)
    absence_report_cutoff_minutes = models.PositiveSmallIntegerField(default=60)
    boarding_grace_minutes = models.PositiveSmallIntegerField(default=3)

    # Notification preferences / thresholds (overrides platform defaults)
    arrival_alert_minutes = models.PositiveSmallIntegerField(default=10)
    delay_alert_minutes = models.PositiveSmallIntegerField(default=10)
    gps_stale_seconds = models.PositiveIntegerField(default=120)
    notification_channels = models.JSONField(default=dict, blank=True, help_text='{"in_app": true, "push": true, "email": true, "sms": false}')

    # Transport fee configuration
    fee_billing_cycle = models.CharField(
        max_length=12,
        choices=[("MONTHLY", "Monthly"), ("TERM", "Term"), ("ANNUAL", "Annual")],
        default="MONTHLY",
    )
    fee_due_day = models.PositiveSmallIntegerField(default=10)
    fee_late_fee_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    accepted_payment_methods = models.JSONField(default=list, blank=True)

    # Parent-facing contact
    transport_office_phone = models.CharField(max_length=32, blank=True)
    transport_office_email = models.EmailField(blank=True)
    emergency_contact_phone = models.CharField(max_length=32, blank=True)
    parent_help_text = models.TextField(blank=True)
    show_driver_phone_to_parents = models.BooleanField(default=False)

    # Lifecycle
    approved_at = models.DateTimeField(null=True, blank=True)
    activated_at = models.DateTimeField(null=True, blank=True)
    suspended_at = models.DateTimeField(null=True, blank=True)
    suspension_reason = models.TextField(blank=True)
    onboarding_dismissed = models.BooleanField(default=False)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name

    def save(self, *args, **kwargs):
        if not self.slug:
            base = slugify(self.name)[:70] or "school"
            slug = base
            i = 2
            while School.objects.filter(slug=slug).exclude(pk=self.pk).exists():
                slug = f"{base}-{i}"
                i += 1
            self.slug = slug
        if not self.code:
            self.code = secrets.token_hex(3).upper()
        if not self.operating_weekdays:
            self.operating_weekdays = [0, 1, 2, 3, 4]
        if not self.notification_channels:
            self.notification_channels = {"in_app": True, "push": True, "email": True, "sms": False}
        if not self.accepted_payment_methods:
            self.accepted_payment_methods = ["CASH", "BANK_TRANSFER", "UPI", "ONLINE"]
        super().save(*args, **kwargs)

    @property
    def is_operational(self) -> bool:
        if self.status != self.Status.ACTIVE:
            return False
        sub = getattr(self, "subscription", None)
        if sub is not None and not sub.is_usable:
            return False
        return True

    @property
    def onboarding_completed(self) -> bool:
        from .services import onboarding_progress

        return onboarding_progress(self)["completed"]

    @property
    def full_address(self) -> str:
        parts = [self.address_line1, self.address_line2, self.city, self.state, self.postal_code]
        return ", ".join(p for p in parts if p)


class SchoolSubscription(UUIDModel):
    class Status(models.TextChoices):
        TRIAL = "TRIAL", "Trial"
        ACTIVE = "ACTIVE", "Active"
        PAST_DUE = "PAST_DUE", "Past due"
        SUSPENDED = "SUSPENDED", "Suspended"
        CANCELLED = "CANCELLED", "Cancelled"

    school = models.OneToOneField(School, on_delete=models.CASCADE, related_name="subscription")
    plan = models.ForeignKey(SubscriptionPlan, on_delete=models.PROTECT, related_name="subscriptions")
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.TRIAL)
    starts_at = models.DateField(default=timezone.localdate)
    ends_at = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True)

    def __str__(self) -> str:
        return f"{self.school} / {self.plan} ({self.status})"

    @property
    def is_usable(self) -> bool:
        if self.status in (self.Status.SUSPENDED, self.Status.CANCELLED):
            return False
        if self.ends_at and self.ends_at < timezone.localdate():
            return False
        return True


class SchoolMembership(UUIDModel):
    """Tenant-scoped role assignment. A user may hold multiple memberships (different schools or roles)."""

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="memberships")
    school = models.ForeignKey(School, on_delete=models.CASCADE, related_name="memberships")
    role = models.CharField(max_length=32, choices=Role.choices, db_index=True)
    is_active = models.BooleanField(default=True)
    is_primary = models.BooleanField(default=False)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["user", "school", "role"], name="uniq_membership_user_school_role")]
        indexes = [models.Index(fields=["school", "role", "is_active"])]

    def __str__(self) -> str:
        return f"{self.user} @ {self.school} ({self.role})"


class SchoolApplication(UUIDModel):
    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        UNDER_REVIEW = "UNDER_REVIEW", "Under review"
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Rejected"

    tracking_code = models.CharField(max_length=16, unique=True, editable=False)
    school_name = models.CharField(max_length=160)
    contact_name = models.CharField(max_length=120)
    contact_email = models.EmailField()
    contact_phone = models.CharField(max_length=32)
    designation = models.CharField(max_length=80, blank=True)
    address = models.TextField()
    city = models.CharField(max_length=80)
    state = models.CharField(max_length=80, blank=True)
    country = models.CharField(max_length=80, default="India")
    postal_code = models.CharField(max_length=16, blank=True)
    website = models.URLField(blank=True)
    estimated_students = models.PositiveIntegerField(default=0)
    estimated_vehicles = models.PositiveIntegerField(default=0)
    requested_plan = models.ForeignKey(SubscriptionPlan, null=True, blank=True, on_delete=models.SET_NULL)
    message = models.TextField(blank=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.PENDING, db_index=True)
    review_notes = models.TextField(blank=True)
    reviewed_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    reviewed_at = models.DateTimeField(null=True, blank=True)
    school = models.OneToOneField(School, null=True, blank=True, on_delete=models.SET_NULL, related_name="application")

    class Meta:
        ordering = ["-created_at"]

    def save(self, *args, **kwargs):
        if not self.tracking_code:
            self.tracking_code = "APP-" + secrets.token_hex(4).upper()
        self.contact_email = self.contact_email.lower()
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        return f"{self.school_name} ({self.status})"


class PlatformSetting(TimeStampedModel):
    key = models.CharField(max_length=80, unique=True)
    value = models.JSONField(default=dict, blank=True)
    description = models.CharField(max_length=255, blank=True)

    def __str__(self) -> str:
        return self.key


class NotificationTemplate(UUIDModel):
    """Platform default templates; a school may override by creating a row with its school set."""

    class Channel(models.TextChoices):
        IN_APP = "IN_APP", "In-app"
        PUSH = "PUSH", "Push"
        EMAIL = "EMAIL", "Email"
        SMS = "SMS", "SMS"

    school = models.ForeignKey(School, null=True, blank=True, on_delete=models.CASCADE, related_name="templates")
    category = models.CharField(max_length=48, db_index=True)
    channel = models.CharField(max_length=8, choices=Channel.choices, default=Channel.IN_APP)
    subject = models.CharField(max_length=160)
    body = models.TextField(help_text="Supports {student_name}, {school_name}, {minutes}, {stop_name}, {vehicle}")
    is_active = models.BooleanField(default=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["school", "category", "channel"], name="uniq_template_scope"),
            models.UniqueConstraint(fields=["category", "channel"], condition=models.Q(school__isnull=True), name="uniq_platform_template"),
        ]

    def __str__(self) -> str:
        return f"{self.category}/{self.channel}"


def _uuid_str() -> str:
    return str(uuid.uuid4())
