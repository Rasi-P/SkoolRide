import pytest

from apps.core import geo
from apps.core.roles import ROLE_PERMISSIONS, Perm


def test_haversine_known_distance():
    # Bengaluru ITPL -> Whitefield ~ 2.1 km
    d = geo.haversine_m(12.9870, 77.7360, 12.9698, 77.7500)
    assert 2000 < d < 2600


def test_projection_and_remaining_distance():
    path = [(0.0, 0.0), (0.0, 0.01), (0.0, 0.02)]  # ~1.1 km each segment along the equator
    proj = geo.project_onto_path(path, 0.0001, 0.005)
    assert proj.segment_index == 0 and 0.45 < proj.fraction < 0.55
    remaining = geo.remaining_distance_to_index_m(path, proj, 2)
    assert 1600 < remaining < 1700
    assert geo.remaining_distance_to_index_m(path, geo.project_onto_path(path, 0, 0.019), 1) is None  # behind


def test_eta_uses_default_speed_when_stationary():
    assert geo.eta_seconds(1000, 0.0, 36.0) == pytest.approx(100.0)
    assert geo.eta_seconds(1000, 10.0, 36.0) == pytest.approx(100.0)


def test_role_matrix_shape():
    assert Perm.SCHOOL_MANAGE in ROLE_PERMISSIONS["SCHOOL_ADMIN"]
    assert Perm.SCHOOL_MANAGE not in ROLE_PERMISSIONS["TRANSPORT_MANAGER"]
    assert ROLE_PERMISSIONS["PARENT"] == {Perm.PARENT_SELF}
    assert Perm.GPS_SHARE in ROLE_PERMISSIONS["DRIVER"] and Perm.GPS_SHARE not in ROLE_PERMISSIONS["ATTENDANT"]


@pytest.mark.django_db
def test_demo_seed_creates_consistent_dataset(settings):
    settings.DEMO_MODE = True
    from apps.billing.models import Payment
    from apps.demo.seed import seed
    from apps.people.models import Student
    from apps.routing.models import StudentTransportAssignment
    from apps.schools.models import School
    from apps.trips.models import GPSLocation, Trip, VehicleLocation

    summary = seed()
    assert summary["schools"] == 3 and summary["vehicles"] >= 8 and summary["students"] >= 30
    assert School.objects.filter(status="ACTIVE").count() == 2 and School.objects.filter(status="SUSPENDED").count() == 1
    for a in StudentTransportAssignment.objects.filter(is_active=True).select_related("student", "route", "pickup_stop"):
        assert a.student.school_id == a.route.school_id == a.pickup_stop.route.school_id
    for t in Trip.objects.select_related("route", "vehicle"):
        assert t.vehicle is None or t.vehicle.school_id == t.school_id
        assert t.trip_students.count() <= (t.vehicle.capacity if t.vehicle else 999)
    assert Student.objects.filter(transport_status="WITHDRAWN").exists()
    assert not Trip.objects.filter(is_simulated=False).exists()
    assert not GPSLocation.objects.filter(is_simulated=False).exists()
    assert not GPSLocation.objects.exclude(source="SIMULATOR").exists()
    assert not VehicleLocation.objects.filter(is_simulated=False).exists()
    assert not Payment.objects.filter(is_simulated=False).exists()


@pytest.mark.django_db
def test_simulator_moves_vehicle_and_completes(settings, school_a):
    settings.DEMO_MODE = True
    from apps.demo import simulator
    from apps.trips import services
    from apps.trips.models import GPSLocation

    trip = services.create_trip(
        school=school_a.school, route=school_a.route, direction="PICKUP", scheduled_date="2030-01-01", scheduled_start_time="07:00:00"
    )
    sim = simulator.start_simulation(trip=trip, user=school_a.admin, speed_mps=30, auto_board=True)
    assert sim.is_running and GPSLocation.objects.filter(trip=trip, is_simulated=True).count() == 1
    # Fast-forward: jump near the end of the path and tick repeatedly.
    from datetime import timedelta

    from django.utils import timezone

    from apps.core.geo import path_length_m

    sim.progress_m = path_length_m(trip.route.polyline()) - 10
    sim.dwell_until = None
    sim.last_tick_at = timezone.now() - timedelta(seconds=30)
    sim.save()
    for _ in range(3):
        simulator.tick(sim)
        sim.refresh_from_db()
    trip.refresh_from_db()
    assert trip.status == "COMPLETED" and trip.is_simulated is True
    assert not sim.is_running
