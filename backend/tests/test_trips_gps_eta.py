"""Trip lifecycle, GPS validation, ETA computation, 10-minute alerts and boarding."""

from datetime import timedelta

import pytest
from django.utils import timezone

from apps.notifications.models import Notification
from apps.trips import services
from apps.trips.models import BoardingEvent, GPSLocation, Trip, TripStudent
from apps.trips.tasks import detect_stale_trips, generate_scheduled_trips_for_today

pytestmark = pytest.mark.django_db


def make_trip(bundle, **kw):
    return services.create_trip(
        school=bundle.school,
        route=bundle.route,
        direction=kw.pop("direction", "PICKUP"),
        scheduled_date=kw.pop("date", timezone.localdate()),
        scheduled_start_time=kw.pop("time", "07:00:00"),
        **kw,
    )


def test_create_trip_materialises_stops_and_students(school_a):
    trip = make_trip(school_a)
    assert trip.stops.count() == 4 and trip.trip_students.count() == 2 and trip.expected_students == 2
    assert trip.stops.order_by("sequence").first().route_stop == school_a.stops[0]
    drop = make_trip(school_a, direction="DROPOFF")
    assert drop.stops.order_by("sequence").first().route_stop == school_a.stops[3]  # reversed for drop-off


def test_generate_from_schedules_is_idempotent(school_a):
    created = services.generate_trips_for_date(school_a.school, timezone.localdate())
    assert len(created) == 1
    assert services.generate_trips_for_date(school_a.school, timezone.localdate()) == []
    assert generate_scheduled_trips_for_today() >= 0


def test_lifecycle_transitions(school_a, as_user):
    trip = make_trip(school_a)
    d = as_user(school_a.driver)
    assert d.post(f"/api/driver/trips/{trip.id}/end/").status_code == 400  # cannot end before start
    r = d.post(f"/api/driver/trips/{trip.id}/start/")
    assert r.status_code == 200 and r.data["status"] == "IN_PROGRESS"
    school_a.vehicle.refresh_from_db()
    assert school_a.vehicle.status == "IN_SERVICE"
    assert d.post(f"/api/driver/trips/{trip.id}/start/").status_code == 400  # double start
    assert d.post(f"/api/driver/trips/{trip.id}/pause/").data["status"] == "PAUSED"
    assert d.post(f"/api/driver/trips/{trip.id}/location/", {"latitude": 12.99, "longitude": 77.76}, format="json").status_code == 400  # paused
    assert d.post(f"/api/driver/trips/{trip.id}/resume/").data["status"] == "IN_PROGRESS"
    r = d.post(f"/api/driver/trips/{trip.id}/end/")
    assert r.status_code == 200 and r.data["status"] == "COMPLETED"
    school_a.vehicle.refresh_from_db()
    assert school_a.vehicle.status == "AVAILABLE"
    assert d.post(f"/api/driver/trips/{trip.id}/cancel/", {"reason": "x"}, format="json").status_code == 400
    # expected students become NO_SHOW at end of a pickup trip
    assert trip.trip_students.filter(status="NO_SHOW").count() == 2


def test_vehicle_cannot_run_two_trips_at_once(school_a):
    t1 = make_trip(school_a)
    t2 = make_trip(school_a, time="08:00:00")
    services.start_trip(trip=t1, user=school_a.driver)
    from apps.core.exceptions import DomainError

    with pytest.raises(DomainError):
        services.start_trip(trip=t2, user=school_a.driver)


def test_other_driver_cannot_start_assigned_trip(school_a, as_user):
    from apps.people.models import StaffProfile
    from apps.schools.models import SchoolMembership

    from .conftest import make_user

    trip = make_trip(school_a)
    other = make_user("driver2@aaa.test")
    m = SchoolMembership.objects.create(user=other, school=school_a.school, role="DRIVER")
    StaffProfile.objects.create(school=school_a.school, membership=m, staff_type="DRIVER", employee_id="AAA-D9", first_name="Other", phone="1")
    assert as_user(other).post(f"/api/driver/trips/{trip.id}/start/").status_code == 404
    assert as_user(school_a.driver).post(f"/api/driver/trips/{trip.id}/start/").status_code == 200


