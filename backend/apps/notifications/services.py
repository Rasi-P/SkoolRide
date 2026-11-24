from __future__ import annotations

import logging

from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.core.roles import MANAGEMENT_ROLES

from .models import Channel, Notification, NotificationDelivery, NotificationPreference

logger = logging.getLogger(__name__)


class _SafeDict(dict):
    def __missing__(self, key):
        return "{" + key + "}"


def render(text: str, context: dict) -> str:
    try:
        return text.format_map(_SafeDict(**context))
    except Exception:  # pragma: no cover
        return text


def _template(school, category: str, channel: str):
    from apps.schools.models import NotificationTemplate

    qs = NotificationTemplate.objects.filter(category=category, channel=channel, is_active=True)
    return qs.filter(school=school).first() or qs.filter(school__isnull=True).first()


def _channels_for(school, user, category) -> list[str]:
    school_channels = (school.notification_channels if school else None) or {"in_app": True, "push": True, "email": True, "sms": False}
    pref = getattr(user, "notification_preference", None)
    chosen = [Channel.IN_APP]
    mapping = {"push": Channel.PUSH, "email": Channel.EMAIL, "sms": Channel.SMS}
    for key, ch in mapping.items():
        if not school_channels.get(key):
            continue
        if pref is not None and not pref.allows(ch, category):
            continue
        chosen.append(ch)
    return chosen


def notify_users(
    *, school, recipients, category: str, title: str, body: str, data=None, dedupe_key=None, trip=None, student=None, context=None, channels=None
) -> list[Notification]:
    """Create notifications (idempotent per recipient + dedupe_key) and queue channel deliveries."""
    context = {
        "school_name": school.name if school else "SchoolBus Pro",
        "school": school.name if school else "SchoolBus Pro",
        **(context or {}),
    }
    created: list[Notification] = []
    tpl = _template(school, category, "IN_APP")
    for user in recipients:
        if user is None or not user.is_active:
            continue
        if dedupe_key and Notification.objects.filter(recipient=user, dedupe_key=dedupe_key).exists():
            continue
        final_title = render(tpl.subject if tpl else title, context)
        final_body = render(tpl.body if tpl else body, context)
        try:
            with transaction.atomic():
                n = Notification.objects.create(
                    school=school,
                    recipient=user,
                    category=category,
                    title=final_title[:160],
                    body=final_body,
                    data=data or {},
                    dedupe_key=dedupe_key,
                    trip=trip,
                    student=student,
                )
        except IntegrityError:
            continue  # concurrent duplicate
        for ch in channels or _channels_for(school, user, category):
            NotificationDelivery.objects.create(
                notification=n,
                channel=ch,
                status=NotificationDelivery.Status.SENT if ch == Channel.IN_APP else NotificationDelivery.Status.PENDING,
                sent_at=timezone.now() if ch == Channel.IN_APP else None,
            )
        created.append(n)
        transaction.on_commit(lambda nid=n.id: _enqueue(nid))
        _push_realtime(n)
    return created


def _enqueue(notification_id):
    from .tasks import deliver_notification

    try:
        deliver_notification.delay(str(notification_id))
    except Exception:
        logger.warning("Celery broker unavailable; delivering notification inline")
        deliver_notification(str(notification_id))


def _push_realtime(n: Notification) -> None:
    """Push the in-app notification to the user's open sessions via the channel layer."""
    try:
        from asgiref.sync import async_to_sync
        from channels.layers import get_channel_layer

        layer = get_channel_layer()
        if layer is None:
            return
        async_to_sync(layer.group_send)(
            f"user_{n.recipient_id}",
            {
                "type": "trip.message",
                "event": "notification",
                "trip_id": str(n.trip_id) if n.trip_id else "",
                "payload": {
                    "id": str(n.id),
                    "title": n.title,
                    "body": n.body,
                    "category": n.category,
                    "data": n.data,
                    "created_at": n.created_at.isoformat(),
                },
            },
        )
    except Exception:  # pragma: no cover
        logger.debug("Realtime notification push skipped", exc_info=True)


def guardians_of(student):
    """Users linked to a student who should receive notifications about them."""
    users = []
    for link in student.guardian_links.select_related("parent__membership__user").filter(receives_notifications=True):
        parent = link.parent
        if parent.membership_id and parent.membership.is_active and parent.status != "SUSPENDED":
            users.append(parent.membership.user)
    return users


def notify_student_guardians(*, student, category, title, body, dedupe_key, data=None, trip=None, context=None):
    ctx = {"student_name": student.full_name, "student_first_name": student.first_name, **(context or {})}
    if trip is not None:
        ctx.update(_trip_context(trip))
    return notify_users(
        school=student.school,
        recipients=guardians_of(student),
        category=category,
        title=title,
        body=body,
        data=data,
        dedupe_key=dedupe_key,
        trip=trip,
        student=student,
        context=ctx,
    )


def _trip_context(trip) -> dict:
    return {
        "vehicle": trip.vehicle.display_name if trip.vehicle else "The bus",
        "vehicle_registration": trip.vehicle.registration_number if trip.vehicle else "",
        "route": trip.route.name,
        "route_code": trip.route.code,
        "direction": "morning pickup" if trip.direction == "PICKUP" else "afternoon drop-off",
        "date": trip.scheduled_date.strftime("%d %b %Y"),
        "driver": trip.driver.full_name if trip.driver else "",
    }


def notify_trip_guardians(trip, *, category, title, body, dedupe_suffix, only_statuses=None, data=None):
    qs = trip.trip_students.select_related("student")
    if only_statuses:
        qs = qs.filter(status__in=only_statuses)
    results = []
    for ts in qs:
        results += notify_student_guardians(
            student=ts.student,
            trip=trip,
            category=category,
            title=title,
            body=body,
            dedupe_key=f"{category.lower()}:{trip.id}:{ts.student_id}:{dedupe_suffix}",
            data={"trip_id": str(trip.id), **(data or {})},
        )
    return results


def notify_school_staff(*, school, category, title, body, dedupe_key=None, data=None, roles=None):
    from apps.schools.models import SchoolMembership

    roles = roles or MANAGEMENT_ROLES
    users = [m.user for m in SchoolMembership.objects.filter(school=school, role__in=roles, is_active=True).select_related("user")]
    return notify_users(school=school, recipients=users, category=category, title=title, body=body, data=data, dedupe_key=dedupe_key)


def get_or_create_preference(user) -> NotificationPreference:
    pref, _ = NotificationPreference.objects.get_or_create(user=user)
    return pref
