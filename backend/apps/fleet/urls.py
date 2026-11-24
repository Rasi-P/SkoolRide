from rest_framework.routers import DefaultRouter

from . import views as v

router = DefaultRouter()
router.register("vehicles", v.VehicleViewSet, basename="vehicles")
router.register("vehicle-documents", v.VehicleDocumentViewSet, basename="vehicle-documents")
router.register("vehicle-maintenance", v.VehicleMaintenanceViewSet, basename="vehicle-maintenance")
router.register("staff-assignments", v.StaffVehicleAssignmentViewSet, basename="staff-vehicle-assignments")

urlpatterns = router.urls
