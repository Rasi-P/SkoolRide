from __future__ import annotations

import logging
from datetime import timedelta

from celery import shared_task
from django.utils import timezone

from .models import NotificationDelivery
from .providers import ProviderError, get_provider

logger = logging.getLogger(__name__)
MAX_ATTEMPTS = 3


def _deliver(delivery: NotificationDelivery) -> None:
    provider = get_provider(delivery.channel)
    delivery.attempts += 1
    if provider is None:
        delivery.status = NotificationDelivery.Status.SKIPPED
        delivery.save(update_fields=["attempts", "status", "updated_at"])
        return
    try:
        ref = provider.send(delivery.notification, delivery)
        delivery.status = NotificationDelivery.Status.SENT
        delivery.provider_ref = (ref or "")[:120]
        delivery.sent_at = timezone.now()
        delivery.last_error = ""
    except ProviderError as exc:
        # Configuration/recipient problems are not retried.
        delivery.status = NotificationDelivery.Status.SKIPPED
        delivery.last_error = str(exc)[:500]
    except Exception as exc:  # transient failure -> retry later
        logger.warning("Delivery %s failed: %s", delivery.pk, exc)
        delivery.status = NotificationDelivery.Status.FAILED if delivery.attempts < MAX_ATTEMPTS else NotificationDelivery.Status.SKIPPED
        delivery.last_error = str(exc)[:500]
    delivery.save()


@shared_task
def deliver_notification(notification_id: str) -> int:
    count = 0
    for d in NotificationDelivery.objects.select_related("notification__recipient").filter(
        notification_id=notification_id, status=NotificationDelivery.Status.PENDING
    ):
        _deliver(d)
        count += 1
    return count


@shared_task
def retry_failed_deliveries() -> int:
    cutoff = timezone.now() - timedelta(minutes=2)
    qs = NotificationDelivery.objects.select_related("notification__recipient").filter(
        status=NotificationDelivery.Status.FAILED, attempts__lt=MAX_ATTEMPTS, updated_at__lte=cutoff
    )[:500]
    count = 0
    for d in qs:
        _deliver(d)
        count += 1
    return count
