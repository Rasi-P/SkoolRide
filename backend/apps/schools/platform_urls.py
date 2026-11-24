from django.urls import path
from rest_framework.routers import DefaultRouter

from . import platform_views as v

router = DefaultRouter()
router.register("applications", v.SchoolApplicationViewSet, basename="platform-applications")
router.register("schools", v.SchoolViewSet, basename="platform-schools")
router.register("plans", v.SubscriptionPlanViewSet, basename="platform-plans")
router.register("settings", v.PlatformSettingViewSet, basename="platform-settings")
router.register("notification-templates", v.NotificationTemplateViewSet, basename="platform-templates")
router.register("audit-logs", v.PlatformAuditLogViewSet, basename="platform-audit")
router.register("users", v.PlatformUserViewSet, basename="platform-users")

urlpatterns = [
    path("overview/", v.PlatformOverviewView.as_view(), name="platform-overview"),
    path("stats/", v.PlatformStatsView.as_view(), name="platform-stats"),
    *router.urls,
]
