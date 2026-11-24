import pytest
from django.conf import settings
from django.core import mail
from rest_framework.test import APIClient

from apps.accounts.models import Invitation
from apps.schools.models import School, SchoolApplication, SchoolMembership

from .conftest import PASSWORD

pytestmark = pytest.mark.django_db


def test_login_sets_refresh_cookie_and_returns_access(school_a):
    client = APIClient()
    r = client.post("/api/auth/login/", {"email": school_a.admin.email, "password": PASSWORD}, format="json")
    assert r.status_code == 200
    assert "access" in r.data
    assert settings.REFRESH_COOKIE_NAME in r.cookies
    assert r.cookies[settings.REFRESH_COOKIE_NAME]["httponly"]
    assert r.data["user"]["memberships"][0]["role"] == "SCHOOL_ADMIN"
    assert "vehicles.manage" in r.data["user"]["memberships"][0]["permissions"]


def test_login_wrong_password(school_a):
    r = APIClient().post("/api/auth/login/", {"email": school_a.admin.email, "password": "nope"}, format="json")
    assert r.status_code == 400
    assert r.data["code"] == "validation_error"


def test_refresh_rotates_cookie_and_logout_blacklists(school_a):
    client = APIClient()
    r = client.post("/api/auth/login/", {"email": school_a.admin.email, "password": PASSWORD}, format="json")
    first = r.cookies[settings.REFRESH_COOKIE_NAME].value
    r2 = client.post("/api/auth/refresh/")
    assert r2.status_code == 200 and "access" in r2.data
    assert r2.cookies[settings.REFRESH_COOKIE_NAME].value != first
    # old refresh token is blacklisted
    client.cookies[settings.REFRESH_COOKIE_NAME] = first
    assert client.post("/api/auth/refresh/").status_code == 401
    r3 = client.post("/api/auth/logout/")
    assert r3.status_code == 204


def test_unauthenticated_requests_rejected(db):
    assert APIClient().get("/api/school/dashboard/").status_code == 401
    assert APIClient().get("/api/platform/overview/").status_code == 401


def test_password_reset_flow(school_a):
    client = APIClient()
    r = client.post("/api/auth/password-reset/", {"email": school_a.parent.email}, format="json")
    assert r.status_code == 200
    assert len(mail.outbox) == 1
    link = [line for line in mail.outbox[0].body.splitlines() if "reset-password" in line][0]
    qs = link.split("?", 1)[1]
    params = dict(p.split("=") for p in qs.split("&"))
    r = client.post(
        "/api/auth/password-reset/confirm/", {"uid": params["uid"], "token": params["token"], "new_password": "Brand-New-Pass-9"}, format="json"
    )
    assert r.status_code == 200
    assert client.post("/api/auth/login/", {"email": school_a.parent.email, "password": "Brand-New-Pass-9"}, format="json").status_code == 200
    # unknown emails do not leak existence
    assert client.post("/api/auth/password-reset/", {"email": "ghost@nowhere.test"}, format="json").status_code == 200


def test_school_registration_approval_and_admin_provisioning(superadmin, plan):
    client = APIClient()
    r = client.post(
        "/api/public/register-school/",
        {
            "school_name": "Lakeview High",
            "contact_name": "Meena Raman",
            "contact_email": "meena@lakeview.test",
            "contact_phone": "+91 5",
            "address": "Lake Rd",
            "city": "Chennai",
            "estimated_students": 300,
            "estimated_vehicles": 4,
        },
        format="json",
    )
    assert r.status_code == 201
    code = r.data["tracking_code"]
    assert SchoolApplication.objects.get(tracking_code=code).status == "PENDING"
    assert client.get(f"/api/public/applications/{code}/").data["status"] == "PENDING"
    # Applicant has no access before approval: no user exists / no school.
    assert not School.objects.filter(name="Lakeview High").exists()

    sa = APIClient()
    sa.force_authenticate(superadmin)
    app_id = SchoolApplication.objects.get(tracking_code=code).id
    r = sa.post(f"/api/platform/applications/{app_id}/approve/", {"plan": str(plan.id), "notes": "ok"}, format="json")
    assert r.status_code == 201
    school = School.objects.get(name="Lakeview High")
    assert school.status == School.Status.APPROVED and school.subscription.plan == plan
    invitation = Invitation.objects.get(school=school, role="SCHOOL_ADMIN")
    assert any("invite/" in m.body for m in mail.outbox)
    # approving twice is rejected
    assert sa.post(f"/api/platform/applications/{app_id}/approve/", {}, format="json").status_code == 400

    # Accept invitation -> account created, school becomes ACTIVE, admin can log in and sees onboarding.
    r = client.post("/api/auth/invitations/accept/", {"token": invitation.token, "password": "Strong-Pass-123", "first_name": "Meena"}, format="json")
    assert r.status_code == 200
    school.refresh_from_db()
    assert school.status == School.Status.ACTIVE
    assert SchoolMembership.objects.filter(school=school, role="SCHOOL_ADMIN", user__email="meena@lakeview.test", is_active=True).exists()
    # token is single-use
    assert client.post("/api/auth/invitations/accept/", {"token": invitation.token, "password": "x"}, format="json").status_code == 400
    admin_client = APIClient()
    admin_client.credentials(HTTP_AUTHORIZATION=f"Bearer {r.data['access']}")
    onboarding = admin_client.get("/api/school/onboarding/")
    assert onboarding.status_code == 200 and onboarding.data["completed"] is False


def test_rejected_application_cannot_be_approved(superadmin):
    app = SchoolApplication.objects.create(school_name="X", contact_name="Y", contact_email="y@x.test", contact_phone="1", address="a", city="c")
    sa = APIClient()
    sa.force_authenticate(superadmin)
    assert sa.post(f"/api/platform/applications/{app.id}/reject/", {"notes": "no"}, format="json").status_code == 200
    assert sa.post(f"/api/platform/applications/{app.id}/approve/", {}, format="json").status_code == 400


def test_suspended_school_blocks_operational_access(school_a, superadmin, as_user):
    sa = as_user(superadmin)
    r = sa.post(f"/api/platform/schools/{school_a.school.id}/suspend/", {"reason": "unpaid"}, format="json")
    assert r.status_code == 200 and r.data["status"] == "SUSPENDED"
    admin = as_user(school_a.admin)
    assert admin.get("/api/fleet/vehicles/").status_code == 403
    assert admin.get("/api/school/dashboard/").status_code == 403
    assert admin.get("/api/school/profile/").status_code == 200  # may still see status page data
    assert as_user(school_a.parent).get("/api/parent/home/").status_code == 403
    assert as_user(school_a.driver).get("/api/driver/home/").status_code == 403
    assert sa.post(f"/api/platform/schools/{school_a.school.id}/reactivate/").status_code == 200
    assert admin.get("/api/fleet/vehicles/").status_code == 200


def test_me_endpoint_lists_memberships(school_a, as_user):
    r = as_user(school_a.admin).get("/api/auth/me/")
    assert r.status_code == 200
    assert r.data["memberships"][0]["school_id"] == str(school_a.school.id)
