from __future__ import annotations

from datetime import timedelta

from django.utils import timezone
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema as _extend_schema
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.permissions import HasSchoolPerm
from apps.core.roles import Perm
from apps.core.tenancy import resolve_tenant
from apps.core.utils import csv_response

from . import services


def _range(request):
    today = timezone.localdate()
    df = request.query_params.get("date_from") or (today - timedelta(days=30)).isoformat()
    dt = request.query_params.get("date_to") or today.isoformat()
    return df, dt


class ReportBase(APIView):
    permission_classes = [HasSchoolPerm]
    required_perms = Perm.REPORTS_VIEW

    @property
    def school(self):
        return resolve_tenant(self.request).school


@_extend_schema(responses={200: OpenApiTypes.OBJECT})
class AttendanceReportView(ReportBase):
    def get(self, request):
        df, dt = _range(request)
        data = services.attendance_report(self.school, df, dt, request.query_params.get("route"), request.query_params.get("grade"))
        if request.query_params.get("export") == "csv":
            return csv_response(
                "attendance_report.csv",
                ["date", "direction", "expected", "boarded", "absent"],
                ((r["date"], r["direction"], r["expected"], r["boarded"], r["absent"]) for r in data["by_day"]),
            )
        return Response({"date_from": df, "date_to": dt, **data})


@_extend_schema(responses={200: OpenApiTypes.OBJECT})
class TripsReportView(ReportBase):
    def get(self, request):
        df, dt = _range(request)
        data = services.trips_report(self.school, df, dt)
        if request.query_params.get("export") == "csv":
            return csv_response(
                "trips_report.csv",
                ["date", "total", "completed", "cancelled", "avg_delay"],
                ((r["date"], r["total"], r["completed"], r["cancelled"], r["avg_delay"]) for r in data["by_day"]),
            )
        return Response({"date_from": df, "date_to": dt, **data})


@_extend_schema(responses={200: OpenApiTypes.OBJECT})
class FleetReportView(ReportBase):
    def get(self, request):
        data = services.fleet_report(self.school)
        if request.query_params.get("export") == "csv":
            return csv_response(
                "fleet_report.csv",
                ["registration", "status", "capacity", "trips_30d", "students_30d", "incidents_30d", "maintenance_cost_30d"],
                (
                    (r["registration"], r["status"], r["capacity"], r["trips_30d"], r["students_30d"], r["incidents_30d"], r["maintenance_cost_30d"])
                    for r in data["vehicles"]
                ),
            )
        return Response(data)


@_extend_schema(responses={200: OpenApiTypes.OBJECT})
class StudentsReportView(ReportBase):
    def get(self, request):
        return Response(services.students_report(self.school))


@_extend_schema(responses={200: OpenApiTypes.OBJECT})
class FinanceReportView(ReportBase):
    required_perms = Perm.BILLING_VIEW

    def get(self, request):
        from apps.billing.services import financial_summary

        df, dt = _range(request)
        return Response({"date_from": df, "date_to": dt, **financial_summary(self.school, df, dt)})
