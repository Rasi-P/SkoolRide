"""Regression coverage for live access, revocation and operational boundaries."""
from datetime import timedelta

import pytest
from asgiref.sync import async_to_sync
from channels.db import database_sync_to_async
from channels.layers import get_channel_layer
from channels.routing import URLRouter
from channels.testing import WebsocketCommunicator
from django.core.management import call_command
from django.core.management.base import CommandError
from django.utils import timezone
from rest_framework_simplejwt.tokens import AccessToken

from apps.core.exceptions import DomainError
from apps.core.ws_auth import JWTAuthMiddleware
from apps.notifications.models import Notification
from apps.people.models import GuardianStudent
from apps.trips import services
from apps.trips.consumers import _can_view_trip, _school_for_staff
from apps.trips.models import Trip
from apps.trips.routing import websocket_urlpatterns
from tests.test_trips_gps_eta import make_trip

pytestmark = pytest.mark.django_db


@pytest.mark.parametrize("role", ["driver", "attendant"])
def test_operational_roles_cannot_read_school_wide_records(school_a, as_user, role):
    api = as_user(getattr(school_a, role))
    for path in ("/api/trips/trips/", "/api/trips/trips/export/", "/api/trips/boarding-events/",
                 "/api/trips/incidents/", "/api/engagement/complaints/"):
        assert api.get(path).status_code == 403, path
    assert api.get("/api/driver/home/").status_code == 200


def test_attendant_cannot_inject_gps(school_a, as_user):
    trip = make_trip(school_a)
    services.start_trip(trip=trip, user=school_a.driver)
    assert as_user(school_a.attendant).post(
        f"/api/driver/trips/{trip.id}/location/", {"latitude": 12.9, "longitude": 77.7}
    ).status_code == 403


def test_suspended_school_cannot_use_demo_simulator(school_a, as_user):
    trip = make_trip(school_a)
    school_a.school.status = "SUSPENDED"
    school_a.school.save()
    for user in (school_a.admin, school_a.driver):
        assert as_user(user).post(f"/api/demo/simulations/{trip.id}/", {"action": "start"}).status_code == 403
    trip.refresh_from_db()
    assert trip.status == "SCHEDULED"


def test_withdrawn_assignment_revokes_live_http_access_and_arrival_alerts(school_a, as_user):
    trip = make_trip(school_a)
    services.start_trip(trip=trip, user=school_a.driver)
    student = school_a.students[0]
    student.transport_assignments.update(is_active=False)
    api = as_user(school_a.parent)
    assert api.get(f"/api/parent/children/{student.id}/live/?trip={trip.id}").status_code == 404
    point = services.record_location(trip=trip, data={"latitude": 13.012, "longitude": 77.77, "speed_mps": 8})
    services.process_location(trip, point)
    assert not Notification.objects.filter(student=student, category="ARRIVAL_SOON").exists()


@pytest.mark.django_db(transaction=True)
def test_socket_assignments_and_school_map_permissions(school_a, school_b):
    trip = make_trip(school_a, driver=school_a.driver_profile)
    check = async_to_sync(_can_view_trip)
    assert check(school_a.driver, trip.id) is not None
    # An active membership in this school is insufficient if the trip assignment changes.
    Trip.objects.filter(pk=trip.pk).update(driver=None, attendant=None, vehicle=None)
    assert check(school_a.driver, trip.id) is None
    assert check(school_a.attendant, trip.id) is None
    assert check(school_b.parent, trip.id) is None
    assert async_to_sync(_school_for_staff)(school_a.driver, school_a.school.id) is None
    assert async_to_sync(_school_for_staff)(school_a.admin, school_a.school.id) is not None


@pytest.mark.django_db(transaction=True)
def test_parent_socket_filters_other_children_and_rechecks_membership(school_a):
    trip = make_trip(school_a)
    own, other = school_a.students
    GuardianStudent.objects.filter(parent=school_a.parent_profile, student=other).delete()
    token = str(AccessToken.for_user(school_a.parent))

    async def scenario():
        socket = WebsocketCommunicator(JWTAuthMiddleware(URLRouter(websocket_urlpatterns)), f"/ws/trips/{trip.id}/?token={token}")
        try:
            connected, _ = await socket.connect()
            assert connected
            snapshot = await socket.receive_json_from()
            assert "expected_students" not in snapshot["payload"]
            layer = get_channel_layer()
            for student in (other, own):
                await layer.group_send(f"trip_{trip.id}", {
                    "type": "trip.message", "event": "student", "trip_id": str(trip.id),
                    "payload": {"student_id": str(student.id), "status": "BOARDED"},
                })
            received = await socket.receive_json_from()
            assert received["payload"]["student_id"] == str(own.id)
            await database_sync_to_async(school_a.parent_profile.membership.__class__.objects.filter(
                pk=school_a.parent_profile.membership_id
            ).update)(is_active=False)
            await socket.send_json_to({"type": "ping"})
            assert (await socket.receive_output())["code"] == 4403
        finally:
            await socket.disconnect()

    async_to_sync(scenario)()


@pytest.mark.django_db(transaction=True)
def test_socket_closes_when_token_expires(school_a):
    trip = make_trip(school_a)
    token = AccessToken.for_user(school_a.parent)

    async def scenario():
        socket = WebsocketCommunicator(JWTAuthMiddleware(URLRouter(websocket_urlpatterns)), f"/ws/trips/{trip.id}/?token={token}")
        try:
            assert (await socket.connect())[0]
            await socket.receive_json_from()
            # Move JWT validation's clock past this token's expiry without waiting twenty minutes.
            from unittest.mock import patch
            expired = timezone.now() + timedelta(hours=1)
            with patch("rest_framework_simplejwt.tokens.aware_utcnow", return_value=expired):
                await socket.send_json_to({"type": "ping"})
                assert (await socket.receive_output())["code"] == 4401
        finally:
            await socket.disconnect()

    async_to_sync(scenario)()


