// Static option lists mirroring backend choices (backend/apps/schools/models.py, notifications/models.py, core/roles.py).
export interface Option {
  value: string;
  label: string;
}

export const APPLICATION_STATUS_OPTIONS: Option[] = [
  { value: "PENDING", label: "Pending" },
  { value: "UNDER_REVIEW", label: "Under review" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
];

export const SCHOOL_STATUS_OPTIONS: Option[] = [
  { value: "APPROVED", label: "Approved (awaiting admin)" },
  { value: "ACTIVE", label: "Active" },
  { value: "SUSPENDED", label: "Suspended" },
  { value: "INACTIVE", label: "Inactive" },
];

export const SUBSCRIPTION_STATUS_OPTIONS: Option[] = [
  { value: "TRIAL", label: "Trial" },
  { value: "ACTIVE", label: "Active" },
  { value: "PAST_DUE", label: "Past due" },
  { value: "SUSPENDED", label: "Suspended" },
  { value: "CANCELLED", label: "Cancelled" },
];

export const ADMIN_ROLE_OPTIONS: Option[] = [
  { value: "SCHOOL_ADMIN", label: "School admin" },
  { value: "TRANSPORT_MANAGER", label: "Transport manager" },
];

export const TEMPLATE_CHANNEL_OPTIONS: Option[] = [
  { value: "IN_APP", label: "In-app" },
  { value: "PUSH", label: "Web push" },
  { value: "EMAIL", label: "Email" },
  { value: "SMS", label: "SMS" },
];

/** backend/apps/notifications/models.py Category */
export const NOTIFICATION_CATEGORIES: Option[] = [
  { value: "ARRIVAL_SOON", label: "Bus arriving soon" },
  { value: "ETA_CHANGED", label: "ETA changed" },
  { value: "BOARDED", label: "Student boarded" },
  { value: "DROPPED", label: "Student dropped off" },
  { value: "NO_SHOW", label: "Student did not board" },
  { value: "SCHOOL_ARRIVAL", label: "Bus arrived at school" },
  { value: "TRIP_STARTED", label: "Trip started" },
  { value: "TRIP_DELAY", label: "Trip delayed" },
  { value: "TRIP_CANCELLED", label: "Trip cancelled" },
  { value: "ANNOUNCEMENT", label: "School announcement" },
  { value: "FEE_DUE", label: "Fee due" },
  { value: "FEE_OVERDUE", label: "Fee overdue" },
  { value: "PAYMENT_RECEIVED", label: "Payment received" },
  { value: "DOCUMENT_EXPIRY", label: "Document expiring" },
  { value: "INCIDENT", label: "Incident" },
  { value: "COMPLAINT", label: "Complaint update" },
  { value: "REQUEST_UPDATE", label: "Request update" },
  { value: "GPS_STALE", label: "GPS signal lost" },
  { value: "SYSTEM", label: "System" },
];

export const categoryLabel = (code: string) => NOTIFICATION_CATEGORIES.find((c) => c.value === code)?.label ?? code;

/** Placeholders supported by backend/apps/notifications/services.py render() */
export const TEMPLATE_PLACEHOLDERS = [
  "student_name",
  "student_first_name",
  "school_name",
  "minutes",
  "stop_name",
  "vehicle",
  "vehicle_registration",
  "route",
  "route_code",
  "direction",
  "date",
  "driver",
];

/** Audit action codes recorded by the backend (grep record_audit(action=...)). */
export const AUDIT_ACTIONS = [
  "application.approved", "application.rejected", "application.submitted", "application.under_review",
  "auth.login", "auth.password_changed", "auth.password_reset",
  "invitation.accepted", "invitation.created", "invitation.revoked",
  "membership.activated", "membership.deactivated",
  "platform.setting_updated",
  "school.created", "school.profile_updated", "school.reactivated", "school.suspended", "school.updated",
  "subscription.updated",
  "user.activated", "user.deactivated",
  "announcement.created", "announcement.published", "announcement.updated",
  "notification.broadcast",
  "absence.acknowledged", "absence.cancelled", "absence.submitted",
  "billing.fee_plan_assigned", "billing.fee_plan_created", "billing.fee_plan_updated", "billing.invoice_cancelled",
  "billing.invoice_created", "billing.invoices_generated", "billing.late_fee_applied", "billing.online_payment_initiated",
  "billing.online_payment_verified", "billing.payment_recorded", "billing.payment_reversed",
  "boarding.boarded", "boarding.dropped",
  "complaint.status_changed", "complaint.submitted",
  "guardian.linked", "guardian.unlinked",
  "incident.reported", "incident.status_changed",
  "parent.activated", "parent.created", "parent.password_reset_sent", "parent.profile_updated", "parent.suspended", "parent.updated",
  "pickup_change.submitted",
  "route.created", "route.deactivated", "route.schedule_created", "route.schedule_updated", "route.stops_updated", "route.updated",
  "staff.access_activated", "staff.access_deactivated", "staff.created", "staff.deactivated", "staff.document_added",
  "staff.leave_approved", "staff.leave_rejected", "staff.updated",
  "student.created", "student.reactivated", "student.transport_assigned", "student.transport_assignment_ended",
  "student.transport_withdrawn", "student.updated", "students.imported",
  "trip.cancelled", "trip.completed", "trip.created", "trip.emergency_triggered", "trip.started", "trip.updated",
  "trip.vehicle_replaced", "trips.generated",
  "vehicle.created", "vehicle.document_added", "vehicle.maintenance_logged", "vehicle.staff_assigned",
  "vehicle.staff_unassigned", "vehicle.status_changed", "vehicle.updated",
];

export const AUDIT_TARGET_TYPES = [
  "User", "School", "SchoolApplication", "SchoolSubscription", "SubscriptionPlan", "PlatformSetting", "Invitation", "SchoolMembership",
  "Trip", "Incident", "BoardingEvent", "GPSLocation", "Vehicle", "VehicleDocument", "StaffVehicleAssignment", "Route", "RouteStop",
  "RouteSchedule", "Student", "StudentTransportAssignment", "StaffProfile", "ParentProfile", "GuardianLink", "AbsenceRequest",
  "PickupChangeRequest", "Complaint", "Announcement", "Notification", "FeePlan", "Invoice", "Payment",
];
