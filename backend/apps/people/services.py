from __future__ import annotations

import csv
import io

from django.db import transaction
from django.utils import timezone

from apps.accounts.services import create_invitation
from apps.core.audit import record_audit
from apps.core.exceptions import DomainError
from apps.core.roles import Role

from .models import GuardianStudent, ParentProfile, StaffProfile, Student
from .serializers import StudentImportRowSerializer

STAFF_TYPE_TO_ROLE = {
    StaffProfile.StaffType.DRIVER: Role.DRIVER,
    StaffProfile.StaffType.ATTENDANT: Role.ATTENDANT,
    StaffProfile.StaffType.TRANSPORT_MANAGER: Role.TRANSPORT_MANAGER,
    StaffProfile.StaffType.SCHOOL_ADMIN: Role.SCHOOL_ADMIN,
}


def invite_staff(*, staff: StaffProfile, actor, email: str | None = None, request=None):
    email = (email or staff.email or "").lower()
    if not email:
        raise DomainError("Staff member has no email address to invite.")
    if staff.email != email:
        staff.email = email
        staff.save(update_fields=["email"])
    return create_invitation(
        school=staff.school,
        email=email,
        role=STAFF_TYPE_TO_ROLE[staff.staff_type],
        invited_by=actor,
        first_name=staff.first_name,
        last_name=staff.last_name,
        metadata={"staff_profile_id": str(staff.pk)},
    )


def invite_parent(*, parent: ParentProfile, actor, request=None):
    invitation = create_invitation(
        school=parent.school,
        email=parent.email,
        role=Role.PARENT,
        invited_by=actor,
        first_name=parent.first_name,
        last_name=parent.last_name,
        metadata={"parent_profile_id": str(parent.pk)},
    )
    return invitation


def set_membership_active(profile, active: bool, *, request=None, action: str):
    if profile.membership_id is None:
        raise DomainError("This person has not accepted an invitation yet.")
    profile.membership.is_active = active
    profile.membership.save(update_fields=["is_active"])
    if isinstance(profile, ParentProfile):
        profile.status = ParentProfile.Status.ACTIVE if active else ParentProfile.Status.SUSPENDED
        profile.save(update_fields=["status"])
    elif isinstance(profile, StaffProfile):
        profile.status = StaffProfile.Status.ACTIVE if active else StaffProfile.Status.INACTIVE
        profile.save(update_fields=["status"])
    record_audit(action=action, request=request, target=profile)


@transaction.atomic
def change_student_status(*, student: Student, status: str, reason: str, request=None):
    from apps.routing.services import end_student_assignments

    if student.status == status:
        raise DomainError(f"Student is already {status.lower()}.")
    student.status = status
    student.status_reason = reason
    student.status_changed_at = timezone.now()
    if status in (Student.Status.TRANSFERRED, Student.Status.WITHDRAWN, Student.Status.INACTIVE):
        student.transport_status = Student.TransportStatus.WITHDRAWN
        end_student_assignments(student, reason=f"Student {status.lower()}")
    student.save()
    record_audit(action=f"student.{status.lower()}", request=request, target=student, changes={"reason": reason})
    return student


@transaction.atomic
def withdraw_transport(*, student: Student, reason: str, request=None):
    from apps.routing.services import end_student_assignments

    student.transport_status = Student.TransportStatus.WITHDRAWN
    student.status_reason = reason
    student.status_changed_at = timezone.now()
    student.save()
    end_student_assignments(student, reason=reason or "Transport withdrawn")
    record_audit(action="student.transport_withdrawn", request=request, target=student, changes={"reason": reason})
    return student


def parse_student_csv(file_obj) -> list[dict]:
    raw = file_obj.read()
    if isinstance(raw, bytes):
        raw = raw.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(raw))
    rows = []
    for idx, row in enumerate(reader, start=2):
        cleaned = {(k or "").strip().lower().replace(" ", "_"): (v or "").strip() for k, v in row.items()}
        cleaned["_line"] = idx
        rows.append(cleaned)
    return rows


def validate_student_import(school, rows: list[dict]) -> dict:
    existing = set(Student.objects.filter(school=school).values_list("admission_number", flat=True))
    seen: set[str] = set()
    results = []
    for row in rows:
        line = row.pop("_line", None)
        ser = StudentImportRowSerializer(data={k: v for k, v in row.items() if v != "" or k in ("date_of_birth",)})
        errors: dict = {}
        if not ser.is_valid():
            errors = {k: [str(e) for e in v] for k, v in ser.errors.items()}
        data = ser.validated_data if ser.is_valid() else row
        adm = (data.get("admission_number") or "").strip()
        duplicate_in_file = adm in seen
        duplicate_in_db = adm in existing
        if adm:
            seen.add(adm)
        status = "ok"
        if errors:
            status = "error"
        elif duplicate_in_file:
            status = "duplicate_in_file"
        elif duplicate_in_db:
            status = "duplicate_existing"
        results.append({"line": line, "status": status, "errors": errors, "data": {k: (str(v) if v is not None else None) for k, v in data.items()}})
    summary = {
        "total": len(results),
        "valid": sum(1 for r in results if r["status"] == "ok"),
        "errors": sum(1 for r in results if r["status"] == "error"),
        "duplicates": sum(1 for r in results if r["status"].startswith("duplicate")),
    }
    return {"rows": results, "summary": summary}


@transaction.atomic
def commit_student_import(school, rows: list[dict], *, request=None) -> dict:
    """Create students (and optional guardians) for rows that are valid and not duplicates."""
    validated = validate_student_import(school, [dict(r) for r in rows])
    created_students = 0
    created_parents = 0
    linked = 0
    for r in validated["rows"]:
        if r["status"] != "ok":
            continue
        d = r["data"]
        student = Student.objects.create(
            school=school,
            admission_number=d["admission_number"],
            first_name=d["first_name"],
            last_name=d.get("last_name") or "",
            grade=d["grade"],
            section=d.get("section") or "",
            gender=d.get("gender") or "",
            date_of_birth=d.get("date_of_birth") or None,
            pickup_address=d.get("pickup_address") or "",
        )
        created_students += 1
        email = (d.get("parent_email") or "").lower()
        if email:
            parent, was_created = ParentProfile.objects.get_or_create(
                school=school,
                email=email,
                defaults={
                    "first_name": d.get("parent_first_name") or "Parent",
                    "last_name": d.get("parent_last_name") or "",
                    "phone": d.get("parent_phone") or "",
                },
            )
            if was_created:
                created_parents += 1
            GuardianStudent.objects.get_or_create(
                school=school,
                parent=parent,
                student=student,
                defaults={"relationship": (d.get("parent_relationship") or "GUARDIAN").upper(), "is_primary": True},
            )
            linked += 1
    record_audit(
        action="students.imported",
        request=request,
        school=school,
        changes={"students": created_students, "parents": created_parents, "links": linked},
    )
    return {
        "created_students": created_students,
        "created_parents": created_parents,
        "guardian_links": linked,
        "skipped": validated["summary"]["total"] - created_students,
    }
