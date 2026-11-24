from rest_framework.routers import DefaultRouter

from . import views as v

router = DefaultRouter()
router.register("absence-requests", v.AbsenceRequestViewSet, basename="absence-requests")
router.register("pickup-change-requests", v.PickupChangeRequestViewSet, basename="pickup-change-requests")
router.register("complaints", v.ComplaintViewSet, basename="complaints")
router.register("announcements", v.AnnouncementViewSet, basename="announcements")

urlpatterns = router.urls