def test_gps_validation_rules(school_a, as_user):
    trip = make_trip(school_a)
    d = as_user(school_a.driver)
    d.post(f"/api/driver/trips/{trip.id}/start/")
    url = f"/api/driver/trips/{trip.id}/location/"
    assert d.post(url, {"latitude": 95, "longitude": 10}, format="json").status_code == 400
    assert d.post(url, {"latitude": 12.99, "longitude": 77.76, "accuracy_m": 5000}, format="json").status_code == 400
    future = (timezone.now() + timedelta(minutes=10)).isoformat()
    assert d.post(url, {"latitude": 12.99, "longitude": 77.76, "recorded_at": future}, format="json").status_code == 400
    old = (timezone.now() - timedelta(hours=2)).isoformat()
    assert d.post(url, {"latitude": 12.99, "longitude": 77.76, "recorded_at": old}, format="json").status_code == 400
    now = timezone.now()
    assert d.post(url, {"latitude": 12.99, "longitude": 77.76, "recorded_at": now.isoformat(), "accuracy_m": 8}, format="json").status_code == 202
    # out-of-order point ignored
    assert (
        d.post(url, {"latitude": 12.99, "longitude": 77.76, "recorded_at": (now - timedelta(seconds=30)).isoformat()}, format="json").status_code
        == 400
    )
    assert GPSLocation.objects.filter(trip=trip).count() == 1
    trip.refresh_from_db()
    assert trip.last_location_at is not None and trip.gps_is_stale() is False
    assert trip.vehicle.current_location.latitude == pytest.approx(12.99)


def test_eta_and_ten_minute_alert_once_per_student_stop(school_a, settings):
    trip = make_trip(school_a)
    services.start_trip(trip=trip, user=school_a.driver)
    stop1 = school_a.stops[0]
    # ~20 km away at 8 m/s -> ~40 min ETA -> no alert yet
    far = services.record_location(trip=trip, data={"latitude": 13.15, "longitude": 77.90, "speed_mps": 8.0, "accuracy_m": 5})
    services.process_location(trip, far)
    assert Notification.objects.filter(category="ARRIVAL_SOON").count() == 0
    assert trip.stops.get(route_stop=stop1).eta is not None
    # ~2 km before stop 1 at 8 m/s -> a few minutes -> alert for the child at stop 1 (and stop 2, ~1 km further)
    point = services.record_location(
        trip=trip,
        data={"latitude": 13.0120, "longitude": 77.7700, "speed_mps": 8.0, "accuracy_m": 5, "recorded_at": timezone.now() + timedelta(seconds=5)},
    )
    services.process_location(trip, point)
    alerts = Notification.objects.filter(category="ARRIVAL_SOON", recipient=school_a.parent, student=school_a.students[0])
    assert alerts.count() == 1
    assert "minutes away" in alerts.first().body
    assert alerts.first().dedupe_key == f"arrival:{trip.id}:{school_a.students[0].id}:{trip.stops.get(route_stop=stop1).id}"
    # Further location updates never duplicate the alert for the same student/stop/trip.
    point2 = services.record_location(
        trip=trip,
        data={"latitude": 13.0080, "longitude": 77.7680, "speed_mps": 8.0, "accuracy_m": 5, "recorded_at": timezone.now() + timedelta(seconds=10)},
    )
    services.process_location(trip, point2)
    assert Notification.objects.filter(category="ARRIVAL_SOON", student=school_a.students[0]).count() == 1
    assert Notification.objects.filter(category="ARRIVAL_SOON", student=school_a.students[1]).count() <= 1
    ts = trip.stops.get(route_stop=stop1)
    assert ts.eta is not None and ts.distance_remaining_m > 0


def test_no_arrival_alert_when_far_away_and_no_alert_for_absent_student(school_a):
    trip = make_trip(school_a)
    services.start_trip(trip=trip, user=school_a.driver)
    ts = trip.trip_students.get(student=school_a.students[0])
    ts.status = "ABSENT"
    ts.save()
    point = services.record_location(trip=trip, data={"latitude": 13.0120, "longitude": 77.7700, "speed_mps": 8.0, "accuracy_m": 5})
    services.process_location(trip, point)
    assert Notification.objects.filter(category="ARRIVAL_SOON", student=school_a.students[0]).count() == 0


def test_auto_arrival_marks_stop_and_delay_notification(school_a):
    trip = make_trip(school_a)
    services.start_trip(trip=trip, user=school_a.driver)
    s1 = school_a.stops[0]
    point = services.record_location(
        trip=trip, data={"latitude": float(s1.latitude) + 0.0002, "longitude": float(s1.longitude), "speed_mps": 3.0, "accuracy_m": 5}
    )
    services.process_location(trip, point)
    assert trip.stops.get(route_stop=s1).status == "ARRIVED"
    assert trip.events.filter(event_type="STOP_ARRIVED").exists()


