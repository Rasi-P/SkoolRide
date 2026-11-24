/** Option lists mirroring backend TextChoices. */
import { titleCase } from "@/lib/format";

export const opt = (values: readonly string[], labels: Record<string, string> = {}) => values.map((v) => ({ value: v, label: labels[v] ?? titleCase(v) }));

export const VEHICLE_STATUS = opt(["AVAILABLE", "IN_SERVICE", "MAINTENANCE", "INACTIVE"]);
export const VEHICLE_TYPE = opt(["BUS", "MINI_BUS", "VAN", "OTHER"]);
export const VEHICLE_DOC_TYPE = opt(["INSURANCE", "PERMIT", "FITNESS", "POLLUTION", "REGISTRATION", "OTHER"], { FITNESS: "Fitness certificate", POLLUTION: "Pollution certificate", REGISTRATION: "Registration certificate" });
export const MAINTENANCE_CATEGORY = opt(["SERVICE", "REPAIR", "INSPECTION", "TYRES", "OTHER"], { SERVICE: "Routine service" });

export const STAFF_TYPE = opt(["DRIVER", "ATTENDANT", "TRANSPORT_MANAGER", "SCHOOL_ADMIN"]);
export const STAFF_STATUS = opt(["ACTIVE", "ON_LEAVE", "INACTIVE"]);
export const STAFF_DOC_TYPE = opt(["LICENCE", "ID_PROOF", "POLICE_VERIFICATION", "MEDICAL", "TRAINING", "OTHER"], { LICENCE: "Driving licence", ID_PROOF: "ID proof", MEDICAL: "Medical certificate", TRAINING: "Training certificate" });
export const LEAVE_TYPE = opt(["CASUAL", "SICK", "EARNED", "UNPAID", "OTHER"]);
export const ATTENDANCE_STATUS = opt(["PRESENT", "ABSENT", "LEAVE", "HALF_DAY"]);
export const GENDER = [{ value: "M", label: "Male" }, { value: "F", label: "Female" }, { value: "O", label: "Other" }];

export const STUDENT_STATUS = opt(["ACTIVE", "TRANSFERRED", "WITHDRAWN", "INACTIVE"]);
export const TRANSPORT_STATUS = opt(["ACTIVE", "WITHDRAWN", "NONE"], { ACTIVE: "Using transport", WITHDRAWN: "Withdrawn from transport", NONE: "Not using transport" });
export const RELATIONSHIP = opt(["FATHER", "MOTHER", "GUARDIAN", "OTHER"]);
export const PARENT_STATUS = opt(["INVITED", "ACTIVE", "SUSPENDED"]);

export const DIRECTION = [{ value: "PICKUP", label: "Morning pickup" }, { value: "DROPOFF", label: "Afternoon drop-off" }];
export const TRIP_STATUS = opt(["SCHEDULED", "IN_PROGRESS", "PAUSED", "COMPLETED", "CANCELLED"]);
export const BOARDING_EVENT_TYPE = opt(["BOARDED", "DROPPED", "ABSENT", "NO_SHOW"]);

export const FEE_BASIS = opt(["ROUTE", "DISTANCE", "GRADE", "CUSTOM"], { ROUTE: "Per route", DISTANCE: "Distance band", GRADE: "Per grade", CUSTOM: "Custom plan" });
export const BILLING_CYCLE = opt(["MONTHLY", "TERM", "ANNUAL"], { TERM: "Per term" });
export const INVOICE_STATUS = opt(["DRAFT", "ISSUED", "PARTIALLY_PAID", "PAID", "OVERDUE", "CANCELLED"]);
export const PAYMENT_METHOD = opt(["CASH", "BANK_TRANSFER", "UPI", "CHEQUE", "ONLINE"], { UPI: "UPI", ONLINE: "Online (gateway)" });
export const OFFLINE_PAYMENT_METHOD = PAYMENT_METHOD.filter((m) => m.value !== "ONLINE");
export const PAYMENT_STATUS = opt(["PENDING", "VERIFIED", "FAILED", "REVERSED"]);

