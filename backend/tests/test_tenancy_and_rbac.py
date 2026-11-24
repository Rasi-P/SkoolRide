"""Cross-tenant isolation and role-based access control. Every protected API must enforce on the server."""

import pytest
from asgiref.sync import async_to_sync

from apps.trips.consumers import _can_view_trip
from apps.trips.services import create_trip

pytestmark = pytest.mark.django_db


def test_list_endpoints_only_return_own_school(school_a, school_b, as_user):
    a = as_user(school_a.admin)
    for path, key in [
        ("/api/fleet/vehicles/", "registration_number"),
        ("/api/routing/routes/", "code"),
        ("/api/people/students/", "admission_number"),
        ("/api/people/parents/", "email"),
        ("/api/people/staff/", "employee_id"),
    ]:
        r = a.get(path)
        assert r.status_code == 200, path
        values = [row[key] for row in r.data["results"]]
        assert all("BBB" not in v for v in values), (path, values)
        assert len(values) >= 1


def test_retrieve_other_school_object_is_404(school_a, school_b, as_user):
    a = as_user(school_a.admin)
    assert a.get(f"/api/fleet/vehicles/{school_b.vehicle.id}/").status_code == 404
    assert a.get(f"/api/people/students/{school_b.students[0].id}/").status_code == 404
    assert a.get(f"/api/routing/routes/{school_b.route.id}/").status_code == 404
    assert a.patch(f"/api/fleet/vehicles/{school_b.vehicle.id}/", {"capacity": 99}, format="json").status_code == 404
    assert a.delete(f"/api/people/students/{school_b.students[0].id}/").status_code == 404


def test_x_school_id_header_cannot_escalate_to_other_school(school_a, school_b, as_user):
    a = as_user(school_a.admin, school_id=school_b.school.id)
    assert a.get("/api/fleet/vehicles/").status_code == 403
    # a bogus id is also rejected (and does not reveal existence)
    a2 = as_user(school_a.admin, school_id="00000000-0000-0000-0000-000000000000")
    assert a2.get("/api/fleet/vehicles/").status_code == 403


def test_platform_admin_can_scope_to_any_school(school_a, school_b, superadmin, as_user):
    sa = as_user(superadmin, school_id=school_b.school.id)
    r = sa.get("/api/fleet/vehicles/")
    assert r.status_code == 200 and r.data["results"][0]["registration_number"] == school_b.vehicle.registration_number


def test_cross_school_foreign_keys_rejected(school_a, school_b, as_user):
    a = as_user(school_a.admin)
    r = a.post("/api/routing/routes/", {"name": "Bad", "code": "BAD", "vehicle": str(school_b.vehicle.id)}, format="json")
    assert r.status_code == 400 and "vehicle" in r.data["errors"]
    r = a.post(
        "/api/routing/assignments/",
        {"student": str(school_b.students[0].id), "route": str(school_a.route.id), "pickup_stop": str(school_a.stops[0].id)},
        format="json",
    )
    assert r.status_code == 400 and "student" in r.data["errors"]
    r = a.post("/api/people/guardian-links/", {"parent": str(school_b.parent_profile.id), "student": str(school_a.students[0].id)}, format="json")
    assert r.status_code == 400
    r = a.post("/api/billing/fee-assignments/", {"student": str(school_a.students[0].id), "fee_plan": str(school_b.fee_plan.id)}, format="json")
    assert r.status_code == 400
    r = a.post(
        "/api/trips/trips/",
        {"route": str(school_b.route.id), "direction": "PICKUP", "scheduled_date": "2030-01-01", "scheduled_start_time": "07:00"},
        format="json",
    )
    assert r.status_code == 400


def test_exports_and_reports_are_scoped(school_a, school_b, as_user):
    a = as_user(school_a.admin)
    csv = a.get("/api/people/students/export/").content.decode()
    assert "AAA-S0" in csv and "BBB-S0" not in csv
    r = a.get("/api/reports/students/")
    assert r.status_code == 200
    assert all("BBB" not in row["route"] for row in r.data["by_route"])


