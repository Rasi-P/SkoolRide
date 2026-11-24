from rest_framework.routers import DefaultRouter

from . import views as v

router = DefaultRouter()
router.register("routes", v.RouteViewSet, basename="routes")
router.register("stops", v.RouteStopViewSet, basename="route-stops")
router.register("schedules", v.RouteScheduleViewSet, basename="route-schedules")
router.register("assignments", v.StudentTransportAssignmentViewSet, basename="transport-assignments")

urlpatterns = router.urls
