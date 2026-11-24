from __future__ import annotations

from django.db import transaction
from django.utils import timezone

from apps.core.audit import record_audit
from apps.core.exceptions import DomainError, StateTransitionError
from apps.notifications.services import guardians_of, notify_school_staff, notify_student_guardians, notify_users

from .models import AbsenceRequest, Announcement, Complaint, PickupChangeRequest


@transaction.atomic
def submit_absence(*, school, student, parent, data: dict, request=None) -> AbsenceRequest:
    absence = AbsenceRequest.objects.create(school=school, student=student, requested_by=parent, **data)
    # Apply to already-generated trips.
    from apps.trips.models import Trip, TripStudent

    trips = Trip.objects.filter(school=school, scheduled_date__range=(absence.date_from, absence.date_to), status="SCHEDULED")
    if absence.direction != "BOTH":
        trips = trips.filter(direction=absence.direction)
    TripStudent.objects.filter(trip__in=trips, student=student, status="EXPECTED").update(
        status="ABSENT", absence_reason=f"Reported by parent: {absence.reason}"[:255]
    )
    record_audit(action="absence.submitted", request=request, target=absence)
    notify_school_staff(
        school=school,
        category="REQUEST_UPDATE",
        title=f"Absence reported: {student.full_name}",
        body=(
            f"{student.full_name} will not use transport from {absence.date_from:%d %b} to {absence.date_to:%d %b} "
            f"({absence.direction.lower()}). {absence.reason}"
        ),
        dedupe_key=f"absence:{absence.id}",
    )
    return absence


def acknowledge_absence(*, absence: AbsenceRequest, user, request=None):
    absence.status = AbsenceRequest.Status.ACKNOWLEDGED
    absence.acknowledged_by = user
    absence.acknowledged_at = timezone.now()
    absence.save()
    record_audit(action="absence.acknowledged", request=request, target=absence)
    return absence


def cancel_absence(*, absence: AbsenceRequest, request=None):
    if absence.status == AbsenceRequest.Status.CANCELLED:
        raise StateTransitionError("Already cancelled.")
    if absence.date_to < timezone.localdate():
        raise DomainError("Past absences cannot be cancelled.")
    absence.status = AbsenceRequest.Status.CANCELLED
    absence.save(update_fields=["status"])
    from apps.trips.models import Trip, TripStudent

    trips = Trip.objects.filter(school=absence.school, scheduled_date__range=(absence.date_from, absence.date_to), status="SCHEDULED")
    TripStudent.objects.filter(trip__in=trips, student=absence.student, status="ABSENT").update(status="EXPECTED", absence_reason="")
    record_audit(action="absence.cancelled", request=request, target=absence)
    return absence


@transaction.atomic
def decide_pickup_change(*, req: PickupChangeRequest, approve: bool, user, notes="", request=None) -> PickupChangeRequest:
    if req.status != PickupChangeRequest.Status.PENDING:
        raise StateTransitionError("Request has already been decided.")
    req.decided_by = user
    req.decided_at = timezone.now()
    req.decision_notes = notes
    if approve:
        from apps.people.services import withdraw_transport
        from apps.routing.services import assign_student

        if req.change_type in ("STOP_CHANGE", "ROUTE_CHANGE", "TEMPORARY"):
            current = req.student.transport_assignments.filter(is_active=True).select_related("route").first()
            route = req.requested_route or (current.route if current else None)
            pickup = req.requested_pickup_stop or (current.pickup_stop if current and current.route_id == (route.id if route else None) else None)
            if route is None or pickup is None:
                raise DomainError("Cannot approve: the request does not specify a valid route and stop.")
            assign_student(
                school=req.school,
                student=req.student,
                route=route,
                pickup_stop=pickup,
                dropoff_stop=req.requested_dropoff_stop or pickup,
                start_date=req.effective_date,
                notes=f"Approved request {req.id}",
                request=request,
            )
        elif req.change_type == "WITHDRAW":
            withdraw_transport(student=req.student, reason=f"Parent request: {req.details[:120]}", request=request)
        req.status = PickupChangeRequest.Status.APPROVED
    else:
        req.status = PickupChangeRequest.Status.REJECTED
    req.save()
    record_audit(action=f"pickup_change.{req.status.lower()}", request=request, target=req, changes={"notes": notes})
    notify_student_guardians(
        student=req.student,
        category="REQUEST_UPDATE",
        title=f"Pickup change request {req.status.lower()}",
        body=f"Your {req.get_change_type_display().lower()} request for {req.student.first_name} was {req.status.lower()}."
        + (f" Note: {notes}" if notes else ""),
        dedupe_key=f"pickupchange:{req.id}:{req.status}",
    )
    return req


def submit_complaint(*, school, user, data: dict, request=None) -> Complaint:
    complaint = Complaint.objects.create(school=school, raised_by=user, **data)
    record_audit(action="complaint.submitted", request=request, target=complaint)
    notify_school_staff(
        school=school,
        category="COMPLAINT",
        title=f"New complaint {complaint.ticket_number}: {complaint.subject}",
        body=complaint.description[:300],
        dedupe_key=f"complaint:{complaint.id}:new",
    )
    return complaint


def update_complaint_status(*, complaint: Complaint, status: str, notes: str, user, request=None) -> Complaint:
    complaint.status = status
    if notes:
        complaint.resolution_notes = notes
    if status in ("RESOLVED", "CLOSED"):
        complaint.resolved_at = timezone.now()
    complaint.save()
    record_audit(action="complaint.status_changed", request=request, target=complaint, changes={"status": status})
    if complaint.raised_by_id:
        notify_users(
            school=complaint.school,
            recipients=[complaint.raised_by],
            category="COMPLAINT",
            title=f"Complaint {complaint.ticket_number} {status.lower().replace('_', ' ')}",
            body=notes or f"Your complaint '{complaint.subject}' is now {status.lower().replace('_', ' ')}.",
            dedupe_key=f"complaint:{complaint.id}:{status}:{complaint.updated_at.timestamp():.0f}",
        )
    return complaint


def publish_announcement(*, announcement: Announcement, request=None) -> int:
    """Send in-app/push notifications for an announcement to its audience (once)."""
    from apps.people.models import Student
    from apps.schools.models import SchoolMembership

    school = announcement.school
    recipients = set()
    if announcement.audience in ("ALL", "STAFF"):
        recipients.update(
            m.user
            for m in SchoolMembership.objects.filter(
                school=school, is_active=True, role__in=["SCHOOL_ADMIN", "TRANSPORT_MANAGER", "DRIVER", "ATTENDANT"]
            ).select_related("user")
        )
    if announcement.audience in ("ALL", "PARENTS", "ROUTE"):
        students = Student.objects.filter(school=school, status="ACTIVE")
        if announcement.audience == "ROUTE" and announcement.route_id:
            students = students.filter(transport_assignments__route=announcement.route, transport_assignments__is_active=True)
        for s in students.distinct():
            recipients.update(guardians_of(s))
    created = notify_users(
        school=school,
        recipients=list(recipients),
        category="ANNOUNCEMENT",
        title=announcement.title,
        body=announcement.body[:1000],
        dedupe_key=f"announcement:{announcement.id}",
        data={"announcement_id": str(announcement.id)},
    )
    announcement.notification_sent_at = timezone.now()
    announcement.save(update_fields=["notification_sent_at"])
    record_audit(action="announcement.published", request=request, target=announcement, changes={"recipients": len(created)})
    return len(created)
