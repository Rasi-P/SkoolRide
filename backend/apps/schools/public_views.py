from __future__ import annotations

from django.conf import settings
from django.core.mail import send_mail
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema as _extend_schema
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.core.audit import record_audit

from .models import SchoolApplication, SubscriptionPlan
from .serializers import (
    SchoolApplicationPublicSerializer,
    SchoolApplicationStatusSerializer,
    SubscriptionPlanSerializer,
)


class PublicPlansView(generics.ListAPIView):
    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    serializer_class = SubscriptionPlanSerializer
    queryset = SubscriptionPlan.objects.filter(is_active=True)
    pagination_class = None


@_extend_schema(request=SchoolApplicationPublicSerializer, responses={200: OpenApiTypes.OBJECT})
class SchoolRegistrationView(APIView):
    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "registration"

    def post(self, request):
        ser = SchoolApplicationPublicSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        application = ser.save()
        record_audit(action="application.submitted", request=request, target=application)
        send_mail(
            "SchoolBus Pro application received",
            f"Thank you for applying. Your tracking code is {application.tracking_code}.\n"
            f"Track your application at {settings.FRONTEND_URL}/register/status/{application.tracking_code}",
            settings.DEFAULT_FROM_EMAIL,
            [application.contact_email],
        )
        return Response(SchoolApplicationStatusSerializer(application).data, status=status.HTTP_201_CREATED)


@_extend_schema(responses={200: OpenApiTypes.OBJECT})
class ApplicationStatusView(APIView):
    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    def get(self, request, tracking_code):
        app = SchoolApplication.objects.filter(tracking_code=tracking_code.upper()).first()
        if app is None:
            return Response({"detail": "Application not found.", "code": "not_found"}, status=404)
        return Response(SchoolApplicationStatusSerializer(app).data)


@_extend_schema(responses={200: OpenApiTypes.OBJECT})
class PublicConfigView(APIView):
    """Non-sensitive runtime configuration for the frontend (demo mode flag, VAPID key)."""

    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    throttle_classes = []

    def get(self, request):
        return Response(
            {
                "demo_mode": settings.DEMO_MODE,
                "vapid_public_key": settings.VAPID_PUBLIC_KEY or None,
                "driver_location_interval_seconds": settings.DRIVER_LOCATION_INTERVAL_SECONDS,
                "payment_gateway": settings.PAYMENT_GATEWAY,
            }
        )