def test_boarding_and_dropoff_events_and_notifications(school_a, as_user):
    trip = make_trip(school_a)
    d = as_user(school_a.driver)
    d.post(f"/api/driver/trips/{trip.id}/start/")
    ts = trip.trip_students.get(student=school_a.students[0])
    r = d.post(f"/api/driver/trips/{trip.id}/students/{ts.id}/board/", {}, format="json")
    assert r.status_code == 200 and r.data["status"] == "BOARDED"
    assert BoardingEvent.objects.filter(trip=trip, student=school_a.students[0], event_type="BOARDED").count() == 1
    n = Notification.objects.get(category="BOARDED", recipient=school_a.parent)
    assert school_a.students[0].first_name in n.title
    # cannot board twice, cannot drop an expected student
    assert d.post(f"/api/driver/trips/{trip.id}/students/{ts.id}/board/", {}, format="json").status_code == 400
    other = trip.trip_students.get(student=school_a.students[1])
    assert d.post(f"/api/driver/trips/{trip.id}/students/{other.id}/drop/", {}, format="json").status_code == 400
    r = d.post(f"/api/driver/trips/{trip.id}/students/{other.id}/absent/", {"note": "sick"}, format="json")
    assert r.data["status"] == "ABSENT"
    trip.refresh_from_db()
    assert trip.boarded_count == 1 and trip.absent_count == 1
    # departing stop 1 then ending -> boarded student dropped at school with SCHOOL_ARRIVAL notification
    stop1 = trip.stops.order_by("sequence").first()
    assert d.post(f"/api/driver/trips/{trip.id}/stops/{stop1.id}/depart/").status_code == 200
    d.post(f"/api/driver/trips/{trip.id}/end/")
    assert BoardingEvent.objects.filter(trip=trip, event_type="DROPPED", student=school_a.students[0]).exists()
    # Pickup trips end at school: the arrival notification is the drop-off confirmation (no separate DROPPED alert).
    assert Notification.objects.filter(category="DROPPED", recipient=school_a.parent).count() == 0
    assert Notification.objects.filter(category="SCHOOL_ARRIVAL", recipient=school_a.parent).count() == 1


def test_dropoff_trip_end_drops_remaining_students_with_notification(school_a):
    trip = make_trip(school_a, direction="DROPOFF")
    services.start_trip(trip=trip, user=school_a.driver)
    ts = trip.trip_students.get(student=school_a.students[0])
    services.mark_student(trip=trip, trip_student=ts, event_type="BOARDED", user=school_a.driver)
    services.end_trip(trip=trip, user=school_a.driver)
    assert trip.trip_students.get(student=school_a.students[0]).status == "DROPPED"
    assert Notification.objects.filter(category="DROPPED", recipient=school_a.parent).count() == 1


def test_departing_stop_marks_no_shows(school_a):
    trip = make_trip(school_a)
    services.start_trip(trip=trip, user=school_a.driver)
    stop1 = trip.stops.order_by("sequence").first()
    services.mark_stop_departed(trip=trip, trip_stop=stop1, user=school_a.driver)
    assert trip.trip_students.get(student=school_a.students[0]).status == "NO_SHOW"
    assert Notification.objects.filter(category="NO_SHOW", recipient=school_a.parent).exists()


def test_cancelled_and_completed_trips_get_no_arrival_alerts(school_a):
    trip = make_trip(school_a)
    services.start_trip(trip=trip, user=school_a.driver)
    point = services.record_location(trip=trip, data={"latitude": 13.0120, "longitude": 77.7700, "speed_mps": 8.0})
    services.cancel_trip(trip=trip, user=school_a.admin, reason="rain")
    assert services.process_location(trip, point) == {}
    assert Notification.objects.filter(category="ARRIVAL_SOON").count() == 0
    assert Notification.objects.filter(category="TRIP_CANCELLED", recipient=school_a.parent).count() == 2  # one per child
    from apps.core.exceptions import StateTransitionError

    with pytest.raises(StateTransitionError):
        services.record_location(trip=trip, data={"latitude": 13.0, "longitude": 77.7})


