"""Authenticated file delivery; storage paths alone never grant access."""
from pathlib import PurePosixPath

from django.http import FileResponse
from drf_spectacular.utils import extend_schema
from rest_framework.exceptions import NotFound
from rest_framework.views import APIView

from apps.accounts.models import User
from apps.fleet.models import VehicleDocument
from apps.people.models import StaffDocument, StaffProfile, Student
from apps.schools.models import School
from apps.trips.access import assigned_trips

from .roles import MANAGEMENT_ROLES
from .tenancy import resolve_tenant


class ProtectedMediaView(APIView):
    @extend_schema(exclude=True)
    def get(self, request, name):
        ctx = resolve_tenant(request)
        if ".." in PurePosixPath(name).parts:
            raise NotFound()
        mappings = {
            "avatars": (User, "avatar"), "school_logos": (School, "logo"),
            "staff_photos": (StaffProfile, "photo"), "student_photos": (Student, "photo"),
            "staff_documents": (StaffDocument, "file"), "vehicle_documents": (VehicleDocument, "file"),
        }
        mapping = mappings.get(name.split("/", 1)[0])
        if mapping is None:
            raise NotFound()
        model, field = mapping
        records = model.objects.filter(**{field: name})
        if model is User:
            records = records.filter(pk=request.user.pk)
        elif not ctx.is_platform_admin:
            if ctx.school is None or not ctx.school.is_operational:
                raise NotFound()
            records = records.filter(pk=ctx.school.pk) if model is School else records.filter(school=ctx.school)
            if model is not School and ctx.role not in MANAGEMENT_ROLES:
                if model is Student and ctx.role == "PARENT":
                    parent = getattr(ctx.membership, "parent_profile", None)
                    records = records.filter(guardian_links__parent=parent) if parent and parent.status != "SUSPENDED" else records.none()
                elif model is Student and ctx.role in ("DRIVER", "ATTENDANT"):
                    trips = assigned_trips(getattr(ctx.membership, "staff_profile", None)).filter(status__in=["SCHEDULED", "IN_PROGRESS", "PAUSED"])
                    records = records.filter(trip_students__trip__in=trips)
                elif model is StaffProfile:
                    records = records.filter(membership=ctx.membership)
                else:
                    records = records.none()
        obj = records.first()
        if obj is None:
            raise NotFound()
        stored = getattr(obj, field)
        try:
            handle = stored.open("rb")
        except (FileNotFoundError, OSError):
            raise NotFound() from None
        response = FileResponse(handle, as_attachment=field == "file", filename=PurePosixPath(name).name)
        response["Cache-Control"] = "no-store, private"
        response["X-Content-Type-Options"] = "nosniff"
        response["Content-Security-Policy"] = "default-src 'none'; sandbox"
        return response
