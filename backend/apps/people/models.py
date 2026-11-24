from __future__ import annotations

from django.db import models
from django.utils import timezone

from apps.core.models import TenantModel


class StaffProfile(TenantModel):
    class StaffType(models.TextChoices):
        DRIVER = "DRIVER", "Driver"
        ATTENDANT = "ATTENDANT", "Attendant"
        TRANSPORT_MANAGER = "TRANSPORT_MANAGER", "Transport Manager"
        SCHOOL_ADMIN = "SCHOOL_ADMIN", "School Admin"

    class Status(models.TextChoices):
        ACTIVE = "ACTIVE", "Active"
        ON_LEAVE = "ON_LEAVE", "On leave"
        INACTIVE = "INACTIVE", "Inactive"

    membership = models.OneToOneField("schools.SchoolMembership", null=True, blank=True, on_delete=models.SET_NULL, related_name="staff_profile")
    staff_type = models.CharField(max_length=24, choices=StaffType.choices, db_index=True)
    employee_id = models.CharField(max_length=32)
    first_name = models.CharField(max_length=80)
    last_name = models.CharField(max_length=80, blank=True)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=32)
    date_of_birth = models.DateField(null=True, blank=True)
    gender = models.CharField(max_length=16, blank=True)
    photo = models.ImageField(upload_to="staff_photos/", blank=True, null=True)
    address = models.TextField(blank=True)
    emergency_contact_name = models.CharField(max_length=120, blank=True)
    emergency_contact_phone = models.CharField(max_length=32, blank=True)
    joining_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.ACTIVE, db_index=True)
    licence_number = models.CharField(max_length=48, blank=True)
    licence_class = models.CharField(max_length=24, blank=True)
    licence_expiry = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["first_name", "last_name"]
        constraints = [models.UniqueConstraint(fields=["school", "employee_id"], name="uniq_staff_employee_id")]
        indexes = [models.Index(fields=["school", "staff_type", "status"])]

    def __str__(self) -> str:
        return self.full_name

    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}".strip()

    @property
    def user(self):
        return self.membership.user if self.membership_id else None

    @property
    def licence_expired(self) -> bool:
        return bool(self.licence_expiry and self.licence_expiry < timezone.localdate())


class StaffDocument(TenantModel):
    class DocType(models.TextChoices):
        LICENCE = "LICENCE", "Driving licence"
        ID_PROOF = "ID_PROOF", "ID proof"
        POLICE_VERIFICATION = "POLICE_VERIFICATION", "Police verification"
        MEDICAL = "MEDICAL", "Medical certificate"
        TRAINING = "TRAINING", "Training certificate"
        OTHER = "OTHER", "Other"

    staff = models.ForeignKey(StaffProfile, on_delete=models.CASCADE, related_name="documents")
    doc_type = models.CharField(max_length=24, choices=DocType.choices)
    title = models.CharField(max_length=120)
    number = models.CharField(max_length=64, blank=True)
    issued_on = models.DateField(null=True, blank=True)
    expires_on = models.DateField(null=True, blank=True, db_index=True)
    file = models.FileField(upload_to="staff_documents/", blank=True, null=True)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["expires_on"]

    @property
    def is_expired(self) -> bool:
        return bool(self.expires_on and self.expires_on < timezone.localdate())


class StaffLeave(TenantModel):
    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Rejected"

    staff = models.ForeignKey(StaffProfile, on_delete=models.CASCADE, related_name="leaves")
    leave_type = models.CharField(max_length=24, default="CASUAL")
    start_date = models.DateField()
    end_date = models.DateField()
    reason = models.TextField(blank=True)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.PENDING)
    decided_by = models.ForeignKey("accounts.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")

    class Meta:
        ordering = ["-start_date"]


class StaffAttendance(TenantModel):
    class Status(models.TextChoices):
        PRESENT = "PRESENT", "Present"
        ABSENT = "ABSENT", "Absent"
        LEAVE = "LEAVE", "Leave"
        HALF_DAY = "HALF_DAY", "Half day"

    staff = models.ForeignKey(StaffProfile, on_delete=models.CASCADE, related_name="attendance")
    date = models.DateField(db_index=True)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.PRESENT)
    note = models.CharField(max_length=160, blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["staff", "date"], name="uniq_staff_attendance_day")]
        ordering = ["-date"]


