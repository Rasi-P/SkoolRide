from django.urls import path

from . import views as v

urlpatterns = [
    path("attendance/", v.AttendanceReportView.as_view(), name="report-attendance"),
    path("trips/", v.TripsReportView.as_view(), name="report-trips"),
    path("fleet/", v.FleetReportView.as_view(), name="report-fleet"),
    path("students/", v.StudentsReportView.as_view(), name="report-students"),
    path("finance/", v.FinanceReportView.as_view(), name="report-finance"),
]
