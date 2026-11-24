from __future__ import annotations

from django.conf import settings
from rest_framework_simplejwt.tokens import RefreshToken


def issue_tokens(user) -> tuple[str, str]:
    refresh = RefreshToken.for_user(user)
    refresh["is_platform_admin"] = user.is_platform_admin
    return str(refresh.access_token), str(refresh)


def set_refresh_cookie(response, refresh: str) -> None:
    max_age = int(settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"].total_seconds())
    response.set_cookie(
        settings.REFRESH_COOKIE_NAME,
        refresh,
        max_age=max_age,
        httponly=True,
        secure=getattr(settings, "REFRESH_COOKIE_SECURE", not settings.DEBUG),
        samesite="Lax",
        path=settings.REFRESH_COOKIE_PATH,
    )


def clear_refresh_cookie(response) -> None:
    response.delete_cookie(settings.REFRESH_COOKIE_NAME, path=settings.REFRESH_COOKIE_PATH, samesite="Lax")