class ParentProfile(TenantModel):
    class Status(models.TextChoices):
        INVITED = "INVITED", "Invited"
        ACTIVE = "ACTIVE", "Active"
        SUSPENDED = "SUSPENDED", "Suspended"

    membership = models.OneToOneField("schools.SchoolMembership", null=True, blank=True, on_delete=models.SET_NULL, related_name="parent_profile")
    first_name = models.CharField(max_length=80)
    last_name = models.CharField(max_length=80, blank=True)
    email = models.EmailField()
    phone = models.CharField(max_length=32)
    alt_phone = models.CharField(max_length=32, blank=True)
    address = models.TextField(blank=True)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.INVITED, db_index=True)
    phone_verified = models.BooleanField(default=False)
    email_verified = models.BooleanField(default=False)
    preferred_language = models.CharField(max_length=8, default="en")
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["first_name", "last_name"]
        constraints = [models.UniqueConstraint(fields=["school", "email"], name="uniq_parent_email_per_school")]

    def __str__(self) -> str:
        return self.full_name

    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}".strip()

    @property
    def user(self):
        return self.membership.user if self.membership_id else None

    def save(self, *args, **kwargs):
        self.email = self.email.lower()
        super().save(*args, **kwargs)


class Student(TenantModel):
    class Status(models.TextChoices):
        ACTIVE = "ACTIVE", "Active"
        TRANSFERRED = "TRANSFERRED", "Transferred"
        WITHDRAWN = "WITHDRAWN", "Withdrawn"
        INACTIVE = "INACTIVE", "Inactive"

    class TransportStatus(models.TextChoices):
        ACTIVE = "ACTIVE", "Using transport"
        WITHDRAWN = "WITHDRAWN", "Withdrawn from transport"
        NONE = "NONE", "Not using transport"

    admission_number = models.CharField(max_length=32)
    first_name = models.CharField(max_length=80)
    last_name = models.CharField(max_length=80, blank=True)
    grade = models.CharField(max_length=16, db_index=True)
    section = models.CharField(max_length=16, blank=True)
    date_of_birth = models.DateField(null=True, blank=True)
    gender = models.CharField(max_length=16, blank=True)
    photo = models.ImageField(upload_to="student_photos/", blank=True, null=True)
    blood_group = models.CharField(max_length=8, blank=True)
    medical_notes = models.TextField(blank=True)
    pickup_address = models.TextField(blank=True)
    emergency_contact_name = models.CharField(max_length=120, blank=True)
    emergency_contact_phone = models.CharField(max_length=32, blank=True)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.ACTIVE, db_index=True)
    transport_status = models.CharField(max_length=12, choices=TransportStatus.choices, default=TransportStatus.ACTIVE, db_index=True)
    status_changed_at = models.DateTimeField(null=True, blank=True)
    status_reason = models.CharField(max_length=255, blank=True)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["grade", "section", "first_name"]
        constraints = [models.UniqueConstraint(fields=["school", "admission_number"], name="uniq_student_admission")]
        indexes = [models.Index(fields=["school", "status", "transport_status"]), models.Index(fields=["school", "grade"])]

    def __str__(self) -> str:
        return self.full_name

    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}".strip()

    @property
    def class_label(self) -> str:
        return f"{self.grade}{'-' + self.section if self.section else ''}"


class GuardianStudent(TenantModel):
    class Relationship(models.TextChoices):
        FATHER = "FATHER", "Father"
        MOTHER = "MOTHER", "Mother"
        GUARDIAN = "GUARDIAN", "Guardian"
        OTHER = "OTHER", "Other"

    parent = models.ForeignKey(ParentProfile, on_delete=models.CASCADE, related_name="guardian_links")
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name="guardian_links")
    relationship = models.CharField(max_length=12, choices=Relationship.choices, default=Relationship.GUARDIAN)
    is_primary = models.BooleanField(default=False)
    can_pickup = models.BooleanField(default=True, help_text="Authorised to receive the child at the stop")
    receives_notifications = models.BooleanField(default=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["parent", "student"], name="uniq_guardian_student")]
        indexes = [models.Index(fields=["school", "student"]), models.Index(fields=["school", "parent"])]

    def __str__(self) -> str:
        return f"{self.parent} -> {self.student} ({self.relationship})"
