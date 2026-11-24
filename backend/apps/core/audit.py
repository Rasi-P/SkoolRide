from __future__ import annotations

from typing import Any

from .models import AuditLog


def _client_ip(request) -> str | None:
    if request is None:
        return None
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


def record_audit(
    *,
    action: str,
    request=None,
    actor=None,
    school=None,
    target: Any = None,
    changes: dict | None = None,
) -> AuditLog:
    """Write an audit entry. Pass `request` when available so IP/request id are captured."""
    user = actor
    if user is None and request is not None and getattr(request, "user", None) is not None:
        user = request.user if request.user.is_authenticated else None
    target_type = ""
    target_id = ""
    target_repr = ""
    if target is not None:
        target_type = target.__class__.__name__
        target_id = str(getattr(target, "pk", ""))
        target_repr = str(target)[:255]
    if school is None and target is not None:
        school = getattr(target, "school", None)
    return AuditLog.objects.create(
        school=school,
        actor=user,
        actor_email=getattr(user, "email", "") or "",
        action=action,
        target_type=target_type,
        target_id=target_id,
        target_repr=target_repr,
        changes=changes or {},
        ip_address=_client_ip(request),
        request_id=getattr(request, "request_id", "") if request is not None else "",
    )
