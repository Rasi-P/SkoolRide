from __future__ import annotations

from django.conf import settings
from django.middleware.csrf import get_token
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_protect, ensure_csrf_cookie
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from drf_spectacular.utils import extend_schema as _extend_schema
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken

from apps.core.audit import record_audit

from . import services
from .models import Invitation, User
from .serializers import (
    ChangePasswordSerializer,
    InvitationAcceptSerializer,
    InvitationPublicSerializer,
    LoginSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    UserSerializer,
)
from .tokens import clear_refresh_cookie, issue_tokens, set_refresh_cookie


@method_decorator(ensure_csrf_cookie, name="dispatch")
class CsrfView(APIView):
    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    @extend_schema(responses={200: OpenApiTypes.OBJECT})
    def get(self, request):
        return Response({"csrfToken": get_token(request)})


@method_decorator(csrf_protect, name="dispatch")
class LoginView(APIView):
    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth"

    @extend_schema(request=LoginSerializer, responses=UserSerializer)
    def post(self, request):
        serializer = LoginSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data["user"]
        access, refresh = issue_tokens(user)
        user.last_login_ip = request.META.get("REMOTE_ADDR")
        user.save(update_fields=["last_login_ip"])
        record_audit(action="auth.login", request=request, actor=user, target=user)
        response = Response({"access": access, "user": UserSerializer(user, context={"request": request}).data})
        set_refresh_cookie(response, refresh)
        return response


@_extend_schema(request=None, responses={200: OpenApiTypes.OBJECT})
@method_decorator(csrf_protect, name="dispatch")
class RefreshView(APIView):
    """Rotate the refresh cookie and return a new access token."""

    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    throttle_classes = []

    def post(self, request):
        raw = request.COOKIES.get(settings.REFRESH_COOKIE_NAME) or request.data.get("refresh")
        if not raw:
            return Response({"detail": "No refresh token.", "code": "no_refresh"}, status=401)
        try:
            token = RefreshToken(raw)
            user_id = token["user_id"]
            user = User.objects.get(pk=user_id, is_active=True)
            from rest_framework_simplejwt.utils import get_md5_hash_password

            if token.get("hash_password") != get_md5_hash_password(user.password):
                raise TokenError("Password changed.")
            token.blacklist()
        except (TokenError, KeyError, User.DoesNotExist):
            response = Response({"detail": "Refresh token invalid.", "code": "invalid_refresh"}, status=401)
            clear_refresh_cookie(response)
            return response
        access, refresh = issue_tokens(user)
        response = Response({"access": access, "user": UserSerializer(user, context={"request": request}).data})
        set_refresh_cookie(response, refresh)
        return response


@_extend_schema(request=None, responses={204: None})
@method_decorator(csrf_protect, name="dispatch")
class LogoutView(APIView):
    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    throttle_classes = []

    def post(self, request):
        raw = request.COOKIES.get(settings.REFRESH_COOKIE_NAME)
        if raw:
            try:
                RefreshToken(raw).blacklist()
            except TokenError:
                pass
        response = Response(status=status.HTTP_204_NO_CONTENT)
        clear_refresh_cookie(response)
        return response


class MeView(generics.RetrieveUpdateAPIView):
    serializer_class = UserSerializer

    def get_object(self):
        return self.request.user


@_extend_schema(request=ChangePasswordSerializer, responses={200: OpenApiTypes.OBJECT})
class ChangePasswordView(APIView):
    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        request.user.set_password(serializer.validated_data["new_password"])
        request.user.must_change_password = False
        request.user.save(update_fields=["password", "must_change_password", "updated_at"])
        record_audit(action="auth.password_changed", request=request, target=request.user)
        return Response({"detail": "Password updated."})


@_extend_schema(request=PasswordResetRequestSerializer, responses={200: OpenApiTypes.OBJECT})
class PasswordResetRequestView(APIView):
    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth"

    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        services.send_password_reset_email(serializer.validated_data["email"])
        return Response({"detail": "If an account exists for that email, a reset link has been sent."})


@_extend_schema(request=PasswordResetConfirmSerializer, responses={200: OpenApiTypes.OBJECT})
class PasswordResetConfirmView(APIView):
    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth"

    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        services.confirm_password_reset(**serializer.validated_data)
        return Response({"detail": "Password has been reset. You can now sign in."})


@_extend_schema(responses={200: OpenApiTypes.OBJECT})
class InvitationDetailView(APIView):
    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    def get(self, request, token):
        invitation = Invitation.objects.select_related("school").filter(token=token).first()
        if invitation is None or not invitation.is_valid:
            return Response({"detail": "Invitation is invalid or has expired.", "code": "invalid_invitation"}, 404)
        return Response(InvitationPublicSerializer(invitation).data)


@_extend_schema(request=InvitationAcceptSerializer, responses={200: OpenApiTypes.OBJECT})
@method_decorator(csrf_protect, name="dispatch")
class InvitationAcceptView(APIView):
    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth"

    def post(self, request):
        serializer = InvitationAcceptSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = services.accept_invitation(request=request, **serializer.validated_data)
        access, refresh = issue_tokens(user)
        response = Response({"access": access, "user": UserSerializer(user, context={"request": request}).data})
        set_refresh_cookie(response, refresh)
        return response
