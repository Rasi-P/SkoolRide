from django.urls import path
from rest_framework.routers import DefaultRouter

from . import views as v

router = DefaultRouter()
router.register("trips", v.TripViewSet, basename="trips")
router.register("boarding-events", v.BoardingEventViewSet, basename="boarding-events")
router.register("incidents", v.IncidentViewSet, basename="incidents")

urlpatterns = [
    path("vehicle-locations/", v.VehicleLocationsView.as_view(), name="vehicle-locations"),
    *router.urls,
]
