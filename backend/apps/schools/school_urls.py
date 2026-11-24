from django.urls import path
from rest_framework.routers import DefaultRouter

from . import school_views as v

router = DefaultRouter()
router.register("members", v.SchoolMembershipViewSet, basename="school-members")
router.register("invitations", v.SchoolInvitationViewSet, basename="school-invitations")
router.register("audit-logs", v.SchoolAuditLogViewSet, basename="school-audit")
router.register("notification-templates", v.SchoolNotificationTemplateViewSet, basename="school-templates")

urlpatterns = [
    path("profile/", v.SchoolProfileView.as_view(), name="school-profile"),
    path("onboarding/", v.SchoolOnboardingView.as_view(), name="school-onboarding"),
    path("dashboard/", v.SchoolDashboardView.as_view(), name="school-dashboard"),
    *router.urls,
]