def test_role_matrix(school_a, as_user):
    tm, attendant, driver, parent = (as_user(u) for u in (school_a.tm, school_a.attendant, school_a.driver, school_a.parent))
    # Transport manager: operations yes, school settings / billing config / audit no
    assert tm.get("/api/fleet/vehicles/").status_code == 200
    assert tm.patch("/api/school/profile/", {"name": "x"}, format="json").status_code == 403
    assert tm.get("/api/school/audit-logs/").status_code == 403
    assert tm.post("/api/billing/fee-plans/", {"name": "x", "code": "X", "amount": "1"}, format="json").status_code == 403
    # Attendant/driver: no fleet or student management
    for c in (attendant, driver):
        assert c.get("/api/fleet/vehicles/").status_code == 403
        assert c.get("/api/people/students/").status_code == 403
        assert c.get("/api/billing/invoices/").status_code == 403
        assert c.get("/api/driver/home/").status_code == 200
    # Parent: nothing administrative, no driver API, no platform
    for path in [
        "/api/fleet/vehicles/",
        "/api/people/students/",
        "/api/trips/trips/",
        "/api/school/dashboard/",
        "/api/driver/home/",
        "/api/platform/overview/",
        "/api/billing/invoices/",
        "/api/reports/attendance/",
    ]:
        assert parent.get(path).status_code == 403, path
    assert parent.get("/api/parent/children/").status_code == 200
    # School admin cannot touch platform endpoints
    assert as_user(school_a.admin).get("/api/platform/schools/").status_code == 403


def test_parent_cannot_access_other_parents_children(school_a, school_b, as_user):
    p = as_user(school_a.parent)
    r = p.get("/api/parent/children/")
    ids = {c["id"] for c in r.data}
    assert ids == {str(s.id) for s in school_a.students}
    other = school_b.students[0]
    for path in [
        f"/api/parent/children/{other.id}/live/",
        f"/api/parent/children/{other.id}/trips/",
        f"/api/parent/children/{other.id}/attendance/",
        f"/api/parent/children/{other.id}/schedule/",
    ]:
        assert p.get(path).status_code == 404, path
    assert (
        p.post(
            "/api/parent/absence-requests/", {"student": str(other.id), "date_from": "2030-01-01", "date_to": "2030-01-02"}, format="json"
        ).status_code
        == 400
    )


def test_parent_payloads_do_not_leak_other_students(school_a, as_user):
    trip = create_trip(school=school_a.school, route=school_a.route, direction="PICKUP", scheduled_date="2030-01-01", scheduled_start_time="07:00:00")
    p = as_user(school_a.parent)
    r = p.get(f"/api/parent/children/{school_a.students[0].id}/live/?trip={trip.id}")
    assert r.status_code == 200
    for stop in r.data["stops"]:
        assert "expected_count" not in stop and "boarded_count" not in stop
    assert "students" not in r.data


@pytest.mark.django_db(transaction=True)
def test_websocket_authorization_rules(school_a, school_b, superadmin):
    trip = create_trip(school=school_a.school, route=school_a.route, direction="PICKUP", scheduled_date="2030-01-01", scheduled_start_time="07:00:00")
    check = async_to_sync(_can_view_trip)
    assert check(school_a.admin, trip.id) is not None
    assert check(school_a.driver, trip.id) is not None
    assert check(school_a.parent, trip.id) is not None  # child on this trip
    assert check(superadmin, trip.id) is not None
    assert check(school_b.admin, trip.id) is None
    assert check(school_b.parent, trip.id) is None
    from django.contrib.auth.models import AnonymousUser

    assert check(AnonymousUser(), trip.id) is None


def test_driver_cannot_see_or_modify_other_drivers_trip(school_a, school_b, as_user):
    trip_b = create_trip(
        school=school_b.school, route=school_b.route, direction="PICKUP", scheduled_date="2030-01-01", scheduled_start_time="07:00:00"
    )
    d = as_user(school_a.driver)
    assert d.get(f"/api/driver/trips/{trip_b.id}/").status_code == 404
    assert d.post(f"/api/driver/trips/{trip_b.id}/start/").status_code == 404
    assert d.post(f"/api/driver/trips/{trip_b.id}/location/", {"latitude": 1, "longitude": 1}, format="json").status_code == 404


def test_audit_log_records_sensitive_operations(school_a, as_user):
    a = as_user(school_a.admin)
    r = a.post("/api/fleet/vehicles/", {"registration_number": "KA99ZZ0001", "capacity": 20}, format="json")
    assert r.status_code == 201
    logs = a.get("/api/school/audit-logs/?action=vehicle.created")
    assert logs.status_code == 200 and logs.data["count"] == 1
    assert logs.data["results"][0]["actor_email"] == school_a.admin.email