export const COMPLAINT_CATEGORY = opt(["DRIVER_BEHAVIOUR", "DELAY", "SAFETY", "VEHICLE", "BILLING", "APP", "OTHER"], { DRIVER_BEHAVIOUR: "Driver / attendant behaviour", VEHICLE: "Vehicle condition", APP: "App / tracking" });
export const COMPLAINT_PRIORITY = opt(["LOW", "NORMAL", "HIGH"]);
export const COMPLAINT_STATUS = opt(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]);
export const INCIDENT_CATEGORY = opt(["BREAKDOWN", "ACCIDENT", "MEDICAL", "BEHAVIOUR", "DELAY", "EMERGENCY", "SAFETY", "OTHER"], { BEHAVIOUR: "Student behaviour", SAFETY: "Safety concern" });
export const INCIDENT_SEVERITY = opt(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
export const INCIDENT_STATUS = opt(["OPEN", "INVESTIGATING", "RESOLVED", "CLOSED"]);
export const ANNOUNCEMENT_AUDIENCE = opt(["ALL", "PARENTS", "STAFF", "ROUTE"], { ALL: "Everyone", ROUTE: "Parents on a route" });
export const ABSENCE_DIRECTION = opt(["PICKUP", "DROPOFF", "BOTH"], { PICKUP: "Morning pickup", DROPOFF: "Afternoon drop-off" });
export const ABSENCE_STATUS = opt(["SUBMITTED", "ACKNOWLEDGED", "CANCELLED"]);
export const PICKUP_CHANGE_TYPE = opt(["STOP_CHANGE", "ROUTE_CHANGE", "TEMPORARY", "WITHDRAW", "OTHER"], { STOP_CHANGE: "Change stop", ROUTE_CHANGE: "Change route", WITHDRAW: "Withdraw from transport" });
export const PICKUP_CHANGE_STATUS = opt(["PENDING", "APPROVED", "REJECTED", "CANCELLED"]);

export const NOTIFICATION_CATEGORY = opt(["ARRIVAL_SOON", "ETA_CHANGED", "BOARDED", "DROPPED", "NO_SHOW", "SCHOOL_ARRIVAL", "TRIP_STARTED", "TRIP_DELAY", "TRIP_CANCELLED", "ANNOUNCEMENT", "FEE_DUE", "FEE_OVERDUE", "PAYMENT_RECEIVED", "DOCUMENT_EXPIRY", "INCIDENT", "COMPLAINT", "REQUEST_UPDATE", "GPS_STALE", "SYSTEM"]);
export const SEND_CATEGORY = opt(["ANNOUNCEMENT", "SYSTEM", "TRIP_DELAY", "FEE_DUE"]);
export const SEND_AUDIENCE = opt(["ALL_PARENTS", "ROUTE", "STUDENTS", "STAFF"], { ALL_PARENTS: "All parents", ROUTE: "Parents on a route", STUDENTS: "Parents of selected students" });
export const TEMPLATE_CHANNEL = opt(["IN_APP", "PUSH", "EMAIL", "SMS"], { IN_APP: "In-app", SMS: "SMS" });
export const MEMBER_ROLE = opt(["SCHOOL_ADMIN", "TRANSPORT_MANAGER", "DRIVER", "ATTENDANT", "PARENT"]);
export const INVITATION_STATUS = opt(["PENDING", "ACCEPTED", "EXPIRED", "REVOKED"]);

export const TIMEZONES = ["Asia/Kolkata", "Asia/Dubai", "Asia/Singapore", "Asia/Kuala_Lumpur", "Asia/Dhaka", "Asia/Karachi", "Asia/Kathmandu", "Asia/Colombo", "Europe/London", "Europe/Berlin", "Africa/Nairobi", "Africa/Lagos", "America/New_York", "America/Chicago", "America/Los_Angeles", "Australia/Sydney", "UTC"].map((z) => ({ value: z, label: z }));
