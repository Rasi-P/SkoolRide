import type { AbsenceDirection, ComplaintCategory, ComplaintPriority, PickupChangeType } from "./types";

export const CHANGE_TYPE_LABELS: Record<PickupChangeType, string> = {
  STOP_CHANGE: "Change pickup / drop-off stop",
  ROUTE_CHANGE: "Change route",
  TEMPORARY: "Temporary change",
  WITHDRAW: "Withdraw from transport",
  OTHER: "Other",
};

export const COMPLAINT_CATEGORY_LABELS: Record<ComplaintCategory, string> = {
  DRIVER_BEHAVIOUR: "Driver / attendant behaviour",
  DELAY: "Delays",
  SAFETY: "Safety",
  VEHICLE: "Vehicle condition",
  BILLING: "Billing",
  APP: "App / tracking",
  OTHER: "Other",
};

export const COMPLAINT_PRIORITY_LABELS: Record<ComplaintPriority, string> = { LOW: "Low", NORMAL: "Normal", HIGH: "High" };

export const ABSENCE_DIRECTION_LABELS: Record<AbsenceDirection, string> = {
  PICKUP: "Morning pickup only",
  DROPOFF: "Afternoon drop-off only",
  BOTH: "Both pickup and drop-off",
};

export const STUDENT_STATUS_LABELS: Record<string, string> = {
  EXPECTED: "Expected",
  BOARDED: "Boarding recorded",
  DROPPED: "Dropped off",
  ABSENT: "Absent",
  NO_SHOW: "Did not board",
};

export const ATTENDANCE_EVENT_LABELS: Record<string, string> = {
  BOARDED: "Boarded",
  DROPPED: "Dropped off",
  NO_SHOW: "Did not board",
  ABSENT: "Marked absent",
};

/** Notification categories a parent can mute (incident and cancellation alerts are never muted by the backend). */
export const NOTIFICATION_CATEGORY_OPTIONS: { value: string; label: string }[] = [
  { value: "ARRIVAL_SOON", label: "Bus arriving soon" },
  { value: "ETA_CHANGED", label: "ETA changed" },
  { value: "BOARDED", label: "Student boarded" },
  { value: "DROPPED", label: "Student dropped off" },
  { value: "NO_SHOW", label: "Student did not board" },
  { value: "SCHOOL_ARRIVAL", label: "Bus arrived at school" },
  { value: "TRIP_STARTED", label: "Trip started" },
  { value: "TRIP_DELAY", label: "Trip delayed" },
  { value: "ANNOUNCEMENT", label: "School announcements" },
  { value: "FEE_DUE", label: "Fee due" },
  { value: "FEE_OVERDUE", label: "Fee overdue" },
  { value: "PAYMENT_RECEIVED", label: "Payment received" },
  { value: "COMPLAINT", label: "Complaint updates" },
  { value: "REQUEST_UPDATE", label: "Request updates" },
  { value: "GPS_STALE", label: "GPS signal lost" },
  { value: "SYSTEM", label: "System" },
];

export const LANGUAGE_OPTIONS: { value: string; label: string }[] = [
  { value: "en", label: "English" },
  { value: "hi", label: "Hindi" },
  { value: "kn", label: "Kannada" },
  { value: "ta", label: "Tamil" },
  { value: "te", label: "Telugu" },
  { value: "ml", label: "Malayalam" },
];
