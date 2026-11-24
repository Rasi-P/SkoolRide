"""Shared fixtures: two schools with full role sets so every test can probe tenant isolation."""

from __future__ import annotations

from datetime import date, time, timedelta
from decimal import Decimal

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.billing.models import FeePlan
from apps.fleet.models import Vehicle
from apps.fleet.services import assign_staff_to_vehicle
from apps.people.models import GuardianStudent, ParentProfile, StaffProfile, Student
from apps.routing.models import Route, RouteSchedule, RouteStop
from apps.routing.services import assign_student
from apps.schools.models import School, SchoolMembership, SchoolSubscription, SubscriptionPlan

PASSWORD = "Test@12345"


@pytest.fixture(autouse=True)
def isolated_cache():
    from django.core.cache import cache

    cache.clear()
    yield
    cache.clear()


class SchoolBundle:
    """Everything a test needs for one tenant."""

    def __init__(
        self,
        school,
        admin,
        tm,
        driver,
        attendant,
        parent,
        vehicle,
        route,
        stops,
        students,
        parent_profile,
        driver_profile,
        attendant_profile,
        fee_plan,
        schedule,
    ):
        self.school, self.admin, self.tm, self.driver, self.attendant, self.parent = school, admin, tm, driver, attendant, parent
        self.vehicle, self.route, self.stops, self.students, self.parent_profile = vehicle, route, stops, students, parent_profile
        self.driver_profile, self.attendant_profile, self.fee_plan, self.schedule = driver_profile, attendant_profile, fee_plan, schedule


def make_user(email, **kw):
    return User.objects.create_user(email=email, password=PASSWORD, first_name=email.split("@")[0].title(), **kw)


def make_school(code: str, status=School.Status.ACTIVE, plan=None) -> School:
    school = School.objects.create(
        name=f"School {code}",
        code=code,
        status=status,
        city="Bengaluru",
        latitude=Decimal("12.97"),
        longitude=Decimal("77.75"),
        phone="+91 1",
        address_line1="Main road",
        activated_at=timezone.now(),
    )
    if plan is not None:
        SchoolSubscription.objects.create(school=school, plan=plan, status="ACTIVE")
    return school


def build_bundle(code: str, plan=None, status=School.Status.ACTIVE) -> SchoolBundle:
    school = make_school(code, status=status, plan=plan)
    admin = make_user(f"admin@{code.lower()}.test")
    SchoolMembership.objects.create(user=admin, school=school, role="SCHOOL_ADMIN", is_primary=True)
    tm = make_user(f"tm@{code.lower()}.test")
    SchoolMembership.objects.create(user=tm, school=school, role="TRANSPORT_MANAGER")
    driver = make_user(f"driver@{code.lower()}.test")
    dm = SchoolMembership.objects.create(user=driver, school=school, role="DRIVER")
    driver_profile = StaffProfile.objects.create(
        school=school,
        membership=dm,
        staff_type="DRIVER",
        employee_id=f"{code}-D1",
        first_name="Dave",
        last_name="Driver",
        phone="+91 2",
        licence_expiry=date.today() + timedelta(days=365),
    )
    attendant = make_user(f"attendant@{code.lower()}.test")
    am = SchoolMembership.objects.create(user=attendant, school=school, role="ATTENDANT")
    attendant_profile = StaffProfile.objects.create(
        school=school, membership=am, staff_type="ATTENDANT", employee_id=f"{code}-A1", first_name="Anu", phone="+91 3"
    )
    parent = make_user(f"parent@{code.lower()}.test")
    pm = SchoolMembership.objects.create(user=parent, school=school, role="PARENT")
    parent_profile = ParentProfile.objects.create(
        school=school, membership=pm, first_name="Pat", last_name="Parent", email=parent.email, phone="+91 4", status="ACTIVE"
    )
    vehicle = Vehicle.objects.create(school=school, registration_number=f"KA{code}1234", fleet_number="1", capacity=3)
    assign_staff_to_vehicle(school=school, vehicle=vehicle, staff=driver_profile, role="DRIVER")
    route = Route.objects.create(
        school=school, name=f"Route {code}", code=f"R{code}", vehicle=vehicle, driver=driver_profile, attendant=attendant_profile
    )
    coords = [(12.9955, 77.7620), (12.9855, 77.7588), (12.9870, 77.7360), (12.9698, 77.7500)]
    stops = []
    for i, (lat, lng) in enumerate(coords, start=1):
        stops.append(
            RouteStop.objects.create(
                school=school,
                route=route,
                name=f"Stop {i}" if i < 4 else "School",
                sequence=i,
                latitude=Decimal(str(lat)),
                longitude=Decimal(str(lng)),
                planned_pickup_time=time(7, i * 10),
                is_school_stop=(i == 4),
                wait_minutes=1,
            )
        )
    schedule = RouteSchedule.objects.create(school=school, route=route, direction="PICKUP", weekdays=[0, 1, 2, 3, 4, 5, 6], start_time=time(7, 0))
    students = []
    for i in range(2):
        s = Student.objects.create(school=school, admission_number=f"{code}-S{i}", first_name=f"Kid{i}", last_name=code, grade="5", section="A")
        GuardianStudent.objects.create(school=school, parent=parent_profile, student=s, relationship="MOTHER", is_primary=True)
        assign_student(school=school, student=s, route=route, pickup_stop=stops[i], dropoff_stop=stops[i])
        students.append(s)
    fee_plan = FeePlan.objects.create(school=school, name="Monthly", code=f"M-{code}", amount=Decimal("2000"), billing_cycle="MONTHLY")
    return SchoolBundle(
        school,
        admin,
        tm,
        driver,
        attendant,
        parent,
        vehicle,
        route,
        stops,
        students,
        parent_profile,
        driver_profile,
        attendant_profile,
        fee_plan,
        schedule,
    )


@pytest.fixture
def plan(db):
    return SubscriptionPlan.objects.create(code="pro", name="Pro", max_vehicles=10, max_students=100, max_staff=20, max_routes=10)


@pytest.fixture
def school_a(db, plan):
    return build_bundle("AAA", plan=plan)


@pytest.fixture
def school_b(db, plan):
    return build_bundle("BBB", plan=plan)


@pytest.fixture
def superadmin(db):
    return make_user("super@platform.test", is_platform_admin=True, is_staff=True)


@pytest.fixture
def api():
    return APIClient()


def login(client: APIClient, user) -> APIClient:
    client.force_authenticate(user=user)
    return client


@pytest.fixture
def as_user():
    def _as(user, school_id=None):
        client = APIClient()
        client.force_authenticate(user=user)
        if school_id:
            client.credentials(HTTP_X_SCHOOL_ID=str(school_id))
        return client

    return _as
