from django.urls import path

from . import driver_views as v

urlpatterns = [
    path("home/", v.DriverHomeView.as_view(), name="driver-home"),
    path("trips/", v.DriverTripListView.as_view(), name="driver-trips"),
    path("trips/<uuid:trip_id>/", v.DriverTripDetailView.as_view(), name="driver-trip-detail"),
    path("trips/<uuid:trip_id>/location/", v.DriverLocationView.as_view(), name="driver-trip-location"),
    path("trips/<uuid:trip_id>/events/", v.DriverTripEventView.as_view(), name="driver-trip-events"),
    path("trips/<uuid:trip_id>/emergency/", v.DriverEmergencyView.as_view(), name="driver-trip-emergency"),
    path("trips/<uuid:trip_id>/boarding-events/", v.DriverBoardingHistoryView.as_view(), name="driver-trip-boarding"),
    path("trips/<uuid:trip_id>/stops/<uuid:trip_stop_id>/<str:action>/", v.DriverStopActionView.as_view(), name="driver-stop-action"),
    path("trips/<uuid:trip_id>/students/<uuid:trip_student_id>/<str:action>/", v.DriverStudentActionView.as_view(), name="driver-student-action"),
    path("trips/<uuid:trip_id>/<str:action>/", v.DriverTripActionView.as_view(), name="driver-trip-action"),
    path("incidents/", v.DriverIncidentView.as_view(), name="driver-incidents"),
]
