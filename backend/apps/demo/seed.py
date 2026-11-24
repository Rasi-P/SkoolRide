"""Realistic, internally consistent demo data. All names, phones and emails are fictional.

Run with `python manage.py seed_demo_data` on an empty demo database.
"""

from __future__ import annotations

import random
import zoneinfo
from datetime import date, datetime, time, timedelta
from decimal import Decimal

from django.conf import settings
from django.core.management.base import CommandError
from django.db import transaction
from django.test.utils import override_settings
from django.utils import timezone

from apps.accounts.models import Invitation, User
from apps.billing import services as billing
from apps.billing.models import FeePlan, Invoice
from apps.core.geo import bearing_deg, haversine_m, interpolate
from apps.engagement.models import AbsenceRequest, Announcement, Complaint, ComplaintComment, PickupChangeRequest
from apps.fleet.models import StaffVehicleAssignment, Vehicle, VehicleDocument, VehicleMaintenance
from apps.fleet.services import assign_staff_to_vehicle
from apps.notifications.models import Channel, Notification, NotificationDelivery
from apps.people.models import GuardianStudent, ParentProfile, StaffDocument, StaffLeave, StaffProfile, Student
from apps.routing.models import Route, RouteSchedule, RouteStop, StudentTransportAssignment
from apps.routing.services import assign_student
from apps.schools.models import (
    NotificationTemplate,
    PlatformSetting,
    School,
    SchoolApplication,
    SchoolMembership,
    SchoolSubscription,
    SubscriptionPlan,
)
from apps.trips import services as trips
from apps.trips.models import BoardingEvent, GPSLocation, Incident, Trip, TripEvent, TripStop, TripStudent, VehicleLocation

DEMO_PASSWORD = "Demo@12345"
rng = random.Random(42)

FIRST_NAMES = [
    "Aarav",
    "Vivaan",
    "Aditya",
    "Vihaan",
    "Arjun",
    "Sai",
    "Reyansh",
    "Krishna",
    "Ishaan",
    "Rohan",
    "Ananya",
    "Diya",
    "Saanvi",
    "Aadhya",
    "Kiara",
    "Myra",
    "Anika",
    "Navya",
    "Riya",
    "Ira",
    "Kabir",
    "Advait",
    "Dhruv",
    "Meera",
    "Tara",
    "Zara",
    "Nikhil",
    "Pranav",
    "Sanjana",
    "Ishita",
    "Aryan",
    "Veer",
    "Avni",
    "Pari",
    "Yash",
    "Shreya",
]
LAST_NAMES = [
    "Sharma",
    "Nair",
    "Iyer",
    "Reddy",
    "Patel",
    "Menon",
    "Rao",
    "Kumar",
    "Singh",
    "Gupta",
    "Pillai",
    "Bose",
    "Das",
    "Verma",
    "Joshi",
    "Kulkarni",
    "Deshpande",
    "Mehta",
    "Shah",
    "Chowdhury",
]


def _user(email, first, last="", password=DEMO_PASSWORD, **kw):
    u = User.objects.create_user(email=email, password=password, first_name=first, last_name=last, **kw)
    return u


def _member(user, school, role, primary=True):
    return SchoolMembership.objects.create(user=user, school=school, role=role, is_primary=primary)


def _local_dt(school, d: date, t: time):
    return datetime.combine(d, t, tzinfo=zoneinfo.ZoneInfo(school.timezone))


def _school_days(school, n: int) -> list[date]:
    today = timezone.now().astimezone(zoneinfo.ZoneInfo(school.timezone)).date()
    days = []
    d = today - timedelta(days=1)
    while len(days) < n:
        if d.weekday() < 5:
            days.append(d)
        d -= timedelta(days=1)
    return list(reversed(days))


def wipe():
    """Delete everything except the schema. Only allowed in DEMO_MODE."""
    if not settings.DEMO_MODE:
        raise CommandError("Refusing to delete data: DEMO_MODE is off.")
    for model in (
        GPSLocation,
        VehicleLocation,
        BoardingEvent,
        TripEvent,
        TripStudent,
        TripStop,
        Incident,
        Trip,
        Notification,
        NotificationDelivery,
        AbsenceRequest,
        PickupChangeRequest,
        ComplaintComment,
        Complaint,
        Announcement,
    ):
        model.objects.all().delete()
    from apps.billing.models import NumberSequence, Payment, PaymentAdjustment, PaymentAllocation, Receipt, StudentFeeAssignment

    for model in (PaymentAdjustment, Receipt, PaymentAllocation, Payment, Invoice, StudentFeeAssignment, FeePlan, NumberSequence):
        model.objects.all().delete()
    for model in (
        StudentTransportAssignment,
        RouteSchedule,
        RouteStop,
        Route,
        StaffVehicleAssignment,
        VehicleDocument,
        VehicleMaintenance,
        Vehicle,
        GuardianStudent,
        Student,
        ParentProfile,
        StaffDocument,
        StaffLeave,
        StaffProfile,
        Invitation,
        SchoolMembership,
        SchoolApplication,
        SchoolSubscription,
        School,
        SubscriptionPlan,
        NotificationTemplate,
        PlatformSetting,
    ):
        model.objects.all().delete()
    from apps.core.models import AuditLog
    from apps.demo.models import DemoSimulation

    DemoSimulation.objects.all().delete()
    AuditLog.objects.all().delete()
    User.objects.all().delete()


@override_settings(CELERY_TASK_ALWAYS_EAGER=True, EMAIL_BACKEND="django.core.mail.backends.dummy.EmailBackend")
def seed(stdout=None, *, reset=False) -> dict:
    import logging

    logging.getLogger("celery").setLevel(logging.WARNING)
    logging.getLogger("apps").setLevel(logging.WARNING)
    log = (lambda m: stdout.write(m + "\n")) if stdout else (lambda m: None)
    if not settings.DEMO_MODE:
        raise CommandError("Refusing to seed: DEMO_MODE is off.")
    with transaction.atomic():
        if reset:
            wipe()
        elif User.objects.exists() or School.objects.exists() or SubscriptionPlan.objects.exists() or SchoolApplication.objects.exists():
            raise CommandError("Database is not empty. Existing data was preserved. Use --reset --yes only for a disposable demo database.")
        summary = _seed(log)
    return summary


