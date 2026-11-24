from django.urls import path

from . import parent_views as v

urlpatterns = [
    path("children/", v.ParentChildrenView.as_view(), name="parent-children"),
    path("home/", v.ParentHomeView.as_view(), name="parent-home"),
    path("school/", v.ParentSchoolView.as_view(), name="parent-school"),
    path("profile/", v.ParentProfileView.as_view(), name="parent-profile"),
    path("announcements/", v.ParentAnnouncementsView.as_view(), name="parent-announcements"),
    path("children/<uuid:student_id>/live/", v.ParentLiveView.as_view(), name="parent-live"),
    path("children/<uuid:student_id>/trips/", v.ParentTripHistoryView.as_view(), name="parent-trips"),
    path("children/<uuid:student_id>/attendance/", v.ParentAttendanceView.as_view(), name="parent-attendance"),
    path("children/<uuid:student_id>/schedule/", v.ParentScheduleView.as_view(), name="parent-schedule"),
    path("invoices/", v.ParentInvoicesView.as_view(), name="parent-invoices"),
    path("invoices/<uuid:invoice_id>/", v.ParentInvoiceDetailView.as_view(), name="parent-invoice-detail"),
    path("payments/", v.ParentPaymentsView.as_view(), name="parent-payments"),
    path("payments/verify/", v.ParentVerifyPaymentView.as_view(), name="parent-payment-verify"),
    path("receipts/<uuid:receipt_id>/", v.ParentReceiptView.as_view(), name="parent-receipt"),
    path("absence-requests/", v.ParentAbsenceView.as_view(), name="parent-absences"),
    path("absence-requests/<uuid:absence_id>/cancel/", v.ParentAbsenceCancelView.as_view(), name="parent-absence-cancel"),
    path("pickup-change-requests/", v.ParentPickupChangeView.as_view(), name="parent-pickup-changes"),
    path("pickup-change-requests/<uuid:request_id>/cancel/", v.ParentPickupChangeCancelView.as_view(), name="parent-pickup-change-cancel"),
    path("complaints/", v.ParentComplaintsView.as_view(), name="parent-complaints"),
    path("complaints/<uuid:complaint_id>/comments/", v.ParentComplaintCommentView.as_view(), name="parent-complaint-comment"),
]
