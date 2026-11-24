from __future__ import annotations

from django.db import connection
from django.db.models import QuerySet
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema as _extend_schema
from rest_framework import mixins, viewsets
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .permissions import HasSchoolPerm
from .tenancy import resolve_tenant


@_extend_schema(responses={200: OpenApiTypes.OBJECT})
class HealthView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = []

    def get(self, request):
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
            db_ok = True
        except Exception:  # pragma: no cover
            db_ok = False
        return Response({"status": "ok" if db_ok else "degraded", "database": db_ok})


class TenantViewSetMixin:
    """Scopes every queryset to the resolved school and injects it on create.

    Subclasses set `required_perms`; the HasSchoolPerm permission enforces them.
    """

    permission_classes = [HasSchoolPerm]
    tenant_field = "school"

    @property
    def tenant(self):
        return resolve_tenant(self.request)

    @property
    def school(self):
        return self.tenant.school

    def get_queryset(self) -> QuerySet:
        qs = super().get_queryset()
        return qs.filter(**{self.tenant_field: self.school})

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx["school"] = self.school
        ctx["tenant"] = self.tenant
        return ctx

    def perform_create(self, serializer):
        serializer.save(school=self.school)


class TenantModelViewSet(TenantViewSetMixin, viewsets.ModelViewSet):
    pass


class TenantReadOnlyViewSet(TenantViewSetMixin, viewsets.ReadOnlyModelViewSet):
    pass


class TenantCreateListRetrieveViewSet(
    TenantViewSetMixin,
    mixins.CreateModelMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    pass
