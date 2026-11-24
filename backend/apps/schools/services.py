from __future__ import annotations

from django.db import transaction
from django.utils import timezone

from apps.accounts.services import create_invitation
from apps.core.audit import record_audit
from apps.core.exceptions import DomainError, StateTransitionError
from apps.core.roles import Role

from .models import School, SchoolApplication, SchoolMembership, SchoolSubscription, SubscriptionPlan


def onboarding_progress(school: School) -> dict:
    from apps.fleet.models import Vehicle
    from apps.people.models import ParentProfile, StaffProfile, Student
    from apps.routing.models import Route, StudentTransportAssignment

    steps = [
        {
            "key": "profile",
            "label": "Complete school profile",
            "done": bool(school.address_line1 and school.phone and school.latitude is not None),
            "href": "/school/settings",
        },
        {
            "key": "vehicles",
            "label": "Register at least one vehicle",
            "done": Vehicle.objects.filter(school=school).exists(),
            "href": "/school/vehicles",
        },
        {
            "key": "staff",
            "label": "Add a driver",
            "done": StaffProfile.objects.filter(school=school, staff_type="DRIVER").exists(),
            "href": "/school/staff",
        },
        {
            "key": "routes",
            "label": "Create a route with stops",
            "done": Route.objects.filter(school=school, stops__isnull=False).exists(),
            "href": "/school/routes",
        },
        {
            "key": "students",
            "label": "Add students",
            "done": Student.objects.filter(school=school).exists(),
            "href": "/school/students",
        },
        {
            "key": "parents",
            "label": "Invite parents",
            "done": ParentProfile.objects.filter(school=school).exists(),
            "href": "/school/parents",
        },
        {
            "key": "assignments",
            "label": "Assign students to routes and stops",
            "done": StudentTransportAssignment.objects.filter(school=school, is_active=True).exists(),
            "href": "/school/routes",
        },
    ]
    done = sum(1 for s in steps if s["done"])
    return {"steps": steps, "completed_steps": done, "total_steps": len(steps), "completed": done == len(steps)}


@transaction.atomic
def approve_application(*, application: SchoolApplication, reviewer, plan: SubscriptionPlan | None, notes="", request=None):
    if application.status in (SchoolApplication.Status.APPROVED, SchoolApplication.Status.REJECTED):
        raise StateTransitionError(f"Application is already {application.status.lower()}.")
    school = School.objects.create(
        name=application.school_name,
        email=application.contact_email,
        phone=application.contact_phone,
        address_line1=application.address,
        city=application.city,
        state=application.state,
        country=application.country,
        postal_code=application.postal_code,
        website=application.website,
        status=School.Status.APPROVED,
        approved_at=timezone.now(),
    )
    plan = plan or application.requested_plan or SubscriptionPlan.objects.filter(is_active=True).first()
    if plan is not None:
        SchoolSubscription.objects.create(school=school, plan=plan, status=SchoolSubscription.Status.TRIAL)
    application.status = SchoolApplication.Status.APPROVED
    application.reviewed_by = reviewer
    application.reviewed_at = timezone.now()
    application.review_notes = notes
    application.school = school
    application.save()
    names = application.contact_name.split(" ", 1)
    invitation = create_invitation(
        school=school,
        email=application.contact_email,
        role=Role.SCHOOL_ADMIN,
        invited_by=reviewer,
        first_name=names[0],
        last_name=names[1] if len(names) > 1 else "",
    )
    record_audit(action="application.approved", request=request, actor=reviewer, school=school, target=application)
    return school, invitation


def reject_application(*, application: SchoolApplication, reviewer, notes="", request=None):
    if application.status in (SchoolApplication.Status.APPROVED, SchoolApplication.Status.REJECTED):
        raise StateTransitionError(f"Application is already {application.status.lower()}.")
    application.status = SchoolApplication.Status.REJECTED
    application.reviewed_by = reviewer
    application.reviewed_at = timezone.now()
    application.review_notes = notes
    application.save()
    record_audit(action="application.rejected", request=request, actor=reviewer, target=application)
    return application


@transaction.atomic
def create_school_with_admin(*, data: dict, admin: dict, plan: SubscriptionPlan | None, actor, request=None):
    """Super Admin creates a school directly and provisions its first admin by invitation."""
    school = School.objects.create(status=School.Status.APPROVED, approved_at=timezone.now(), **data)
    if plan is not None:
        SchoolSubscription.objects.create(school=school, plan=plan, status=SchoolSubscription.Status.ACTIVE)
    invitation = create_invitation(
        school=school,
        email=admin["email"],
        role=Role.SCHOOL_ADMIN,
        invited_by=actor,
        first_name=admin.get("first_name", ""),
        last_name=admin.get("last_name", ""),
    )
    record_audit(action="school.created", request=request, actor=actor, school=school, target=school)
    return school, invitation


def suspend_school(*, school: School, actor, reason: str, request=None):
    if school.status == School.Status.SUSPENDED:
        raise StateTransitionError("School is already suspended.")
    school.status = School.Status.SUSPENDED
    school.suspended_at = timezone.now()
    school.suspension_reason = reason
    school.save(update_fields=["status", "suspended_at", "suspension_reason", "updated_at"])
    record_audit(action="school.suspended", request=request, actor=actor, school=school, target=school, changes={"reason": reason})
    return school


def reactivate_school(*, school: School, actor, request=None):
    if school.status not in (School.Status.SUSPENDED, School.Status.INACTIVE, School.Status.APPROVED):
        raise StateTransitionError("School is not suspended or inactive.")
    if (
        school.status == School.Status.APPROVED
        and not SchoolMembership.objects.filter(school=school, role=Role.SCHOOL_ADMIN, is_active=True).exists()
    ):
        raise DomainError("Provision a School Admin before activating the school.")
    school.status = School.Status.ACTIVE
    school.suspension_reason = ""
    school.suspended_at = None
    if not school.activated_at:
        school.activated_at = timezone.now()
    school.save()
    record_audit(action="school.reactivated", request=request, actor=actor, school=school, target=school)
    return school


def platform_overview() -> dict:
    from apps.fleet.models import Vehicle
    from apps.people.models import Student
    from apps.trips.models import Trip

    return {
        "total_schools": School.objects.count(),
        "active_schools": School.objects.filter(status=School.Status.ACTIVE).count(),
        "suspended_schools": School.objects.filter(status=School.Status.SUSPENDED).count(),
        "pending_applications": SchoolApplication.objects.filter(
            status__in=[SchoolApplication.Status.PENDING, SchoolApplication.Status.UNDER_REVIEW]
        ).count(),
        "total_vehicles": Vehicle.objects.count(),
        "total_students": Student.objects.filter(status="ACTIVE").count(),
        "active_trips": Trip.objects.filter(status=Trip.Status.IN_PROGRESS).count(),
        "trips_today": Trip.objects.filter(scheduled_date=timezone.localdate()).count(),
    }
