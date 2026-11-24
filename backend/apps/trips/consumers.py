"""Live channels enforce current membership, assignment and token validity on every send."""

from __future__ import annotations

import asyncio
from contextlib import suppress

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer

from apps.core.roles import MANAGEMENT_ROLES

from .access import assigned_trips, authorized_child_trips


def _current_user(user):
    from apps.accounts.models import User

    return User.objects.filter(pk=user.pk, is_active=True).first() if user.is_authenticated else None


@database_sync_to_async
def _can_view_trip(user, trip_id, membership_id=None):
    from apps.schools.models import SchoolMembership

    from .models import Trip, TripStudent

    user = _current_user(user)
    trip = Trip.objects.select_related("school").filter(pk=trip_id).first()
    if user is None or trip is None or not trip.school.is_operational:
        return None
    if user.is_platform_admin:
        trip.viewer_role = "PLATFORM_ADMIN"
        return trip
    memberships = SchoolMembership.objects.filter(user=user, school=trip.school, is_active=True)
    if membership_id:
        memberships = memberships.filter(pk=membership_id)
    m = memberships.order_by("-is_primary", "created_at").first()
    if m is None:
        return None
    trip.viewer_role = m.role
    if m.role in MANAGEMENT_ROLES:
        return trip
    if m.role in ("DRIVER", "ATTENDANT"):
        staff = getattr(m, "staff_profile", None)
        return trip if assigned_trips(staff).filter(pk=trip.pk).exists() else None
    parent = getattr(m, "parent_profile", None) if m.role == "PARENT" else None
    if parent is not None and parent.status != "SUSPENDED":
        rows = authorized_child_trips(TripStudent.objects.filter(
            school=trip.school, trip=trip, student__guardian_links__parent=parent
        ))
        trip.viewer_student_ids = {str(s) for s in rows.values_list("student_id", flat=True)}
        trip.viewer_stop_ids = {str(s) for s in rows.values_list("trip_stop_id", flat=True)}
        if trip.viewer_student_ids:
            return trip
    return None


def _parent_payload(trip, event, payload):
    if getattr(trip, "viewer_role", None) != "PARENT":
        return payload
    if event == "student":
        return payload if payload.get("student_id") in trip.viewer_student_ids else None
    if event in ("snapshot", "status"):
        allowed = {"id", "status", "direction", "route_code", "route_name", "vehicle_registration", "delay_minutes",
                   "last_location_at", "started_at", "ended_at", "is_simulated", "next_stop", "location", "stale"}
        return {k: v for k, v in payload.items() if k in allowed}
    if event == "location":
        return {**payload, "etas": [e for e in payload.get("etas", []) if e["trip_stop_id"] in trip.viewer_stop_ids]}
    if event in ("stop", "stale"):
        return payload
    if event == "emergency":
        return {"title": "An emergency was reported on this trip. Contact the transport office."}
    # Operational notes can contain information about other children.
    return None


@database_sync_to_async
def _trip_state(trip):
    from .models import VehicleLocation
    from .serializers import TripLiveSerializer

    data = TripLiveSerializer(trip).data
    loc = VehicleLocation.objects.filter(trip=trip).first() if trip.is_active else None
    data["location"] = {
        "latitude": loc.latitude, "longitude": loc.longitude, "speed_mps": loc.speed_mps,
        "heading": loc.heading, "recorded_at": loc.recorded_at.isoformat(), "is_simulated": loc.is_simulated,
    } if loc else None
    data["stale"] = trip.gps_is_stale() if trip.is_active else None
    return _parent_payload(trip, "snapshot", data)


@database_sync_to_async
def _school_for_staff(user, school_id):
    from apps.schools.models import School, SchoolMembership

    user = _current_user(user)
    if user is None:
        return None
    school = School.objects.filter(pk=school_id).first()
    if school is None or not school.is_operational:
        return None
    if user.is_platform_admin or SchoolMembership.objects.filter(
        user=user, school=school, is_active=True, role__in=MANAGEMENT_ROLES
    ).exists():
        return school
    return None


