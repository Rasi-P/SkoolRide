from __future__ import annotations

from datetime import timedelta

from celery import shared_task
from django.utils import timezone


@shared_task
def send_document_expiry_reminders(days_ahead: int = 30) -> int:
    """Daily: notify school admins about vehicle/staff documents expiring soon (idempotent per day)."""
    from apps.notifications.services import notify_school_staff
    from apps.people.models import StaffProfile
    from apps.schools.models import School

    today = timezone.localdate()
    soon = today + timedelta(days=days_ahead)
    sent = 0
    for school in School.objects.filter(status=School.Status.ACTIVE):
        items = []
        for v in school.vehicle_set.exclude(status="INACTIVE").prefetch_related("documents"):
            for a in v.document_alerts:
                items.append(f"{v.registration_number}: {a['document']} ({a['level']} {a['expires_on']})")
        for s in StaffProfile.objects.filter(school=school, staff_type="DRIVER", licence_expiry__lte=soon):
            items.append(f"{s.full_name}: driving licence expires {s.licence_expiry}")
        if not items:
            continue
        notify_school_staff(
            school=school,
            category="DOCUMENT_EXPIRY",
            title="Documents expiring soon",
            body="\n".join(items[:15]),
            dedupe_key=f"docexpiry:{school.pk}:{today}",
            data={"count": len(items)},
        )
        sent += 1
    return sent
