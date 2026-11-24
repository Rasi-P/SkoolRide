from __future__ import annotations

from django.db import models
from django.utils import timezone

from apps.core.models import TenantModel


class Vehicle(TenantModel):
    class VehicleType(models.TextChoices):
        BUS = "BUS", "Bus"
        MINI_BUS = "MINI_BUS", "Mini bus"
        VAN = "VAN", "Van"
        OTHER = "OTHER", "Other"

    class Status(models.TextChoices):
        AVAILABLE = "AVAILABLE", "Available"
        IN_SERVICE = "IN_SERVICE", "In service"
        MAINTENANCE = "MAINTENANCE", "Under maintenance"
        INACTIVE = "INACTIVE", "Inactive"

    registration_number = models.CharField(max_length=24)
    fleet_number = models.CharField(max_length=16, blank=True, help_text="Short bus number shown to parents")
    vehicle_type = models.CharField(max_length=12, choices=VehicleType.choices, default=VehicleType.BUS)
    make = models.CharField(max_length=60, blank=True)
    model = models.CharField(max_length=60, blank=True)
    year = models.PositiveSmallIntegerField(null=True, blank=True)
    colour = models.CharField(max_length=32, blank=True)
    capacity = models.PositiveSmallIntegerField(default=40)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.AVAILABLE, db_index=True)
    gps_device_id = models.CharField(max_length=64, blank=True, help_text="Optional dedicated GPS tracker id")
    insurance_number = models.CharField(max_length=64, blank=True)
    insurance_expiry = models.DateField(null=True, blank=True)
    permit_number = models.CharField(max_length=64, blank=True)
    permit_expiry = models.DateField(null=True, blank=True)
    fitness_certificate_number = models.CharField(max_length=64, blank=True)
    fitness_expiry = models.DateField(null=True, blank=True)
    pollution_expiry = models.DateField(null=True, blank=True)
    last_service_date = models.DateField(null=True, blank=True)
    next_service_due = models.DateField(null=True, blank=True)
    odometer_km = models.PositiveIntegerField(default=0)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["fleet_number", "registration_number"]
        constraints = [models.UniqueConstraint(fields=["school", "registration_number"], name="uniq_vehicle_reg")]
        indexes = [models.Index(fields=["school", "status"])]

    def __str__(self) -> str:
        return self.registration_number

    @property
    def display_name(self) -> str:
        return f"Bus {self.fleet_number}" if self.fleet_number else self.registration_number

    @property
    def document_alerts(self) -> list[dict]:
        today = timezone.localdate()
        soon = today + timezone.timedelta(days=30)
        alerts = []
        for label, date in (
            ("Insurance", self.insurance_expiry),
            ("Permit", self.permit_expiry),
            ("Fitness certificate", self.fitness_expiry),
            ("Pollution certificate", self.pollution_expiry),
        ):
            if date and date < today:
                alerts.append({"document": label, "expires_on": date, "level": "expired"})
            elif date and date <= soon:
                alerts.append({"document": label, "expires_on": date, "level": "expiring"})
        for doc in self.documents.all():
            if doc.expires_on and doc.expires_on < today:
                alerts.append({"document": doc.title, "expires_on": doc.expires_on, "level": "expired"})
            elif doc.expires_on and doc.expires_on <= soon:
                alerts.append({"document": doc.title, "expires_on": doc.expires_on, "level": "expiring"})
        if self.next_service_due and self.next_service_due <= soon:
            alerts.append(
                {"document": "Service due", "expires_on": self.next_service_due, "level": "expired" if self.next_service_due < today else "expiring"}
            )
        return alerts

    @property
    def has_expired_documents(self) -> bool:
        return any(a["level"] == "expired" for a in self.document_alerts)


class VehicleDocument(TenantModel):
    class DocType(models.TextChoices):
        INSURANCE = "INSURANCE", "Insurance"
        PERMIT = "PERMIT", "Permit"
        FITNESS = "FITNESS", "Fitness certificate"
        POLLUTION = "POLLUTION", "Pollution certificate"
        REGISTRATION = "REGISTRATION", "Registration certificate"
        OTHER = "OTHER", "Other"

    vehicle = models.ForeignKey(Vehicle, on_delete=models.CASCADE, related_name="documents")
    doc_type = models.CharField(max_length=16, choices=DocType.choices)
    title = models.CharField(max_length=120)
    number = models.CharField(max_length=64, blank=True)
    issued_on = models.DateField(null=True, blank=True)
    expires_on = models.DateField(null=True, blank=True, db_index=True)
    file = models.FileField(upload_to="vehicle_documents/", blank=True, null=True)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["expires_on"]

    @property
    def is_expired(self) -> bool:
        return bool(self.expires_on and self.expires_on < timezone.localdate())


class VehicleMaintenance(TenantModel):
    class Category(models.TextChoices):
        SERVICE = "SERVICE", "Routine service"
        REPAIR = "REPAIR", "Repair"
        INSPECTION = "INSPECTION", "Inspection"
        TYRES = "TYRES", "Tyres"
        OTHER = "OTHER", "Other"

    vehicle = models.ForeignKey(Vehicle, on_delete=models.CASCADE, related_name="maintenance")
    category = models.CharField(max_length=12, choices=Category.choices, default=Category.SERVICE)
    description = models.TextField()
    performed_on = models.DateField()
    cost = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    odometer_km = models.PositiveIntegerField(null=True, blank=True)
    vendor = models.CharField(max_length=120, blank=True)
    next_due_on = models.DateField(null=True, blank=True)

    class Meta:
        ordering = ["-performed_on"]


class StaffVehicleAssignment(TenantModel):
    """Who drives / attends which vehicle, with history."""

    class AssignmentRole(models.TextChoices):
        DRIVER = "DRIVER", "Driver"
        ATTENDANT = "ATTENDANT", "Attendant"

    vehicle = models.ForeignKey(Vehicle, on_delete=models.CASCADE, related_name="staff_assignments")
    staff = models.ForeignKey("people.StaffProfile", on_delete=models.CASCADE, related_name="vehicle_assignments")
    role = models.CharField(max_length=12, choices=AssignmentRole.choices)
    start_date = models.DateField(default=timezone.localdate)
    end_date = models.DateField(null=True, blank=True)
    is_active = models.BooleanField(default=True, db_index=True)
    notes = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ["-start_date"]
        indexes = [models.Index(fields=["school", "vehicle", "is_active"]), models.Index(fields=["school", "staff", "is_active"])]
        constraints = [
            models.UniqueConstraint(fields=["vehicle", "role"], condition=models.Q(is_active=True), name="uniq_active_vehicle_role"),
            models.UniqueConstraint(fields=["staff"], condition=models.Q(is_active=True), name="uniq_active_staff_vehicle"),
        ]

    def __str__(self) -> str:
        return f"{self.staff} -> {self.vehicle} ({self.role})"
