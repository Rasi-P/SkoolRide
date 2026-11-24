/** Typed client for the parent API. Every call goes through the shared axios instance (auth + school headers). */
import { api, buildQuery } from "@/api/client";
import type { Notification, Paginated } from "@/types";
import type {
  AbsenceInput,
  AbsenceRequest,
  Announcement,
  AttendanceEvent,
  CheckoutResult,
  ChildSummary,
  Complaint,
  ComplaintComment,
  ComplaintInput,
  HomePayload,
  InitiatePaymentResponse,
  LivePayload,
  NotificationPreferences,
  ParentInvoice,
  ParentPayment,
  ParentProfile,
  PickupChangeInput,
  PickupChangeRequest,
  ProfileInput,
  Receipt,
  SchedulePayload,
  SchoolInfo,
  TripHistoryRow,
  VerifyPaymentPayload,
} from "./types";

/** Query keys. Everything under ["parent", ...] belongs to this feature; "notifications"/"unread" are shared with NotificationBell. */
export const qk = {
  children: ["parent", "children"] as const,
  school: ["parent", "school"] as const,
  profile: ["parent", "profile"] as const,
  announcements: ["parent", "announcements"] as const,
  home: (student: string | null) => ["parent", "home", student] as const,
  live: (student: string | null, trip: string | null) => ["parent", "live", student, trip ?? "auto"] as const,
  trips: (student: string | null, days: number) => ["parent", "trips", student, days] as const,
  attendance: (student: string | null, days: number) => ["parent", "attendance", student, days] as const,
  schedule: (student: string | null) => ["parent", "schedule", student] as const,
  invoices: (student: string | null) => ["parent", "invoices", student] as const,
  payments: ["parent", "payments"] as const,
  receipt: (id: string) => ["parent", "receipt", id] as const,
  absences: ["parent", "absences"] as const,
  pickupChanges: ["parent", "pickup-changes"] as const,
  complaints: ["parent", "complaints"] as const,
  prefs: ["notification-prefs"] as const,
  unread: ["unread"] as const,
  notifications: ["notifications"] as const,
};

const unwrap = <T>(p: Promise<{ data: T }>) => p.then((r) => r.data);

export type NotificationListParams = {
  page?: number;
  page_size?: number;
  is_read?: "true" | "false";
  category?: string;
};

export const parentApi = {
  children: () => unwrap(api.get<ChildSummary[]>("/parent/children/")),
  home: (student: string | null) => unwrap(api.get<HomePayload>(`/parent/home/${buildQuery({ student })}`)),
  school: () => unwrap(api.get<SchoolInfo>("/parent/school/")),
  profile: () => unwrap(api.get<ParentProfile>("/parent/profile/")),
  updateProfile: (body: ProfileInput) => unwrap(api.patch<ParentProfile>("/parent/profile/", body)),
  announcements: () => unwrap(api.get<Announcement[]>("/parent/announcements/")),
  live: (student: string, trip: string | null) => unwrap(api.get<LivePayload>(`/parent/children/${student}/live/${buildQuery({ trip })}`)),
  trips: (student: string, days: number) => unwrap(api.get<TripHistoryRow[]>(`/parent/children/${student}/trips/${buildQuery({ days })}`)),
  attendance: (student: string, days: number) => unwrap(api.get<AttendanceEvent[]>(`/parent/children/${student}/attendance/${buildQuery({ days })}`)),
  schedule: (student: string) => unwrap(api.get<SchedulePayload>(`/parent/children/${student}/schedule/`)),
  invoices: (student: string | null) => unwrap(api.get<ParentInvoice[]>(`/parent/invoices/${buildQuery({ student })}`)),
  invoice: (id: string) => unwrap(api.get<ParentInvoice>(`/parent/invoices/${id}/`)),
  /** Creates a PENDING online payment for the invoice balance and returns the gateway order. */
  initiatePayment: (invoiceId: string) => unwrap(api.post<InitiatePaymentResponse>(`/parent/invoices/${invoiceId}/`)),
  /** Demo-only hosted checkout stand-in: returns a signed (or failed) result for the order. */
  mockCheckout: (body: { order_id: string; amount: string; outcome: "success" | "failed" }) => unwrap(api.post<CheckoutResult>("/billing/mock-gateway/checkout/", body)),
  verifyPayment: (body: VerifyPaymentPayload) => unwrap(api.post<ParentPayment>("/parent/payments/verify/", body)),
  payments: () => unwrap(api.get<ParentPayment[]>("/parent/payments/")),
  receipt: (id: string) => unwrap(api.get<Receipt>(`/parent/receipts/${id}/`)),
  absences: () => unwrap(api.get<AbsenceRequest[]>("/parent/absence-requests/")),
  createAbsence: (body: AbsenceInput) => unwrap(api.post<AbsenceRequest>("/parent/absence-requests/", body)),
  cancelAbsence: (id: string) => unwrap(api.post<AbsenceRequest>(`/parent/absence-requests/${id}/cancel/`)),
  pickupChanges: () => unwrap(api.get<PickupChangeRequest[]>("/parent/pickup-change-requests/")),
  createPickupChange: (body: PickupChangeInput) => unwrap(api.post<PickupChangeRequest>("/parent/pickup-change-requests/", body)),
  cancelPickupChange: (id: string) => unwrap(api.post<PickupChangeRequest>(`/parent/pickup-change-requests/${id}/cancel/`)),
  complaints: () => unwrap(api.get<Complaint[]>("/parent/complaints/")),
  createComplaint: (body: ComplaintInput) => unwrap(api.post<Complaint>("/parent/complaints/", body)),
  addComplaintComment: (id: string, body: string) => unwrap(api.post<ComplaintComment>(`/parent/complaints/${id}/comments/`, { body })),
  notifications: (params: NotificationListParams) => unwrap(api.get<Paginated<Notification>>(`/notifications/mine/${buildQuery(params)}`)),
  markRead: (id: string) => unwrap(api.post<Notification>(`/notifications/mine/${id}/read/`)),
  markAllRead: () => unwrap(api.post<{ updated: number }>("/notifications/mine/read-all/")),
  prefs: () => unwrap(api.get<NotificationPreferences>("/notifications/preferences/")),
  savePrefs: (body: NotificationPreferences) => unwrap(api.put<NotificationPreferences>("/notifications/preferences/", body)),
};