def _seed(log):
    now = timezone.now()
    # ------------------------------------------------------------------ platform
    superadmin = _user("superadmin@schoolbuspro.demo", "Platform", "Admin", is_platform_admin=True, is_staff=True, is_superuser=True)
    plans = {
        "starter": SubscriptionPlan.objects.create(
            code="starter",
            name="Starter",
            price_monthly=Decimal("2999"),
            max_vehicles=5,
            max_students=300,
            max_staff=15,
            max_routes=6,
            features=["Live tracking", "Parent app", "Attendance"],
            sort_order=1,
        ),
        "pro": SubscriptionPlan.objects.create(
            code="pro",
            name="Professional",
            price_monthly=Decimal("7999"),
            max_vehicles=25,
            max_students=1500,
            max_staff=80,
            max_routes=30,
            features=["Everything in Starter", "Fee management", "Reports & exports", "Incident management"],
            sort_order=2,
        ),
        "enterprise": SubscriptionPlan.objects.create(
            code="enterprise",
            name="Enterprise",
            price_monthly=Decimal("19999"),
            max_vehicles=200,
            max_students=10000,
            max_staff=500,
            max_routes=200,
            features=["Everything in Professional", "Priority support", "GPS device integration", "SLA"],
            sort_order=3,
        ),
    }
    PlatformSetting.objects.create(key="default_arrival_alert_minutes", value=10, description="Default minutes-before-arrival alert")
    PlatformSetting.objects.create(key="support_email", value="support@schoolbuspro.demo", description="Support contact shown to schools")
    PlatformSetting.objects.create(key="maintenance_banner", value={"enabled": False, "message": ""}, description="Platform-wide banner")
    PlatformSetting.objects.create(key="registration_open", value=True, description="Allow new school applications")
    templates = [
        ("ARRIVAL_SOON", "Bus arriving soon", "Your child's school bus is approximately {minutes} minutes away from {stop_name}. Please get ready."),
        ("BOARDED", "{student_first_name} boarded the bus", "{student_first_name} boarded {vehicle} at {stop_name}."),
        ("DROPPED", "{student_first_name} dropped off", "{student_first_name} was dropped off safely."),
        ("TRIP_DELAY", "Bus running late", "The bus on route {route} is running late. We will keep you updated."),
        ("FEE_DUE", "Transport fee due", "A transport fee invoice is due. Please pay by the due date to avoid late fees."),
    ]
    for cat, subject, body in templates:
        NotificationTemplate.objects.create(category=cat, channel="PUSH", subject=subject, body=body)

    # ------------------------------------------------------------------ schools
    greenfield = School.objects.create(
        name="Greenfield International School",
        code="GFIS",
        status=School.Status.ACTIVE,
        email="office@greenfield.demo",
        phone="+91 80 4111 2233",
        website="https://greenfield.demo",
        address_line1="Survey 42, Whitefield Main Road",
        city="Bengaluru",
        state="Karnataka",
        postal_code="560066",
        latitude=Decimal("12.969800"),
        longitude=Decimal("77.750000"),
        academic_year_label="2026-27",
        academic_year_start=date(2026, 6, 1),
        academic_year_end=date(2027, 3, 31),
        morning_pickup_window_start=time(6, 45),
        afternoon_dropoff_window_start=time(15, 15),
        transport_office_phone="+91 98450 11223",
        transport_office_email="transport@greenfield.demo",
        emergency_contact_phone="+91 98450 99999",
        parent_help_text="Transport office hours: 7am-5pm on school days.",
        show_driver_phone_to_parents=True,
        approved_at=now - timedelta(days=200),
        activated_at=now - timedelta(days=198),
        fee_due_day=10,
    )
    SchoolSubscription.objects.create(
        school=greenfield,
        plan=plans["pro"],
        status="ACTIVE",
        starts_at=date.today() - timedelta(days=198),
        ends_at=date.today() + timedelta(days=167),
    )
    sunrise = School.objects.create(
        name="Sunrise Public School",
        code="SPS",
        status=School.Status.ACTIVE,
        email="admin@sunrise.demo",
        phone="+91 20 6677 8899",
        address_line1="Plot 7, Hinjewadi Phase 1",
        city="Pune",
        state="Maharashtra",
        postal_code="411057",
        latitude=Decimal("18.591000"),
        longitude=Decimal("73.738000"),
        approved_at=now - timedelta(days=6),
        activated_at=now - timedelta(days=5),
    )
    SchoolSubscription.objects.create(
        school=sunrise, plan=plans["starter"], status="TRIAL", starts_at=date.today() - timedelta(days=5), ends_at=date.today() + timedelta(days=25)
    )
    riverside = School.objects.create(
        name="Riverside Academy",
        code="RSA",
        status=School.Status.SUSPENDED,
        email="office@riverside.demo",
        phone="+91 40 2233 4455",
        address_line1="Road No 12, Gachibowli",
        city="Hyderabad",
        state="Telangana",
        postal_code="500032",
        latitude=Decimal("17.443500"),
        longitude=Decimal("78.377200"),
        approved_at=now - timedelta(days=120),
        activated_at=now - timedelta(days=118),
        suspended_at=now - timedelta(days=3),
        suspension_reason="Subscription payment overdue by 45 days.",
    )
    SchoolSubscription.objects.create(
        school=riverside,
        plan=plans["starter"],
        status="PAST_DUE",
        starts_at=date.today() - timedelta(days=118),
        ends_at=date.today() - timedelta(days=10),
    )
    for sch in (greenfield, sunrise, riverside):
        SchoolApplication.objects.create(
            school_name=sch.name,
            contact_name="Founding Admin",
            contact_email=sch.email,
            contact_phone=sch.phone,
            address=sch.address_line1,
            city=sch.city,
            state=sch.state,
            postal_code=sch.postal_code,
            estimated_students=400,
            estimated_vehicles=6,
            status="APPROVED",
            reviewed_by=superadmin,
            reviewed_at=sch.approved_at,
            school=sch,
        )
    SchoolApplication.objects.create(
        school_name="Lakeview High School",
        contact_name="Meenakshi Raman",
        contact_email="meenakshi@lakeview.demo",
        contact_phone="+91 44 2345 6789",
        designation="Principal",
        address="12 Lake View Road, Adyar",
        city="Chennai",
        state="Tamil Nadu",
        postal_code="600020",
        website="https://lakeview.demo",
        estimated_students=650,
        estimated_vehicles=9,
        requested_plan=plans["pro"],
        message="We run 9 buses across south Chennai and need parent tracking.",
        status="PENDING",
    )
    SchoolApplication.objects.create(
        school_name="Hillcrest Montessori",
        contact_name="Daniel D'Souza",
        contact_email="daniel@hillcrest.demo",
        contact_phone="+91 832 245 6677",
        designation="Director",
        address="Hill Top Road, Porvorim",
        city="Panaji",
        state="Goa",
        estimated_students=120,
        estimated_vehicles=2,
        requested_plan=plans["starter"],
        status="UNDER_REVIEW",
    )
    SchoolApplication.objects.create(
        school_name="Metro Kids Academy",
        contact_name="Test Applicant",
        contact_email="test@metrokids.demo",
        contact_phone="+91 11 0000 0000",
        address="Unknown",
        city="Delhi",
        estimated_students=10,
        estimated_vehicles=0,
        status="REJECTED",
        review_notes="Insufficient details; no transport operation.",
        reviewed_by=superadmin,
        reviewed_at=now - timedelta(days=2),
    )

    # ------------------------------------------------------------------ Greenfield people
    gf_admin = _user("admin@greenfield.demo", "Lakshmi", "Venkatesh", phone="+91 98450 10001")
    gf_admin_m = _member(gf_admin, greenfield, "SCHOOL_ADMIN")
    StaffProfile.objects.create(
        school=greenfield,
        membership=gf_admin_m,
        staff_type="SCHOOL_ADMIN",
        employee_id="GF-ADM-01",
        first_name="Lakshmi",
        last_name="Venkatesh",
        email=gf_admin.email,
        phone=gf_admin.phone,
        joining_date=date(2021, 6, 1),
    )
    gf_tm = _user("transport@greenfield.demo", "Suresh", "Babu", phone="+91 98450 10002")
    gf_tm_m = _member(gf_tm, greenfield, "TRANSPORT_MANAGER")
    StaffProfile.objects.create(
        school=greenfield,
        membership=gf_tm_m,
        staff_type="TRANSPORT_MANAGER",
        employee_id="GF-TM-01",
        first_name="Suresh",
        last_name="Babu",
        email=gf_tm.email,
        phone=gf_tm.phone,
        joining_date=date(2022, 1, 10),
        emergency_contact_name="Radha Babu",
        emergency_contact_phone="+91 98450 10102",
    )
    driver_specs = [
        ("Ravi", "Kumar", "driver1"),
        ("Manjunath", "Gowda", "driver2"),
        ("Syed", "Irfan", "driver3"),
        ("Prakash", "Shetty", "driver4"),
        ("Anil", "Yadav", "driver5"),
    ]
    drivers = []
    for i, (fn, ln, slug) in enumerate(driver_specs, start=1):
        u = _user(f"{slug}@greenfield.demo", fn, ln, phone=f"+91 98450 2000{i}")
        m = _member(u, greenfield, "DRIVER")
        sp = StaffProfile.objects.create(
            school=greenfield,
            membership=m,
            staff_type="DRIVER",
            employee_id=f"GF-DRV-0{i}",
            first_name=fn,
            last_name=ln,
            email=u.email,
            phone=u.phone,
            date_of_birth=date(1980 + i, 3, 12),
            gender="M",
            address=f"{10 + i} Hoodi Village, Bengaluru",
            emergency_contact_name=f"{ln} family",
            emergency_contact_phone=f"+91 98450 2100{i}",
            joining_date=date(2020 + (i % 3), 7, 1),
            licence_number=f"KA05 2019000{i}23",
            licence_class="HPMV",
            licence_expiry=date.today() + timedelta(days=[400, 25, 800, 20, -5][i - 1]),
        )
        StaffDocument.objects.create(
            school=greenfield, staff=sp, doc_type="LICENCE", title="Driving licence", number=sp.licence_number, expires_on=sp.licence_expiry
        )
        StaffDocument.objects.create(
            school=greenfield,
            staff=sp,
            doc_type="POLICE_VERIFICATION",
            title="Police verification",
            issued_on=date.today() - timedelta(days=300),
            expires_on=date.today() + timedelta(days=65 + i * 40),
        )
        StaffDocument.objects.create(
            school=greenfield, staff=sp, doc_type="MEDICAL", title="Medical fitness", expires_on=date.today() + timedelta(days=200 + i * 10)
        )
        drivers.append(sp)
    attendants = []
    for i, (fn, ln) in enumerate([("Kavitha", "R"), ("Shanthi", "M"), ("Geetha", "S")], start=1):
        u = _user(f"attendant{i}@greenfield.demo", fn, ln, phone=f"+91 98450 3000{i}")
        m = _member(u, greenfield, "ATTENDANT")
        attendants.append(
            StaffProfile.objects.create(
                school=greenfield,
                membership=m,
                staff_type="ATTENDANT",
                employee_id=f"GF-ATT-0{i}",
                first_name=fn,
                last_name=ln,
                email=u.email,
                phone=u.phone,
                joining_date=date(2022, 4, 1),
                gender="F",
                emergency_contact_name="Family",
                emergency_contact_phone=f"+91 98450 3100{i}",
            )
        )
    StaffLeave.objects.create(
        school=greenfield,
        staff=drivers[4],
        leave_type="SICK",
        start_date=date.today() + timedelta(days=3),
        end_date=date.today() + timedelta(days=4),
        reason="Medical appointment",
        status="PENDING",
    )
    StaffLeave.objects.create(
        school=greenfield,
        staff=attendants[2],
        leave_type="CASUAL",
        start_date=date.today() - timedelta(days=10),
        end_date=date.today() - timedelta(days=9),
        reason="Family function",
        status="APPROVED",
        decided_by=gf_admin,
    )

    # ------------------------------------------------------------------ Greenfield fleet
    bus_specs = [
        ("KA01AB1234", "1", 40, "Tata", "Starbus Ultra", 2021),
        ("KA01AB5678", "2", 32, "Ashok Leyland", "Sunshine", 2020),
        ("KA03CD9012", "3", 40, "Tata", "Starbus", 2019),
        ("KA05EF3456", "4", 24, "Force", "Traveller", 2022),
        ("KA05GH7890", "5", 40, "Eicher", "Skyline Pro", 2023),
    ]
    buses = []
    for i, (reg, fleet, cap, make, model, year) in enumerate(bus_specs):
        v = Vehicle.objects.create(
            school=greenfield,
            registration_number=reg,
            fleet_number=fleet,
            vehicle_type="BUS" if cap >= 30 else "MINI_BUS",
            make=make,
            model=model,
            year=year,
            colour="Yellow",
            capacity=cap,
            status="AVAILABLE" if i != 4 else "MAINTENANCE",
            insurance_number=f"INS-{reg}",
            insurance_expiry=date.today() + timedelta(days=[180, 12, 400, -3, 250][i]),
            permit_number=f"PMT-{reg}",
            permit_expiry=date.today() + timedelta(days=[300, 60, 20, 500, 90][i]),
            fitness_certificate_number=f"FC-{reg}",
            fitness_expiry=date.today() + timedelta(days=[200, 400, 350, 15, 120][i]),
            pollution_expiry=date.today() + timedelta(days=[90, 45, 140, 60, 10][i]),
            last_service_date=date.today() - timedelta(days=30 + i * 10),
            next_service_due=date.today() + timedelta(days=[60, 20, 90, 5, -2][i]),
            odometer_km=42000 + i * 9000,
        )
        VehicleDocument.objects.create(school=greenfield, vehicle=v, doc_type="REGISTRATION", title="Registration certificate", number=f"RC-{reg}")
        VehicleDocument.objects.create(
            school=greenfield, vehicle=v, doc_type="INSURANCE", title="Insurance policy", number=v.insurance_number, expires_on=v.insurance_expiry
        )
        VehicleMaintenance.objects.create(
            school=greenfield,
            vehicle=v,
            category="SERVICE",
            description="Periodic service: oil, filters, brake check",
            performed_on=v.last_service_date,
            cost=Decimal("8500") + i * 500,
            odometer_km=v.odometer_km - 1500,
            vendor="Metro Motors",
            next_due_on=v.next_service_due,
        )
        if i == 4:
            VehicleMaintenance.objects.create(
                school=greenfield,
                vehicle=v,
                category="REPAIR",
                description="Gearbox repair in progress",
                performed_on=date.today() - timedelta(days=1),
                cost=Decimal("24000"),
                vendor="Metro Motors",
            )
        buses.append(v)
    for i, bus in enumerate(buses[:4]):
        assign_staff_to_vehicle(school=greenfield, vehicle=bus, staff=drivers[i], role="DRIVER")
        if i < 3:
            assign_staff_to_vehicle(school=greenfield, vehicle=bus, staff=attendants[i], role="ATTENDANT")

    # ------------------------------------------------------------------ Greenfield routes
    school_pt = (12.9698, 77.7500)
    route_specs = [
        (
            "R1",
            "Whitefield Loop",
            "#1d4ed8",
            [
                ("Kadugodi Bus Stand", 12.9955, 77.7620),
                ("Hope Farm Junction", 12.9855, 77.7588),
                ("ITPL Main Gate", 12.9870, 77.7360),
                ("Siddapura Circle", 12.9630, 77.7470),
                ("Varthur Kodi", 12.9586, 77.7420),
            ],
        ),
        (
            "R2",
            "Marathahalli Express",
            "#0f766e",
            [
                ("Marathahalli Bridge", 12.9591, 77.6974),
                ("Kundalahalli Gate", 12.9780, 77.7150),
                ("Brookefield Mall", 12.9660, 77.7170),
                ("AECS Layout Park", 12.9700, 77.7230),
            ],
        ),
        (
            "R3",
            "Sarjapur Road",
            "#b45309",
            [
                ("Bellandur Gate", 12.9260, 77.6760),
                ("Kasavanahalli Junction", 12.9100, 77.6800),
                ("Carmelaram Station", 12.9000, 77.7100),
                ("Dommasandra Circle", 12.8820, 77.7490),
                ("Varthur Lake", 12.9400, 77.7480),
            ],
        ),
        (
            "R4",
            "KR Puram Line",
            "#7c3aed",
            [
                ("KR Puram Railway Station", 13.0060, 77.6960),
                ("Hoodi Circle", 12.9910, 77.7160),
                ("Mahadevapura Signal", 12.9900, 77.6900),
                ("Phoenix Mall Junction", 12.9960, 77.7000),
            ],
        ),
    ]
    routes = []
    for i, (code, name, colour, stops) in enumerate(route_specs):
        r = Route.objects.create(
            school=greenfield,
            name=name,
            code=code,
            colour=colour,
            vehicle=buses[i],
            driver=drivers[i],
            attendant=attendants[i] if i < 3 else None,
            description=f"{name} serving {len(stops)} pickup points.",
        )
        t = datetime.combine(date.today(), time(6, 50)) + timedelta(minutes=i * 5)
        for seq, (sname, lat, lng) in enumerate(stops, start=1):
            RouteStop.objects.create(
                school=greenfield,
                route=r,
                name=sname,
                sequence=seq,
                latitude=Decimal(str(lat)),
                longitude=Decimal(str(lng)),
                address=f"{sname}, Bengaluru",
                planned_pickup_time=(t + timedelta(minutes=(seq - 1) * 9)).time(),
                planned_dropoff_time=(datetime.combine(date.today(), time(16, 10)) - timedelta(minutes=(seq - 1) * 9)).time(),
                wait_minutes=2,
            )
        RouteStop.objects.create(
            school=greenfield,
            route=r,
            name="Greenfield International School",
            sequence=len(stops) + 1,
            latitude=Decimal(str(school_pt[0])),
            longitude=Decimal(str(school_pt[1])),
            address="Whitefield Main Road",
            is_school_stop=True,
            planned_pickup_time=(t + timedelta(minutes=len(stops) * 9)).time(),
            planned_dropoff_time=time(15, 30),
            wait_minutes=0,
        )
        r.distance_km = Decimal(sum(haversine_m(*a, *b) for a, b in zip(r.polyline(), r.polyline()[1:], strict=False)) / 1000).quantize(
            Decimal("0.01")
        )
        r.estimated_duration_minutes = len(stops) * 9 + 5
        r.save()
        RouteSchedule.objects.create(
            school=greenfield, route=r, direction="PICKUP", label="Morning pickup", weekdays=[0, 1, 2, 3, 4], start_time=(t).time()
        )
        RouteSchedule.objects.create(
            school=greenfield, route=r, direction="DROPOFF", label="Afternoon drop-off", weekdays=[0, 1, 2, 3, 4], start_time=time(15, 30)
        )
        routes.append(r)

    # ------------------------------------------------------------------ Greenfield students & parents
    fee_plans = [
        FeePlan.objects.create(
            school=greenfield,
            name="Zone A (up to 5 km)",
            code="ZONE-A",
            basis="DISTANCE",
            billing_cycle="MONTHLY",
            amount=Decimal("1800"),
            distance_min_km=0,
            distance_max_km=5,
        ),
        FeePlan.objects.create(
            school=greenfield,
            name="Zone B (5-10 km)",
            code="ZONE-B",
            basis="DISTANCE",
            billing_cycle="MONTHLY",
            amount=Decimal("2400"),
            distance_min_km=5,
            distance_max_km=10,
        ),
        FeePlan.objects.create(
            school=greenfield,
            name="Sarjapur Route Plan",
            code="R3-PLAN",
            basis="ROUTE",
            billing_cycle="MONTHLY",
            amount=Decimal("2900"),
            route=routes[2],
        ),
        FeePlan.objects.create(
            school=greenfield,
            name="Annual Transport (Grade 1-3)",
            code="ANNUAL-PRI",
            basis="GRADE",
            billing_cycle="ANNUAL",
            amount=Decimal("19800"),
            grades=["1", "2", "3"],
        ),
    ]
    students, parents = [], []
    parent_phone_base = 7000
    for i in range(28):
        fn = FIRST_NAMES[i % len(FIRST_NAMES)]
        ln = LAST_NAMES[i % len(LAST_NAMES)]
        grade = str(1 + (i % 10))
        s = Student.objects.create(
            school=greenfield,
            admission_number=f"GF{2024 + (i % 3)}{100 + i:03d}",
            first_name=fn,
            last_name=ln,
            grade=grade,
            section=["A", "B", "C"][i % 3],
            date_of_birth=date(2024 - 5 - int(grade), 1 + (i % 12), 1 + (i % 27)),
            gender="M" if i % 2 == 0 else "F",
            blood_group=["O+", "A+", "B+", "AB+"][i % 4],
            pickup_address=f"{i + 3} {rng.choice(['Rose', 'Lotus', 'Palm', 'Cedar'])} Street, Bengaluru",
            emergency_contact_name=f"{ln} household",
            emergency_contact_phone=f"+91 98860 {parent_phone_base + i:04d}",
            medical_notes="Mild dust allergy" if i % 9 == 0 else "",
        )
        # Parent: siblings share a parent for every 7th student.
        if i % 7 == 6:
            p = parents[0] if i == 6 else parents[-1]  # the demo parent gets two children
            rel = "MOTHER" if p.guardian_links.first().relationship == "FATHER" else "FATHER"
        else:
            pfn = rng.choice(["Priya", "Rohit", "Deepa", "Arun", "Sunita", "Vikram", "Neha", "Rajesh", "Anjali", "Karthik"])
            email = f"{pfn.lower()}.{ln.lower()}{i}@parent.demo"
            if i == 0:  # deterministic primary demo parent
                pfn, email = "Priya", "parent@greenfield.demo"
            pu = _user(email, pfn, ln, phone=f"+91 98860 {parent_phone_base + i:04d}")
            pm = _member(pu, greenfield, "PARENT")
            p = ParentProfile.objects.create(
                school=greenfield,
                membership=pm,
                first_name=pfn,
                last_name=ln,
                email=email,
                phone=pu.phone,
                status="ACTIVE",
                address=s.pickup_address,
                phone_verified=True,
                email_verified=True,
            )
            parents.append(p)
            rel = "MOTHER" if pfn in ("Priya", "Deepa", "Sunita", "Neha", "Anjali") else "FATHER"
        GuardianStudent.objects.create(school=greenfield, parent=p, student=s, relationship=rel, is_primary=True)
        if i % 5 == 0:  # secondary guardian without an account yet
            sp = ParentProfile.objects.create(
                school=greenfield,
                first_name="Grandparent",
                last_name=ln,
                email=f"grand.{ln.lower()}{i}@parent.demo",
                phone=f"+91 98860 {8000 + i:04d}",
                status="INVITED",
            )
            GuardianStudent.objects.create(
                school=greenfield, parent=sp, student=s, relationship="GUARDIAN", is_primary=False, receives_notifications=False
            )
        students.append(s)
    # Transport assignments: distribute across routes/stops.
    for i, s in enumerate(students):
        if i == 27:
            s.transport_status = "NONE"
            s.save(update_fields=["transport_status"])
            continue
        r = routes[i % 4]
        stops = [st for st in r.ordered_stops() if not st.is_school_stop]
        stop = stops[(i // 4) % len(stops)]
        assign_student(school=greenfield, student=s, route=r, pickup_stop=stop, dropoff_stop=stop, start_date=date.today() - timedelta(days=120))
        plan = fee_plans[2] if r.code == "R3" else (fee_plans[3] if s.grade in ("1", "2", "3") else fee_plans[(i % 2)])
        billing.assign_fee_plan(
            school=greenfield,
            student=s,
            fee_plan=plan,
            start_date=date.today() - timedelta(days=120),
            discount_amount=Decimal("200") if i % 9 == 0 else Decimal("0"),
            discount_reason="Sibling discount" if i % 9 == 0 else "",
        )
    # A withdrawn student with history.
    w = students[26]
    from apps.people.services import withdraw_transport

    withdraw_transport(student=w, reason="Family relocated closer to school")

    # ------------------------------------------------------------------ Greenfield trips (history + today)
    days = _school_days(greenfield, 10)
    today = timezone.now().astimezone(zoneinfo.ZoneInfo(greenfield.timezone)).date()
    gps_points = 0
    first_users = {d.pk: d.user for d in drivers}
    for d in days:
        for r in routes:
            for sched in r.schedules.all():
                trip = trips.create_trip(
                    school=greenfield, route=r, direction=sched.direction, scheduled_date=d, scheduled_start_time=sched.start_time, schedule=sched
                )
                start_at = _local_dt(greenfield, d, sched.start_time) + timedelta(minutes=rng.randint(-2, 6))
                _complete_trip_history(trip, start_at, first_users.get(r.driver_id) if r.driver_id else None)
                gps_points += trip.locations.count()
    # Today's trips (scheduled) + tomorrow
    for d in (today, today + timedelta(days=1)):
        if d.weekday() >= 5 and d != today:
            continue
        for r in routes:
            for sched in r.schedules.all():
                if not Trip.objects.filter(schedule=sched, scheduled_date=d).exists():
                    trips.create_trip(
                        school=greenfield, route=r, direction=sched.direction, scheduled_date=d, scheduled_start_time=sched.start_time, schedule=sched
                    )
    # A cancelled trip and a replacement example yesterday-ish.
    cancelled = Trip.objects.filter(school=greenfield, route=routes[3], scheduled_date=days[-2], direction="DROPOFF").first()
    if cancelled:
        cancelled.status = "CANCELLED"
        cancelled.cancelled_reason = "Vehicle breakdown; students sent with route R1"
        cancelled.save(update_fields=["status", "cancelled_reason"])
        Incident.objects.create(
            school=greenfield,
            trip=cancelled,
            vehicle=cancelled.vehicle,
            reported_by=drivers[3].user,
            category="BREAKDOWN",
            severity="HIGH",
            title="Engine overheating on KR Puram line",
            description="Temperature warning light came on near Hoodi Circle. Pulled over safely; no students on board.",
            occurred_at=_local_dt(greenfield, days[-2], time(15, 40)),
            latitude=12.9910,
            longitude=77.7160,
            status="RESOLVED",
            resolution_notes="Coolant leak fixed by Metro Motors.",
            resolved_at=now - timedelta(days=1),
            resolved_by=gf_tm,
        )
    Incident.objects.create(
        school=greenfield,
        vehicle=buses[1],
        reported_by=attendants[1].user,
        category="BEHAVIOUR",
        severity="LOW",
        title="Students standing while bus moving",
        description="Two grade 6 students repeatedly stood up while the bus was in motion. Counselled on the spot.",
        occurred_at=now - timedelta(days=2, hours=3),
        status="OPEN",
    )
    Incident.objects.create(
        school=greenfield,
        vehicle=buses[2],
        reported_by=drivers[2].user,
        category="DELAY",
        severity="MEDIUM",
        title="Heavy traffic at Bellandur",
        description="Trip delayed by about 18 minutes due to waterlogging near Bellandur gate.",
        occurred_at=now - timedelta(days=4, hours=8),
        status="CLOSED",
        resolution_notes="Parents notified via app.",
        resolved_at=now - timedelta(days=4),
    )

    # ------------------------------------------------------------------ Greenfield billing
    months = [(today.replace(day=1) - timedelta(days=1)).replace(day=1), today.replace(day=1)]
    two_ago = (months[0] - timedelta(days=1)).replace(day=1)
    for anchor in (two_ago, months[0], months[1]):
        billing.generate_invoices(school=greenfield, anchor_date=anchor, actor=gf_admin)
    invoices = list(Invoice.objects.filter(school=greenfield).order_by("due_date", "student__first_name"))
    for i, inv in enumerate(invoices):
        if inv.period_start < months[1]:
            inv.issue_date = inv.period_start
            inv.save(update_fields=["issue_date"])
        bucket = i % 5
        if inv.student_id == students[0].id:
            # The demo parent (parent@greenfield.demo): current month unpaid (to demo "Pay now"), previous month partial.
            if inv.period_start == months[1]:
                continue
            bucket = 2  # partial payment -> an open balance to pay in the demo
        if inv.period_start == months[1] and bucket in (0, 1):
            continue  # current month: left unpaid for some
        if bucket == 3:
            continue  # unpaid / overdue
        amount = inv.total if bucket != 2 else (inv.total / 2).quantize(Decimal("0.01"))
        method = ["UPI", "CASH", "BANK_TRANSFER", "CHEQUE", "UPI"][bucket]
        billing.record_offline_payment(
            school=greenfield,
            student=inv.student,
            amount=amount,
            method=method,
            received_by=gf_tm,
            transaction_reference=f"{method[:3]}-{inv.invoice_number[-5:]}-{i}",
            paid_at=_local_dt(greenfield, inv.period_start + timedelta(days=rng.randint(2, 9)), time(10, 30)),
            invoice=inv,
            notes="Recorded at transport office",
        )
    billing.mark_overdue_invoices(greenfield)
    # One reversed payment for audit history.
    from apps.billing.models import Payment

    some_payment = Payment.objects.filter(school=greenfield, status="VERIFIED", method="CASH").first()
    if some_payment:
        billing.reverse_payment(payment=some_payment, reason="Duplicate cash entry recorded by mistake", actor=gf_admin)
    late = Invoice.objects.filter(school=greenfield, status="OVERDUE").first()
    if late:
        billing.apply_late_fee(invoice=late, amount=Decimal("100"), reason="Late payment fee per school policy", actor=gf_admin)

    # ------------------------------------------------------------------ Greenfield engagement
    Announcement.objects.create(
        school=greenfield,
        title="Transport fee for this month due on the 10th",
        body="Please clear this month's transport fee through the parent app or at the transport office. Late fee applies after the due date.",
        audience="PARENTS",
        is_pinned=True,
        created_by=gf_admin,
        publish_at=now - timedelta(days=3),
        notification_sent_at=now - timedelta(days=3),
    )
    Announcement.objects.create(
        school=greenfield,
        title="Route R3 diversion this week",
        body="Due to road work on Sarjapur Road, buses will take the Carmelaram bypass. Expect 5-10 minutes delay at Dommasandra Circle.",
        audience="ROUTE",
        route=routes[2],
        created_by=gf_tm,
        publish_at=now - timedelta(days=1),
        notification_sent_at=now - timedelta(days=1),
    )
    Announcement.objects.create(
        school=greenfield,
        title="Annual bus safety drill",
        body="All drivers and attendants: safety drill on Saturday 9am at the school ground. Attendance mandatory.",
        audience="STAFF",
        created_by=gf_admin,
        publish_at=now - timedelta(hours=6),
    )
    c1 = Complaint.objects.create(
        school=greenfield,
        student=students[2],
        raised_by=parents[2].user,
        category="DELAY",
        priority="NORMAL",
        subject="Bus late three days in a row",
        description="The R3 bus reached Kasavanahalli 15-20 minutes late on Mon, Tue and Wed. Kids are missing the morning assembly.",
        status="IN_PROGRESS",
        assigned_to=gf_tm,
    )
    ComplaintComment.objects.create(
        school=greenfield,
        complaint=c1,
        author=gf_tm,
        body="Thanks for flagging. There is road work on Sarjapur Road; we have adjusted the start time by 5 minutes from Thursday.",
    )
    ComplaintComment.objects.create(
        school=greenfield, complaint=c1, author=gf_tm, body="Internal: consider swapping R3 to the 24-seater via Carmelaram.", is_internal=True
    )
    Complaint.objects.create(
        school=greenfield,
        student=students[5],
        raised_by=parents[5].user,
        category="VEHICLE",
        priority="HIGH",
        subject="Seat belt broken on bus 2",
        description="The seat belt on the second row left side of bus KA01AB5678 is not latching.",
        status="RESOLVED",
        resolution_notes="Replaced on 2nd service.",
        resolved_at=now - timedelta(days=5),
        assigned_to=gf_tm,
    )
    Complaint.objects.create(
        school=greenfield,
        raised_by=parents[8].user,
        category="APP",
        priority="LOW",
        subject="Location not updating",
        description="Yesterday evening the bus icon was stuck for 10 minutes.",
        status="OPEN",
    )
    AbsenceRequest.objects.create(
        school=greenfield,
        student=students[4],
        requested_by=parents[4],
        date_from=today + timedelta(days=1),
        date_to=today + timedelta(days=2),
        direction="BOTH",
        reason="Family travel",
        status="SUBMITTED",
    )
    AbsenceRequest.objects.create(
        school=greenfield,
        student=students[9],
        requested_by=parents[9],
        date_from=today - timedelta(days=3),
        date_to=today - timedelta(days=3),
        direction="PICKUP",
        reason="Doctor's appointment",
        status="ACKNOWLEDGED",
        acknowledged_by=gf_tm,
        acknowledged_at=now - timedelta(days=4),
    )
    r1_stops = [s for s in routes[0].ordered_stops() if not s.is_school_stop]
    PickupChangeRequest.objects.create(
        school=greenfield,
        student=students[0],
        requested_by=parents[0],
        change_type="STOP_CHANGE",
        effective_date=today + timedelta(days=7),
        requested_route=routes[0],
        requested_pickup_stop=r1_stops[1],
        requested_dropoff_stop=r1_stops[1],
        details="We are moving to Hope Farm from next week. Please change the pickup stop.",
        status="PENDING",
    )
    PickupChangeRequest.objects.create(
        school=greenfield,
        student=students[12],
        requested_by=parents[11] if len(parents) > 11 else parents[0],
        change_type="TEMPORARY",
        effective_date=today - timedelta(days=12),
        end_date=today - timedelta(days=8),
        requested_route=routes[0],
        requested_pickup_stop=r1_stops[0],
        details="Staying with grandparents for a week.",
        status="APPROVED",
        decided_by=gf_tm,
        decided_at=now - timedelta(days=14),
        decision_notes="Approved for one week.",
    )

    # Notifications: a realistic history for the primary demo parent (first parent) and a few others.
    demo_parent_user = parents[0].user
    demo_student = students[0]
    last_trip = Trip.objects.filter(school=greenfield, route=routes[0], direction="PICKUP", status="COMPLETED").order_by("-scheduled_date").first()
    for cat, title, body, delta in [
        (
            "ARRIVAL_SOON",
            "Bus arriving soon",
            f"Your child's school bus is approximately 10 minutes away from {r1_stops[0].name}. Please get ready.",
            timedelta(days=1, hours=2),
        ),
        (
            "BOARDED",
            f"{demo_student.first_name} boarded the bus",
            f"{demo_student.first_name} boarded Bus 1 at {r1_stops[0].name}.",
            timedelta(days=1, hours=1, minutes=50),
        ),
        (
            "SCHOOL_ARRIVAL",
            "Bus arrived at school",
            "Bus 1 has arrived at Greenfield International School. Students on board have been dropped off.",
            timedelta(days=1, hours=1, minutes=10),
        ),
        ("FEE_DUE", "Transport fee invoice issued", "Your transport fee invoice for this month is due on the 10th.", timedelta(days=3)),
        (
            "ANNOUNCEMENT",
            "Transport fee for this month due on the 10th",
            "Please clear this month's transport fee through the parent app.",
            timedelta(days=3, hours=1),
        ),
    ]:
        n = Notification.objects.create(
            school=greenfield,
            recipient=demo_parent_user,
            category=cat,
            title=title,
            body=body,
            trip=last_trip,
            student=demo_student,
            is_read=delta > timedelta(days=1, hours=1, minutes=30),
            dedupe_key=f"seed:{cat}:{delta.total_seconds()}",
        )
        Notification.objects.filter(pk=n.pk).update(created_at=now - delta)
        NotificationDelivery.objects.create(notification=n, channel=Channel.IN_APP, status="SENT", sent_at=now - delta)
        NotificationDelivery.objects.create(
            notification=n, channel=Channel.PUSH, status="SKIPPED", last_error="VAPID keys not configured", attempts=1
        )
    for p in parents[1:6]:
        n = Notification.objects.create(
            school=greenfield,
            recipient=p.user,
            category="ANNOUNCEMENT",
            title="Transport fee for this month due on the 10th",
            body="Please clear this month's transport fee through the parent app or at the transport office.",
            dedupe_key="seed:announcement:1",
        )
        NotificationDelivery.objects.create(notification=n, channel=Channel.IN_APP, status="SENT", sent_at=now)
    for u, title, body in [
        (
            gf_admin,
            "Documents expiring soon",
            "KA01AB5678: Insurance (expiring in 12 days)\nKA05EF3456: Insurance (expired)\nPrakash Shetty: driving licence expired",
        ),
        (gf_tm, "New complaint TKT: Bus late three days in a row", "The R3 bus reached Kasavanahalli 15-20 minutes late on Mon, Tue and Wed."),
    ]:
        n = Notification.objects.create(
            school=greenfield, recipient=u, category="DOCUMENT_EXPIRY" if "Documents" in title else "COMPLAINT", title=title, body=body
        )
        NotificationDelivery.objects.create(notification=n, channel=Channel.IN_APP, status="SENT", sent_at=now)

    # ------------------------------------------------------------------ Riverside (suspended) minimal but real data
    rs_admin = _user("admin@riverside.demo", "Farhan", "Ali", phone="+91 99890 10001")
    rs_m = _member(rs_admin, riverside, "SCHOOL_ADMIN")
    StaffProfile.objects.create(
        school=riverside,
        membership=rs_m,
        staff_type="SCHOOL_ADMIN",
        employee_id="RS-ADM-01",
        first_name="Farhan",
        last_name="Ali",
        email=rs_admin.email,
        phone=rs_admin.phone,
    )
    rs_driver_u = _user("driver1@riverside.demo", "Mohan", "Reddy", phone="+91 99890 20001")
    rs_driver = StaffProfile.objects.create(
        school=riverside,
        membership=_member(rs_driver_u, riverside, "DRIVER"),
        staff_type="DRIVER",
        employee_id="RS-DRV-01",
        first_name="Mohan",
        last_name="Reddy",
        email=rs_driver_u.email,
        phone=rs_driver_u.phone,
        licence_number="TS09 20180001",
        licence_expiry=date.today() + timedelta(days=500),
    )
    rs_bus1 = Vehicle.objects.create(
        school=riverside,
        registration_number="TS09AB1111",
        fleet_number="1",
        capacity=40,
        make="Tata",
        model="Starbus",
        year=2019,
        insurance_expiry=date.today() + timedelta(days=100),
    )
    Vehicle.objects.create(
        school=riverside,
        registration_number="TS09AB2222",
        fleet_number="2",
        capacity=32,
        make="Ashok Leyland",
        model="Sunshine",
        year=2018,
        status="INACTIVE",
    )
    assign_staff_to_vehicle(school=riverside, vehicle=rs_bus1, staff=rs_driver, role="DRIVER")
    rs_route = Route.objects.create(school=riverside, name="Gachibowli Circuit", code="G1", colour="#be123c", vehicle=rs_bus1, driver=rs_driver)
    for seq, (n_, lat, lng) in enumerate(
        [("Kondapur Junction", 17.4700, 78.3630), ("Hitech City MMTS", 17.4540, 78.3700), ("Gachibowli Stadium", 17.4420, 78.3480)], start=1
    ):
        RouteStop.objects.create(
            school=riverside,
            route=rs_route,
            name=n_,
            sequence=seq,
            latitude=Decimal(str(lat)),
            longitude=Decimal(str(lng)),
            planned_pickup_time=time(7, 0 + seq * 8),
        )
    RouteStop.objects.create(
        school=riverside,
        route=rs_route,
        name="Riverside Academy",
        sequence=4,
        latitude=Decimal("17.443500"),
        longitude=Decimal("78.377200"),
        is_school_stop=True,
        planned_pickup_time=time(7, 40),
    )
    RouteSchedule.objects.create(school=riverside, route=rs_route, direction="PICKUP", weekdays=[0, 1, 2, 3, 4], start_time=time(7, 0))
    rs_parent_u = _user("parent@riverside.demo", "Sameera", "Khan", phone="+91 99890 30001")
    rs_parent = ParentProfile.objects.create(
        school=riverside,
        membership=_member(rs_parent_u, riverside, "PARENT"),
        first_name="Sameera",
        last_name="Khan",
        email=rs_parent_u.email,
        phone=rs_parent_u.phone,
        status="ACTIVE",
    )
    rs_stops = [s for s in rs_route.ordered_stops() if not s.is_school_stop]
    for i in range(6):
        s = Student.objects.create(
            school=riverside,
            admission_number=f"RS{200 + i}",
            first_name=FIRST_NAMES[(i * 3) % len(FIRST_NAMES)],
            last_name=LAST_NAMES[(i * 5) % len(LAST_NAMES)],
            grade=str(3 + i),
            section="A",
        )
        if i == 0:
            GuardianStudent.objects.create(school=riverside, parent=rs_parent, student=s, relationship="MOTHER", is_primary=True)
        assign_student(school=riverside, student=s, route=rs_route, pickup_stop=rs_stops[i % 3], dropoff_stop=rs_stops[i % 3])

    # ------------------------------------------------------------------ Sunrise (new, onboarding)
    su_admin = _user("admin@sunrise.demo", "Neelam", "Patil", phone="+91 98230 10001")
    su_m = _member(su_admin, sunrise, "SCHOOL_ADMIN")
    StaffProfile.objects.create(
        school=sunrise,
        membership=su_m,
        staff_type="SCHOOL_ADMIN",
        employee_id="SU-ADM-01",
        first_name="Neelam",
        last_name="Patil",
        email=su_admin.email,
        phone=su_admin.phone,
    )
    Vehicle.objects.create(
        school=sunrise,
        registration_number="MH12XY4321",
        fleet_number="1",
        capacity=30,
        make="Force",
        model="Traveller",
        year=2024,
        insurance_expiry=date.today() + timedelta(days=300),
    )
    for i in range(2):
        Student.objects.create(
            school=sunrise,
            admission_number=f"SU{300 + i}",
            first_name=FIRST_NAMES[i + 10],
            last_name=LAST_NAMES[i + 3],
            grade=str(5 + i),
            section="B",
            transport_status="NONE",
        )
    Invitation.objects.create(
        school=sunrise, email="transport@sunrise.demo", first_name="Rahul", last_name="Jadhav", role="TRANSPORT_MANAGER", invited_by=su_admin
    )

    # The seeder owns this initially empty dataset. Every fabricated location/payment must be labelled.
    Trip.objects.all().update(is_simulated=True)
    GPSLocation.objects.all().update(is_simulated=True, source="SIMULATOR")
    VehicleLocation.objects.all().update(is_simulated=True)
    Payment.objects.all().update(is_simulated=True)

    return {
        "schools": School.objects.count(),
        "users": User.objects.count(),
        "vehicles": Vehicle.objects.count(),
        "routes": Route.objects.count(),
        "students": Student.objects.count(),
        "parents": ParentProfile.objects.count(),
        "trips": Trip.objects.count(),
        "gps_points": GPSLocation.objects.count(),
        "boarding_events": BoardingEvent.objects.count(),
        "invoices": Invoice.objects.count(),
        "notifications": Notification.objects.count(),
    }


def _complete_trip_history(trip: Trip, start_at: datetime, driver_user) -> None:
    """Backfill a completed trip: stop timings, student boarding, GPS samples along the polyline, boarding events."""
    path = trip.route.polyline(trip.direction)
    stops = list(trip.stops.select_related("route_stop").order_by("sequence"))
    total = sum(haversine_m(*a, *b) for a, b in zip(path, path[1:], strict=False))
    speed = rng.uniform(6.5, 9.5)  # m/s ~ 23-34 km/h
    duration = total / speed + 90 * (len(stops) - 1)
    trip.status = "IN_PROGRESS"
    trip.started_at = start_at
    trip.save(update_fields=["status", "started_at"])
    # GPS samples every ~40 s
    t = 0.0
    points = []
    while t <= duration:
        dist = min(total, t * speed * (total / (duration - 90 * (len(stops) - 1)) / speed if duration > 0 else 1))
        remaining = dist
        lat, lon, heading = path[0][0], path[0][1], 0.0
        for a, b in zip(path, path[1:], strict=False):
            seg = haversine_m(*a, *b)
            if remaining <= seg:
                frac = 0 if seg == 0 else remaining / seg
                lat, lon = interpolate(*a, *b, frac)
                heading = bearing_deg(*a, *b)
                break
            remaining -= seg
        else:
            lat, lon = path[-1]
        jitter = rng.uniform(-0.00008, 0.00008)
        points.append(
            GPSLocation(
                school=trip.school,
                trip=trip,
                vehicle=trip.vehicle,
                latitude=lat + jitter,
                longitude=lon + jitter,
                accuracy_m=rng.uniform(5, 18),
                speed_mps=speed * rng.uniform(0.6, 1.1),
                heading=heading,
                recorded_at=start_at + timedelta(seconds=t),
                source="DRIVER_PWA",
            )
        )
        t += 40
    GPSLocation.objects.bulk_create(points)
    # Stop timings proportional to cumulative distance.
    cum = 0.0
    stop_times = []
    for i, ts in enumerate(stops):
        if i > 0:
            cum += haversine_m(*path[min(i - 1, len(path) - 1)], *path[min(i, len(path) - 1)])
        arrive = start_at + timedelta(seconds=cum / speed + 90 * i)
        ts.status = "DEPARTED"
        ts.arrived_at = arrive
        ts.departed_at = arrive + timedelta(seconds=rng.randint(45, 150))
        ts.eta = arrive
        ts.distance_remaining_m = 0
        ts.save()
        stop_times.append(ts)
    last_stop = stops[-1]
    for tstu in trip.trip_students.select_related("student", "trip_stop"):
        roll = rng.random()
        stop = tstu.trip_stop or stops[0]
        if roll < 0.07:
            tstu.status = "ABSENT"
            tstu.absence_reason = rng.choice(["Reported sick", "Family travel", "Doctor appointment"])
            tstu.save()
            BoardingEvent.objects.create(
                school=trip.school,
                trip=trip,
                trip_student=tstu,
                student=tstu.student,
                trip_stop=stop,
                event_type="ABSENT",
                occurred_at=start_at - timedelta(hours=1),
                note=tstu.absence_reason,
            )
            continue
        if roll < 0.10 and trip.direction == "PICKUP":
            tstu.status = "NO_SHOW"
            tstu.save()
            BoardingEvent.objects.create(
                school=trip.school,
                trip=trip,
                trip_student=tstu,
                student=tstu.student,
                trip_stop=stop,
                event_type="NO_SHOW",
                occurred_at=stop.departed_at,
                recorded_by=driver_user,
                note="Not present at departure",
            )
            continue
        if trip.direction == "PICKUP":
            tstu.boarded_at = stop.arrived_at + timedelta(seconds=rng.randint(10, 60))
            tstu.dropped_at = last_stop.arrived_at + timedelta(seconds=rng.randint(30, 200))
            BoardingEvent.objects.create(
                school=trip.school,
                trip=trip,
                trip_student=tstu,
                student=tstu.student,
                trip_stop=stop,
                event_type="BOARDED",
                occurred_at=tstu.boarded_at,
                recorded_by=driver_user,
                latitude=float(stop.route_stop.latitude),
                longitude=float(stop.route_stop.longitude),
            )
            BoardingEvent.objects.create(
                school=trip.school,
                trip=trip,
                trip_student=tstu,
                student=tstu.student,
                trip_stop=last_stop,
                event_type="DROPPED",
                occurred_at=tstu.dropped_at,
                recorded_by=driver_user,
                latitude=float(last_stop.route_stop.latitude),
                longitude=float(last_stop.route_stop.longitude),
                note="Arrived at school",
            )
        else:
            tstu.boarded_at = stops[0].arrived_at + timedelta(seconds=rng.randint(10, 120))
            tstu.dropped_at = stop.arrived_at + timedelta(seconds=rng.randint(10, 60))
            BoardingEvent.objects.create(
                school=trip.school,
                trip=trip,
                trip_student=tstu,
                student=tstu.student,
                trip_stop=stops[0],
                event_type="BOARDED",
                occurred_at=tstu.boarded_at,
                recorded_by=driver_user,
            )
            BoardingEvent.objects.create(
                school=trip.school,
                trip=trip,
                trip_student=tstu,
                student=tstu.student,
                trip_stop=stop,
                event_type="DROPPED",
                occurred_at=tstu.dropped_at,
                recorded_by=driver_user,
                latitude=float(stop.route_stop.latitude),
                longitude=float(stop.route_stop.longitude),
            )
        tstu.status = "DROPPED"
        tstu.marked_by = driver_user
        tstu.save()
    trip.status = "COMPLETED"
    trip.ended_at = last_stop.arrived_at + timedelta(minutes=3)
    trip.last_location_at = points[-1].recorded_at if points else trip.ended_at
    trip.delay_minutes = rng.choice([0, 0, 1, 2, 3, 5, 8, 12, -1])
    trips._recount(trip)
    trip.save()
    TripEvent.objects.create(school=trip.school, trip=trip, event_type="STARTED", occurred_at=start_at, created_by=driver_user)
    TripEvent.objects.create(school=trip.school, trip=trip, event_type="COMPLETED", occurred_at=trip.ended_at, created_by=driver_user)
    if trip.delay_minutes >= 8:
        TripEvent.objects.create(
            school=trip.school,
            trip=trip,
            event_type="DELAY",
            description="Traffic congestion",
            data={"minutes": trip.delay_minutes},
            occurred_at=start_at + timedelta(minutes=10),
            created_by=driver_user,
        )