@pytest.mark.parametrize("field,value", [("latitude", float("nan")), ("accuracy_m", float("inf")),
                                        ("accuracy_m", -1), ("heading", 360), ("speed_mps", float("nan"))])
def test_invalid_gps_measurements_rejected(field, value):
    with pytest.raises(DomainError):
        services.validate_location({"latitude": 12.9, "longitude": 77.7, field: value})


def test_naive_timestamp_is_normalized_to_utc():
    result = services.validate_location({"latitude": 12.9, "longitude": 77.7, "recorded_at": timezone.now().replace(tzinfo=None).isoformat()})
    assert timezone.is_aware(result["recorded_at"])


def test_dropoff_alert_reaches_boarded_child_once(school_a):
    trip = make_trip(school_a, direction="DROPOFF")
    services.start_trip(trip=trip, user=school_a.driver)
    ts = trip.trip_students.get(student=school_a.students[0])
    services.mark_student(trip=trip, trip_student=ts, event_type="BOARDED", user=school_a.driver)
    stop = school_a.stops[-1]
    point = services.record_location(trip=trip, data={"latitude": float(stop.latitude), "longitude": float(stop.longitude), "speed_mps": 20})
    services.process_location(trip, point)
    services.process_location(trip, point)
    assert Notification.objects.filter(student=ts.student, category="ARRIVAL_SOON").count() == 1


def test_stale_eta_is_not_returned_as_current(school_a, as_user):
    trip = make_trip(school_a)
    services.start_trip(trip=trip, user=school_a.driver)
    point = services.record_location(trip=trip, data={"latitude": 13.012, "longitude": 77.77, "speed_mps": 8})
    services.process_location(trip, point)
    Trip.objects.filter(pk=trip.pk).update(last_location_at=timezone.now() - timedelta(minutes=10))
    response = as_user(school_a.parent).get(f"/api/parent/children/{school_a.students[0].id}/live/?trip={trip.id}")
    assert response.data["stale"] is True
    assert response.data["eta"] is None
    assert response["Cache-Control"] == "no-store, private"


def test_seed_preserves_existing_data_without_explicit_reset(school_a):
    with pytest.raises(CommandError, match="not empty"):
        call_command("seed_demo_data")
    assert school_a.school.__class__.objects.filter(pk=school_a.school.pk).exists()
    with pytest.raises(CommandError, match="Confirm explicitly"):
        call_command("seed_demo_data", reset=True)


def test_demo_commands_refuse_non_demo_environment(settings):
    settings.DEMO_MODE = False
    for command in ("seed_demo_data", "reset_demo_data"):
        with pytest.raises(CommandError, match="DEMO_MODE is off"):
            call_command(command)


def test_trip_capacity_and_cross_school_staff_are_validated(school_a, school_b):
    with pytest.raises(DomainError, match="belong to this school"):
        make_trip(school_a, driver=school_b.driver_profile)
    school_a.vehicle.capacity = 1
    school_a.vehicle.save()
    with pytest.raises(DomainError, match="accommodate"):
        make_trip(school_a)


def test_cookie_auth_requires_csrf_and_untrusted_origins_are_rejected(school_a):
    from rest_framework.test import APIClient

    api = APIClient(enforce_csrf_checks=True)
    body = {"email": school_a.admin.email, "password": "Test@12345"}
    assert api.post("/api/auth/login/", body).status_code == 403
    csrf = api.get("/api/auth/csrf/").data["csrfToken"]
    api.credentials(HTTP_X_CSRFTOKEN=csrf)
    assert api.post("/api/auth/login/", body, HTTP_ORIGIN="https://untrusted.example").status_code == 403
    assert api.post("/api/auth/login/", body).status_code == 200
    api.credentials()
    assert api.post("/api/auth/refresh/").status_code == 403
    api.credentials(HTTP_X_CSRFTOKEN=csrf)
    assert api.post("/api/auth/refresh/").status_code == 200


def test_password_change_revokes_existing_access_and_refresh(school_a):
    from rest_framework.test import APIClient

    from apps.accounts.tokens import issue_tokens
    access, refresh = issue_tokens(school_a.admin)
    school_a.admin.set_password("Replacement@123")
    school_a.admin.save()
    api = APIClient()
    api.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
    assert api.get("/api/auth/me/").status_code == 401
    api.credentials()
    assert api.post("/api/auth/refresh/", {"refresh": refresh}).status_code == 401


def test_invitation_cannot_reset_an_existing_users_password(school_a, school_b):
    from apps.accounts.models import Invitation
    from apps.accounts.services import accept_invitation

    invitation = Invitation.objects.create(school=school_b.school, email=school_a.admin.email, role="SCHOOL_ADMIN")
    before = school_a.admin.password
    with pytest.raises(DomainError, match="existing account password"):
        accept_invitation(token=invitation.token, password="Attacker@123")
    school_a.admin.refresh_from_db()
    assert school_a.admin.password == before
    user = accept_invitation(token=invitation.token, current_password="Test@12345")
    assert user.id == school_a.admin.id
    assert user.password == before
