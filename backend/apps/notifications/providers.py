"""Delivery providers. Each provider exposes `send(notification, delivery) -> provider_ref`.

Local development works without any paid service: email goes to the console backend, SMS/WhatsApp
are logged, and web push works as soon as VAPID keys are generated (`manage.py generate_vapid_keys`).
To integrate a real SMS/WhatsApp vendor, implement a class with the same interface and point
SMS_PROVIDER / WHATSAPP_PROVIDER at it (dotted path or the registered name).
"""

from __future__ import annotations

import json
import logging

from django.conf import settings
from django.core.mail import send_mail
from django.utils import timezone

logger = logging.getLogger(__name__)


class ProviderError(Exception):
    pass


class EmailProvider:
    def send(self, notification, delivery) -> str:
        email = notification.recipient.email
        if not email:
            raise ProviderError("Recipient has no email address")
        send_mail(notification.title, notification.body, settings.DEFAULT_FROM_EMAIL, [email], fail_silently=False)
        return f"email:{email}"


class ConsoleSMSProvider:
    """Logs the message instead of sending it. Replace with a real vendor adapter in production."""

    channel_label = "SMS"

    def send(self, notification, delivery) -> str:
        phone = notification.recipient.phone
        if not phone:
            raise ProviderError("Recipient has no phone number")
        logger.info("[%s to %s] %s - %s", self.channel_label, phone, notification.title, notification.body)
        return f"console:{phone}"


class ConsoleWhatsAppProvider(ConsoleSMSProvider):
    channel_label = "WhatsApp"


class WebPushProvider:
    def send(self, notification, delivery) -> str:
        from .models import PushSubscription

        if not settings.VAPID_PRIVATE_KEY:
            raise ProviderError("VAPID keys not configured")
        try:
            from pywebpush import WebPushException, webpush
        except ImportError as exc:  # pragma: no cover
            raise ProviderError("pywebpush not installed") from exc
        subs = PushSubscription.objects.filter(user=notification.recipient, is_active=True)
        if not subs.exists():
            raise ProviderError("No active push subscriptions")
        payload = json.dumps(
            {
                "title": notification.title,
                "body": notification.body,
                "category": notification.category,
                "data": {**notification.data, "notification_id": str(notification.id), "url": _url_for(notification)},
            }
        )
        delivered = 0
        for sub in subs:
            try:
                webpush(
                    subscription_info={"endpoint": sub.endpoint, "keys": {"p256dh": sub.p256dh, "auth": sub.auth}},
                    data=payload,
                    vapid_private_key=settings.VAPID_PRIVATE_KEY,
                    vapid_claims={"sub": f"mailto:{settings.VAPID_ADMIN_EMAIL}"},
                    ttl=600,
                )
                sub.last_used_at = timezone.now()
                sub.failure_count = 0
                sub.save(update_fields=["last_used_at", "failure_count"])
                delivered += 1
            except WebPushException as exc:
                status_code = getattr(getattr(exc, "response", None), "status_code", None)
                sub.failure_count += 1
                if status_code in (404, 410) or sub.failure_count >= 5:
                    sub.is_active = False
                sub.save(update_fields=["failure_count", "is_active"])
                logger.warning("Push failed for %s: %s", sub.endpoint[:40], exc)
        if delivered == 0:
            raise ProviderError("All push subscriptions failed")
        return f"push:{delivered}"


def _url_for(notification) -> str:
    cat = notification.category
    if cat in ("ARRIVAL_SOON", "ETA_CHANGED", "TRIP_STARTED", "TRIP_DELAY", "BOARDED", "DROPPED", "NO_SHOW", "SCHOOL_ARRIVAL"):
        return "/parent/track"
    if cat in ("FEE_DUE", "FEE_OVERDUE", "PAYMENT_RECEIVED"):
        return "/parent/fees"
    if cat in ("INCIDENT", "GPS_STALE"):
        return "/school/incidents"
    return "/parent/notifications"


_REGISTRY = {
    "console": ConsoleSMSProvider,
    "console_whatsapp": ConsoleWhatsAppProvider,
}


def _load(path_or_name: str, default):
    if not path_or_name or path_or_name == "console":
        return default()
    if path_or_name in _REGISTRY:
        return _REGISTRY[path_or_name]()
    from django.utils.module_loading import import_string

    return import_string(path_or_name)()


def get_provider(channel: str):
    from .models import Channel

    if channel == Channel.EMAIL:
        return EmailProvider()
    if channel == Channel.PUSH:
        return WebPushProvider()
    if channel == Channel.SMS:
        return _load(settings.SMS_PROVIDER, ConsoleSMSProvider)
    if channel == Channel.WHATSAPP:
        return _load(settings.WHATSAPP_PROVIDER, ConsoleWhatsAppProvider)
    return None
