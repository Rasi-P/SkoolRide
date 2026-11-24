from rest_framework.routers import DefaultRouter

from . import views as v

router = DefaultRouter()
router.register("staff", v.StaffProfileViewSet, basename="staff")
router.register("staff-documents", v.StaffDocumentViewSet, basename="staff-documents")
router.register("staff-leaves", v.StaffLeaveViewSet, basename="staff-leaves")
router.register("staff-attendance", v.StaffAttendanceViewSet, basename="staff-attendance")
router.register("students", v.StudentViewSet, basename="students")
router.register("parents", v.ParentProfileViewSet, basename="parents")
router.register("guardian-links", v.GuardianLinkViewSet, basename="guardian-links")

urlpatterns = router.urls