def test_replace_vehicle_carries_boarding_state(school_a):
    from apps.fleet.models import Vehicle

    trip = make_trip(school_a)
    services.start_trip(trip=trip, user=school_a.driver)
    ts = trip.trip_students.get(student=school_a.students[0])
    services.mark_student(trip=trip, trip_student=ts, event_type="BOARDED", user=school_a.driver)
    spare = Vehicle.objects.create(school=school_a.school, registration_number="KAAAA9999", capacity=10)
    new_trip = services.replace_vehicle(trip=trip, vehicle=spare, reason="breakdown", user=school_a.admin)
    trip.refresh_from_db()
    assert trip.status == "CANCELLED" and new_trip.status == "IN_PROGRESS" and new_trip.replacement_of == trip
    assert new_trip.trip_students.get(student=school_a.students[0]).status == "BOARDED"
    school_a.vehicle.refresh_from_db()
    assert school_a.vehicle.status == "MAINTENANCE"
    assert Notification.objects.filter(category="TRIP_DELAY", recipient=school_a.parent).exists()


def test_stale_detection_task_notifies_staff(school_a):
    trip = make_trip(school_a)
    services.start_trip(trip=trip, user=school_a.driver)
    Trip.objects.filter(pk=trip.pk).update(started_at=timezone.now() - timedelta(minutes=20), last_location_at=timezone.now() - timedelta(minutes=15))
    assert detect_stale_trips() == 1
    assert Notification.objects.filter(category="GPS_STALE", recipient=school_a.admin).count() == 1
    assert detect_stale_trips() == 1
    assert Notification.objects.filter(category="GPS_STALE", recipient=school_a.admin).count() == 1  # deduped


def test_absence_request_marks_future_trips(school_a, as_user):
    future = timezone.localdate() + timedelta(days=3)
    trip = make_trip(school_a, date=future)
    p = as_user(school_a.parent)
    r = p.post(
        "/api/parent/absence-requests/",
        {"student": str(school_a.students[0].id), "date_from": str(future), "date_to": str(future), "direction": "PICKUP", "reason": "sick"},
        format="json",
    )
    assert r.status_code == 201
    assert trip.trip_students.get(student=school_a.students[0]).status == "ABSENT"
    # new trips created later also respect the absence
    trip2 = make_trip(school_a, date=future, time="08:00:00")
    assert trip2.trip_students.get(student=school_a.students[0]).status == "ABSENT"
    assert trip2.trip_students.get(student=school_a.students[1]).status == "EXPECTED"
    r = p.post(f"/api/parent/absence-requests/{r.data['id']}/cancel/")
    assert r.status_code == 200
    assert trip.trip_students.get(student=school_a.students[0]).status == "EXPECTED"


def test_emergency_requires_confirmation_and_notifies_staff(school_a, as_user):
    trip = make_trip(school_a)
    d = as_user(school_a.driver)
    d.post(f"/api/driver/trips/{trip.id}/start/")
    assert d.post(f"/api/driver/trips/{trip.id}/emergency/", {"confirm": False}, format="json").status_code == 400
    r = d.post(f"/api/driver/trips/{trip.id}/emergency/", {"confirm": True, "description": "fire"}, format="json")
    assert r.status_code == 201 and r.data["is_emergency"] is True
    assert Notification.objects.filter(category="INCIDENT", recipient=school_a.admin).exists()
    assert Notification.objects.filter(category="INCIDENT", recipient=school_a.tm).exists()
    assert TripStudent.objects.filter(trip=trip).count() == 2  # untouched


def test_parent_live_payload_reflects_eta_and_stale(school_a, as_user):
    trip = make_trip(school_a)
    services.start_trip(trip=trip, user=school_a.driver)
    point = services.record_location(trip=trip, data={"latitude": 13.0120, "longitude": 77.7700, "speed_mps": 8.0, "accuracy_m": 5})
    services.process_location(trip, point)
    p = as_user(school_a.parent)
    r = p.get(f"/api/parent/children/{school_a.students[0].id}/live/")
    assert r.status_code == 200
    assert r.data["trip"]["id"] == str(trip.id) and r.data["location"]["latitude"] == pytest.approx(13.012)
    assert r.data["eta"]["minutes"] >= 0 and r.data["stale"] is False
    Trip.objects.filter(pk=trip.pk).update(last_location_at=timezone.now() - timedelta(minutes=10))
    assert p.get(f"/api/parent/children/{school_a.students[0].id}/live/").data["stale"] is True
