from django.urls import path
from rest_framework.routers import DefaultRouter

from . import views as v

router = DefaultRouter()
router.register("fee-plans", v.FeePlanViewSet, basename="fee-plans")
router.register("fee-assignments", v.StudentFeeAssignmentViewSet, basename="fee-assignments")
router.register("invoices", v.InvoiceViewSet, basename="invoices")
router.register("payments", v.PaymentViewSet, basename="payments")
router.register("receipts", v.ReceiptViewSet, basename="receipts")
router.register("adjustments", v.PaymentAdjustmentViewSet, basename="payment-adjustments")

urlpatterns = [
    path("summary/", v.FinancialSummaryView.as_view(), name="billing-summary"),
    path("mock-gateway/checkout/", v.MockGatewayCheckoutView.as_view(), name="mock-gateway-checkout"),
    *router.urls,
]
