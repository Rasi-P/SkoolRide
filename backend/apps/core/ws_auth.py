"""JWT authentication for Channels websockets.

Clients connect with `?token=<access token>`. The token is short-lived and the connection is
revalidated before messages and on heartbeats. Production access logs must redact query strings.
"""

from __future__ import annotations

from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from channels.middleware import BaseMiddleware
from django.contrib.auth.models import AnonymousUser


@database_sync_to_async
def _get_user(token: str):
    from rest_framework.exceptions import AuthenticationFailed
    from rest_framework_simplejwt.authentication import JWTAuthentication
    from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
    from rest_framework_simplejwt.tokens import AccessToken

    try:
        validated = AccessToken(token)
        return JWTAuthentication().get_user(validated)
    except (InvalidToken, TokenError, AuthenticationFailed, KeyError):
        return AnonymousUser()


class JWTAuthMiddleware(BaseMiddleware):
    async def __call__(self, scope, receive, send):
        qs = parse_qs(scope.get("query_string", b"").decode())
        token = (qs.get("token") or [None])[0]
        scope["access_token"] = token
        scope["membership_id"] = (qs.get("membership") or [None])[0]
        scope["user"] = await _get_user(token) if token else AnonymousUser()
        return await super().__call__(scope, receive, send)