class AuthorizedConsumer(AsyncJsonWebsocketConsumer):
    """Recheck before every event and heartbeat, including on otherwise idle connections."""

    async def authorize(self):
        from apps.core.ws_auth import _get_user

        token = self.scope.get("access_token")
        if token:
            self.scope["user"] = await _get_user(token)
            if not self.scope["user"].is_authenticated:
                await self.close(code=4401)
                return False
        if not await self.has_access():
            await self.close(code=4403)
            return False
        return True

    async def join(self, group):
        self.group = group
        await self.channel_layer.group_add(group, self.channel_name)
        await self.accept()
        self.access_watch = asyncio.create_task(self.watch_access())

    async def watch_access(self):
        while True:
            await asyncio.sleep(15)
            if not await self.authorize():
                return

    async def disconnect(self, code):
        watch = getattr(self, "access_watch", None)
        if watch:
            watch.cancel()
            with suppress(asyncio.CancelledError):
                await watch
        if hasattr(self, "group"):
            await self.channel_layer.group_discard(self.group, self.channel_name)

    async def receive_json(self, content, **kwargs):
        if await self.authorize() and isinstance(content, dict) and content.get("type") == "ping":
            await self.send_json({"event": "pong"})


class TripConsumer(AuthorizedConsumer):
    async def has_access(self):
        self.trip = await _can_view_trip(self.scope["user"], self.trip_id, self.scope.get("membership_id"))
        return self.trip is not None

    async def connect(self):
        self.trip_id = self.scope["url_route"]["kwargs"]["trip_id"]
        if not await self.authorize():
            return
        await self.join(f"trip_{self.trip_id}")
        await self.send_json({"event": "snapshot", "trip_id": str(self.trip_id), "payload": await _trip_state(self.trip)})

    async def trip_message(self, message):
        if not await self.authorize():
            return
        payload = _parent_payload(self.trip, message["event"], message["payload"])
        if payload is not None:
            await self.send_json({"event": message["event"], "trip_id": message["trip_id"], "payload": payload})


class SchoolLiveConsumer(AuthorizedConsumer):
    async def has_access(self):
        return await _school_for_staff(self.scope["user"], self.school_id) is not None

    async def connect(self):
        self.school_id = self.scope["url_route"]["kwargs"]["school_id"]
        if not await self.authorize():
            return
        await self.join(f"school_{self.school_id}_live")
        await self.send_json({"event": "connected", "school_id": str(self.school_id)})

    async def trip_message(self, message):
        if await self.authorize():
            await self.send_json({"event": message["event"], "trip_id": message["trip_id"], "payload": message["payload"]})


@database_sync_to_async
def _notification_allowed(user, notification_id):
    from apps.notifications.models import Notification
    from apps.schools.models import SchoolMembership

    n = Notification.objects.select_related("school").filter(pk=notification_id, recipient=user).first()
    if n is None:
        return False
    if n.school_id is None:
        return True
    if not n.school.is_operational:
        return False
    m = SchoolMembership.objects.filter(user=user, school=n.school, is_active=True).first()
    if user.is_platform_admin:
        return True
    if m is None:
        return False
    if m.role == "PARENT":
        parent = getattr(m, "parent_profile", None)
        return bool(parent and parent.status != "SUSPENDED" and (
            n.student_id is None or parent.guardian_links.filter(student_id=n.student_id).exists()
        ))
    return True


class UserNotificationConsumer(AuthorizedConsumer):
    async def has_access(self):
        return await database_sync_to_async(_current_user)(self.scope["user"]) is not None

    async def connect(self):
        if not await self.authorize():
            return
        await self.join(f"user_{self.scope['user'].id}")
        await self.send_json({"event": "connected"})

    async def trip_message(self, message):
        if await self.authorize() and await _notification_allowed(self.scope["user"], message["payload"].get("id")):
            await self.send_json({"event": message["event"], "trip_id": message.get("trip_id", ""), "payload": message["payload"]})
