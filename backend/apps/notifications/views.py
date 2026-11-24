from __future__ import annotations

from django.utils import timezone
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from drf_spectacular.utils import extend_schema as _extend_schema
from rest_framework import generics, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.audit import record_audit
from apps.core.permissions import HasSchoolPerm
from apps.core.roles import Perm
from apps.core.tenancy import resolve_tenant

from . import services
from .models import Notification, PushSubscription
from .serializers import (
    NotificationPreferenceSerializer,
    NotificationSerializer,
    PushSubscribeSerializer,
    PushSubscriptionSerializer,
    SendNotificationSerializer,
)


class MyNotificationViewSet(viewsets.ReadOnlyModelViewSet):
    """The caller's own notification centre."""

    permission_classes = [IsAuthenticated]
    serializer_class = NotificationSerializer
    filterset_fields = ["is_read", "category"]

    def get_queryset(self):
        qs = Notification.objects.filter(recipient=self.request.user).select_related("student").prefetch_related("deliveries")
        ctx = resolve_tenant(self.request)
        if ctx.school is not None and not ctx.is_platform_admin:
            qs = qs.filter(school=ctx.school)
        return qs

    @action(detail=True, methods=["post"])
    def read(self, request, pk=None):
        n = self.get_object()
        if not n.is_read:
            n.is_read = True
            n.read_at = timezone.now()
            n.save(update_fields=["is_read", "read_at"])
        return Response(self.get_serializer(n).data)

    @action(detail=False, methods=["post"], url_path="read-all")
    def read_all(self, request):
        updated = self.get_queryset().filter(is_read=False).update(is_read=True, read_at=timezone.now())
        return Response({"updated": updated})

    @action(detail=False, methods=["get"], url_path="unread-count")
    def unread_count(self, request):
        return Response({"unread": self.get_queryset().filter(is_read=False).count()})


class PreferenceView(generics.RetrieveUpdateAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = NotificationPreferenceSerializer

    def get_object(self):
        return services.get_or_create_preference(self.request.user)


@_extend_schema(responses={200: OpenApiTypes.OBJECT})
class PushSubscribeView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=PushSubscribeSerializer, responses=PushSubscriptionSerializer)
    def post(self, request):
        ser = PushSubscribeSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        d = ser.validated_data
        sub, _ = PushSubscription.objects.update_or_create(
            endpoint=d["endpoint"],
            defaults={
                "user": request.user,
                "p256dh": d["keys"]["p256dh"],
                "auth": d["keys"]["auth"],
                "user_agent": d.get("user_agent", "")[:255],
                "is_active": True,
                "failure_count": 0,
            },
        )
        return Response(PushSubscriptionSerializer(sub).data, status=status.HTTP_201_CREATED)

    def delete(self, request):
        endpoint = request.data.get("endpoint")
        deleted, _ = PushSubscription.objects.filter(user=request.user, endpoint=endpoint).delete()
        return Response({"deleted": deleted})

    def get(self, request):
        return Response(PushSubscriptionSerializer(PushSubscription.objects.filter(user=request.user), many=True).data)


class SchoolNotificationHistoryViewSet(viewsets.ReadOnlyModelViewSet):
    """Audit view of everything the school has sent, with delivery status."""

    permission_classes = [HasSchoolPerm]
    required_perms = Perm.ENGAGEMENT_VIEW
    serializer_class = NotificationSerializer
    filterset_fields = ["category", "is_read", "trip", "student"]
    search_fields = ["title", "body", "recipient__email", "recipient__first_name"]

    def get_queryset(self):
        return (
            Notification.objects.filter(school=resolve_tenant(self.request).school)
            .select_related("recipient", "student")
            .prefetch_related("deliveries")
        )

    @extend_schema(request=SendNotificationSerializer)
    @action(detail=False, methods=["post"], url_path="send")
    def send(self, request):
        self.required_perms = Perm.ENGAGEMENT_MANAGE
        if not resolve_tenant(request).has_perm(Perm.ENGAGEMENT_MANAGE):
            return Response({"detail": "Permission denied.", "code": "permission_denied"}, status=403)
        school = resolve_tenant(request).school
        ser = SendNotificationSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        d = ser.validated_data
        from apps.people.models import Student
        from apps.schools.models import SchoolMembership

        recipients = set()
        if d["audience"] == "STAFF":
            recipients = {
                m.user
                for m in SchoolMembership.objects.filter(
                    school=school, is_active=True, role__in=["SCHOOL_ADMIN", "TRANSPORT_MANAGER", "DRIVER", "ATTENDANT"]
                ).select_related("user")
            }
        else:
            students = Student.objects.filter(school=school, status="ACTIVE")
            if d["audience"] == "ROUTE" and d.get("route"):
                students = students.filter(transport_assignments__route_id=d["route"], transport_assignments__is_active=True)
            elif d["audience"] == "STUDENTS":
                students = students.filter(id__in=d.get("students", []))
            for s in students.distinct():
                recipients.update(services.guardians_of(s))
        created = services.notify_users(school=school, recipients=list(recipients), category=d["category"], title=d["title"], body=d["body"])
        record_audit(
            action="notification.broadcast",
            request=request,
            school=school,
            changes={"audience": d["audience"], "recipients": len(created), "title": d["title"]},
        )
        return Response({"sent": len(created)}, status=201)
