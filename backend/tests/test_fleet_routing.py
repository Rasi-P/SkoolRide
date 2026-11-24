from datetime import date, timedelta

import pytest

from apps.fleet.models import StaffVehicleAssignment
from apps.people.models import StaffProfile
from apps.routing.models import StudentTransportAssignment

pytestmark = pytest.mark.django_db


def test_assign_driver_validates_type_and_keeps_history(school_a, as_user):
    a = as_user(school_a.admin)
    # attendant cannot be assigned as driver
    r = a.post(
        f"/api/fleet/vehicles/{school_a.vehicle.id}/assign-staff/", {"staff": str(school_a.attendant_profile.id), "role": "DRIVER"}, format="json"
    )
    assert r.status_code == 400 and "staff" in r.data["errors"]
    # assign attendant as attendant
    r = a.post(
        f"/api/fleet/vehicles/{school_a.vehicle.id}/assign-staff/", {"staff": str(school_a.attendant_profile.id), "role": "ATTENDANT"}, format="json"
    )
    assert r.status_code == 201
    # new driver replaces old, old assignment ends with history
    new_driver = StaffProfile.objects.create(
        school=school_a.school,
        staff_type="DRIVER",
        employee_id="AAA-D2",
        first_name="New",
        phone="1",
        licence_expiry=date.today() + timedelta(days=30),
    )
    r = a.post(f"/api/fleet/vehicles/{school_a.vehicle.id}/assign-staff/", {"staff": str(new_driver.id), "role": "DRIVER"}, format="json")
    assert r.status_code == 201
    assert StaffVehicleAssignment.objects.filter(vehicle=school_a.vehicle, role="DRIVER", is_active=True).count() == 1
    assert StaffVehicleAssignment.objects.filter(staff=school_a.driver_profile, is_active=False, end_date__isnull=False).exists()
    hist = a.get(f"/api/fleet/vehicles/{school_a.vehicle.id}/history/")
    assert len(hist.data["assignments"]) == 3


def test_expired_licence_driver_cannot_be_assigned(school_a, as_user):
    school_a.driver_profile.licence_expiry = date.today() - timedelta(days=1)
    school_a.driver_profile.save()
    r = as_user(school_a.admin).post(
        f"/api/fleet/vehicles/{school_a.vehicle.id}/assign-staff/", {"staff": str(school_a.driver_profile.id), "role": "DRIVER"}, format="json"
    )
    assert r.status_code == 400


def test_vehicle_document_alerts_and_capacity_guard(school_a, as_user):
    a = as_user(school_a.admin)
    r = a.patch(
        f"/api/fleet/vehicles/{school_a.vehicle.id}/",
        {"insurance_expiry": str(date.today() - timedelta(days=1)), "permit_expiry": str(date.today() + timedelta(days=5))},
        format="json",
    )
    assert r.status_code == 200
    levels = {alert["document"]: alert["level"] for alert in r.data["document_alerts"]}
    assert levels["Insurance"] == "expired" and levels["Permit"] == "expiring"
    assert r.data["has_expired_documents"] is True
    # capacity cannot go below assigned students (2 assigned)
    r = a.patch(f"/api/fleet/vehicles/{school_a.vehicle.id}/", {"capacity": 1}, format="json")
    assert r.status_code == 400 and "capacity" in r.data["errors"]


def test_route_capacity_overflow_rejected(school_a, as_user):
    a = as_user(school_a.admin)
    from apps.people.models import Student

    s3 = Student.objects.create(school=school_a.school, admission_number="AAA-S3", first_name="Three", grade="5")
    r = a.post(
        "/api/routing/assignments/", {"student": str(s3.id), "route": str(school_a.route.id), "pickup_stop": str(school_a.stops[0].id)}, format="json"
    )
    assert r.status_code == 201  # capacity 3, third student fits
    s4 = Student.objects.create(school=school_a.school, admission_number="AAA-S4", first_name="Four", grade="5")
    r = a.post(
        "/api/routing/assignments/", {"student": str(s4.id), "route": str(school_a.route.id), "pickup_stop": str(school_a.stops[0].id)}, format="json"
    )
    assert r.status_code == 400 and "capacity" in r.data["detail"].lower()


