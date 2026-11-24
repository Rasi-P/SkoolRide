import pytest
from django.core.files.base import ContentFile
from rest_framework.test import APIClient

from apps.fleet.models import VehicleDocument
from apps.schools.models import SchoolMembership

pytestmark = pytest.mark.django_db


def test_uploaded_vehicle_documents_require_tenant_membership(school_a, school_b, as_user, settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path
    doc = VehicleDocument.objects.create(school=school_a.school, vehicle=school_a.vehicle, doc_type="INSURANCE", title="Insurance")
    doc.file.save("insurance.txt", ContentFile(b"Private policy"))
    url = doc.file.url
    assert APIClient().get(url).status_code == 401
    assert as_user(school_b.admin).get(url).status_code == 404
    assert as_user(school_a.parent).get(url).status_code == 404
    response = as_user(school_a.admin).get(url)
    assert response.status_code == 200
    assert b"".join(response.streaming_content) == b"Private policy"
    assert response["Cache-Control"] == "no-store, private"
    assert response["Content-Disposition"].startswith("attachment;")
    school_a.school.status = "SUSPENDED"
    school_a.school.save()
    assert as_user(school_a.admin).get(url).status_code == 404


def test_parent_can_fetch_only_linked_child_photos(school_a, school_b, as_user, settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path
    own, other = school_a.students[0], school_b.students[0]
    own.photo.save("own.png", ContentFile(b"image"))
    other.photo.save("other.png", ContentFile(b"image"))
    parent = as_user(school_a.parent)
    response = parent.get(own.photo.url)
    assert response.status_code == 200
    assert b"".join(response.streaming_content) == b"image"
    assert parent.get(other.photo.url).status_code == 404
    own.guardian_links.all().delete()
    assert parent.get(own.photo.url).status_code == 404


def test_membership_selection_handles_two_roles_in_same_school(school_a, school_b, as_user):
    admin_membership = SchoolMembership.objects.get(user=school_a.admin, school=school_a.school)
    driver_membership = SchoolMembership.objects.create(user=school_a.admin, school=school_a.school, role="DRIVER")
    client = as_user(school_a.admin)
    client.credentials(HTTP_X_MEMBERSHIP_ID=str(driver_membership.id))
    assert client.get("/api/fleet/vehicles/").status_code == 403
    client.credentials(HTTP_X_MEMBERSHIP_ID=str(admin_membership.id))
    assert client.get("/api/fleet/vehicles/").status_code == 200
    other = SchoolMembership.objects.get(user=school_b.admin, school=school_b.school)
    client.credentials(HTTP_X_MEMBERSHIP_ID=str(other.id))
    assert client.get("/api/fleet/vehicles/").status_code == 403
