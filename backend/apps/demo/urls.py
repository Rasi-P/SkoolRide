from django.urls import path

from . import views as v

urlpatterns = [
    path("status/", v.DemoStatusView.as_view(), name="demo-status"),
    path("simulations/", v.DemoTripListView.as_view(), name="demo-simulations"),
    path("simulations/<uuid:trip_id>/", v.SimulationView.as_view(), name="demo-simulation"),
]