def test_stop_must_belong_to_route_and_reassignment_keeps_history(school_a, school_b, as_user):
    a = as_user(school_a.admin)
    student = school_a.students[0]
    r = a.post(
        "/api/routing/assignments/",
        {"student": str(student.id), "route": str(school_a.route.id), "pickup_stop": str(school_b.stops[0].id)},
        format="json",
    )
    assert r.status_code == 400
    r = a.post(
        "/api/routing/assignments/",
        {"student": str(student.id), "route": str(school_a.route.id), "pickup_stop": str(school_a.stops[2].id)},
        format="json",
    )
    assert r.status_code == 201
    assert StudentTransportAssignment.objects.filter(student=student).count() == 2
    assert StudentTransportAssignment.objects.filter(student=student, is_active=True).count() == 1
    hist = a.get(f"/api/people/students/{student.id}/history/")
    assert len(hist.data) == 2


def test_replace_route_stops_preserves_ids_and_blocks_removal_with_students(school_a, as_user):
    a = as_user(school_a.admin)
    stops = a.get(f"/api/routing/routes/{school_a.route.id}/stops/").data
    payload = [
        {"id": s["id"], "name": s["name"] + "!", "latitude": s["latitude"], "longitude": s["longitude"], "is_school_stop": s["is_school_stop"]}
        for s in reversed(stops)
    ]
    r = a.put(f"/api/routing/routes/{school_a.route.id}/stops/", payload, format="json")
    assert r.status_code == 200
    assert [s["sequence"] for s in r.data] == [1, 2, 3, 4]
    assert r.data[0]["id"] == stops[-1]["id"]  # ids preserved through reordering
    # removing a stop with students assigned is rejected
    r = a.put(f"/api/routing/routes/{school_a.route.id}/stops/", payload[:2], format="json")
    assert r.status_code == 400
    # fewer than two stops rejected
    assert a.put(f"/api/routing/routes/{school_a.route.id}/stops/", payload[:1], format="json").status_code == 400
    route = a.get(f"/api/routing/routes/{school_a.route.id}/").data
    assert route["version"] >= 2


def test_student_withdraw_and_transfer_end_assignments(school_a, as_user):
    a = as_user(school_a.admin)
    s = school_a.students[0]
    r = a.post(f"/api/people/students/{s.id}/withdraw-transport/", {"reason": "moved"}, format="json")
    assert r.status_code == 200 and r.data["transport_status"] == "WITHDRAWN" and r.data["transport"] is None
    s2 = school_a.students[1]
    r = a.post(f"/api/people/students/{s2.id}/transfer/", {"reason": "left"}, format="json")
    assert r.status_code == 200 and r.data["status"] == "TRANSFERRED"
    assert not StudentTransportAssignment.objects.filter(student=s2, is_active=True).exists()


def test_student_csv_import_preview_and_commit(school_a, as_user):
    from django.core.files.uploadedfile import SimpleUploadedFile

    a = as_user(school_a.admin)
    csv = (
        "admission_number,first_name,last_name,grade,section,parent_first_name,parent_email,parent_phone\n"
        "AAA-S0,Dup,Existing,5,A,,,\n"
        "NEW-1,Nina,Rao,3,B,Rekha,rekha@x.test,+91 9\n"
        "NEW-1,Again,Rao,3,B,,,\n"
        ",Missing,Adm,3,B,,,\n"
    )
    preview = a.post("/api/people/students/import/", {"file": SimpleUploadedFile("s.csv", csv.encode())}, format="multipart")
    assert preview.status_code == 200
    statuses = [r["status"] for r in preview.data["rows"]]
    assert statuses == ["duplicate_existing", "ok", "duplicate_in_file", "error"]
    commit = a.post("/api/people/students/import/?commit=true", {"file": SimpleUploadedFile("s.csv", csv.encode())}, format="multipart")
    assert commit.status_code == 200
    assert commit.data["created_students"] == 1 and commit.data["created_parents"] == 1 and commit.data["guardian_links"] == 1


def test_parent_invite_links_profile_on_accept(school_a, as_user):
    from rest_framework.test import APIClient

    from apps.people.models import ParentProfile

    a = as_user(school_a.admin)
    r = a.post("/api/people/parents/", {"first_name": "New", "last_name": "Parent", "email": "new.parent@aaa.test", "phone": "+91 7"}, format="json")
    assert r.status_code == 201
    pid = r.data["id"]
    r = a.post(f"/api/people/parents/{pid}/invite/")
    assert r.status_code == 201
    from apps.accounts.models import Invitation

    token = Invitation.objects.get(email="new.parent@aaa.test").token
    r = APIClient().post("/api/auth/invitations/accept/", {"token": token, "password": "Parent-Pass-1"}, format="json")
    assert r.status_code == 200
    profile = ParentProfile.objects.get(pk=pid)
    assert profile.membership is not None and profile.membership.role == "PARENT"
