"""Development-only demo endpoints (enabled by DEMO_MODE). Clearly labelled; never used in production."""

from __future__ import annotations

from django.conf import settings
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema as _extend_schema
from rest_framework import permissions, serializers
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.permissions import HasSchoolPerm
from apps.core.roles import Perm
from apps.core.tenancy import resolve_tenant
from apps.trips.access import assigned_trips
from apps.trips.models import Trip
from apps.trips.serializers import TripDetailSerializer
from apps.trips.views import trip_queryset

from . import simulator
from .models import DemoSimulation


class DemoOnly(permissions.BasePermission):
    message = "Demo mode is disabled."

    def has_permission(self, request, view):
        return bool(settings.DEMO_MODE)


class StartSimulationSerializer(serializers.Serializer):
    speed_mps = serializers.FloatField(required=False, default=8.0, min_value=1, max_value=30)
    auto_board = serializers.BooleanField(required=False, default=True)
    auto_complete = serializers.BooleanField(required=False, default=True)
    start_offset_m = serializers.FloatField(required=False, default=0.0, min_value=0)


@_extend_schema(request=OpenApiTypes.OBJECT, responses={200: OpenApiTypes.OBJECT})
class SimulationView(APIView):
    """Start/stop/tick the simulator for a trip the caller can manage (school staff, or the trip's driver)."""

    permission_classes = [DemoOnly, permissions.IsAuthenticated]

    def _trip(self, request, trip_id) -> Trip:
        ctx = resolve_tenant(request)
        if ctx.school and not ctx.school.is_operational:
            raise PermissionDenied("This school is not active.")
        qs = trip_queryset()
        if ctx.is_platform_admin:
            trip = qs.filter(pk=trip_id).first()
        elif ctx.membership and ctx.has_perm(Perm.TRIPS_MANAGE):
            trip = qs.filter(pk=trip_id, school=ctx.school).first()
        elif ctx.membership and ctx.membership.role in ("DRIVER", "ATTENDANT"):
            staff = getattr(ctx.membership, "staff_profile", None)
            trip = assigned_trips(staff, qs).filter(pk=trip_id, school=ctx.school).first()
        else:
            trip = None
        if trip is None:
            raise NotFound("Trip not found.")
        return trip

    def get(self, request, trip_id):
        trip = self._trip(request, trip_id)
        sim = DemoSimulation.objects.filter(trip=trip).first()
        return Response(self._payload(sim, trip))

    def post(self, request, trip_id):
        trip = self._trip(request, trip_id)
        action = request.data.get("action", "start")
        if action == "start":
            ser = StartSimulationSerializer(data=request.data)
            ser.is_valid(raise_exception=True)
            sim = simulator.start_simulation(trip=trip, user=request.user, **ser.validated_data)
        elif action == "stop":
            sim = simulator.stop_simulation(trip=trip)
        elif action == "tick":
            sim = DemoSimulation.objects.filter(trip=trip).first()
            if sim:
                simulator.tick(sim)
        else:
            return Response({"detail": "Unknown action.", "code": "bad_action"}, status=400)
        trip = trip_queryset().get(pk=trip.pk)
        return Response(self._payload(sim, trip))

    def _payload(self, sim, trip):
        return {
            "simulated": True,
            "label": "SIMULATED GPS FEED - development demo only",
            "simulation": {
                "is_running": sim.is_running,
                "progress_m": sim.progress_m,
                "speed_mps": sim.speed_mps,
                "auto_board": sim.auto_board,
                "auto_complete": sim.auto_complete,
                "last_tick_at": sim.last_tick_at,
            }
            if sim
            else None,
            "trip": TripDetailSerializer(trip).data,
            "celery_beat_required": not settings.CELERY_TASK_ALWAYS_EAGER,
        }


@_extend_schema(responses={200: OpenApiTypes.OBJECT})
class DemoStatusView(APIView):
    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    def get(self, request):
        return Response({"demo_mode": settings.DEMO_MODE, "payment_gateway": settings.PAYMENT_GATEWAY})


@_extend_schema(responses={200: OpenApiTypes.OBJECT})
class DemoTripListView(APIView):
    """Running simulations in the caller's school (for the admin demo panel)."""

    permission_classes = [DemoOnly, HasSchoolPerm]
    required_perms = Perm.TRIPS_VIEW

    def get(self, request):
        school = resolve_tenant(request).school
        sims = DemoSimulation.objects.filter(trip__school=school, is_running=True).select_related("trip__route")
        return Response([{"trip_id": str(s.trip_id), "route": s.trip.route.code, "progress_m": s.progress_m, "speed_mps": s.speed_mps} for s in sims])
