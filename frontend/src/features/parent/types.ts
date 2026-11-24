/** Types for the parent-facing API (/api/parent/...). Mirrors backend/apps/people/parent_views.py. */
import type { Direction, TripStatus, TripStop, TripStudentStatus, UUID } from "@/types";

export interface ParentRouteRef {
  id: UUID;
  code: string;
  name: string;
  colour: string;
}

export interface ParentStop {
  id: UUID;
  name: string;
  latitude: number;
  longitude: number;
  address: string;
  landmark: string;
  planned_pickup_time: string | null;
  planned_dropoff_time: string | null;
  sequence: number;
}

export interface ParentVehicleRef {
  id: UUID;
  registration_number: string;
  fleet_number: string;
  display_name: string;
  capacity: number;
  colour: string;
}

export interface ParentAssignment {
  id: UUID;
  route: ParentRouteRef;
  pickup_stop: ParentStop | null;
  dropoff_stop: ParentStop | null;
  uses_pickup: boolean;
  uses_dropoff: boolean;
  vehicle: ParentVehicleRef | null;
  driver: { name: string; phone: string | null } | null;
  attendant: { name: string } | null;
  start_date: string | null;
}

export interface ChildSummary {
  id: UUID;
  name: string;
  first_name: string;
  admission_number: string;
  class_label: string;
  grade: string;
  section: string;
  photo: string | null;
  status: string;
  transport_status: string;
  transport: ParentAssignment | null;
}

export interface SchoolInfo {
  id: UUID;
  name: string;
  logo: string | null;
  timezone: string;
  currency: string;
  transport_office_phone: string;
  transport_office_email: string;
  emergency_contact_phone: string;
  parent_help_text: string;
  address: string;
  pickup_change_cutoff_hours: number;
  absence_report_cutoff_minutes: number;
  arrival_alert_minutes: number;
  accepted_payment_methods: string[];
  demo_mode: boolean;
}

export interface Eta {
  eta_at: string;
  seconds: number;
  minutes: number;
  distance_m: number | null;
}

export interface TodayTrip {
  trip_id: UUID;
  direction: Direction;
  status: TripStatus;
  scheduled_start_time: string;
  student_status: TripStudentStatus;
  stop: string | null;
  planned_time: string | null;
  eta: Eta | null;
  vehicle: string | null;
  delay_minutes: number;
  is_simulated: boolean;
}

export interface LiveTrip {
  id: UUID;
  status: TripStatus;
  direction: Direction;
  scheduled_date: string;
  scheduled_start_time: string;
  started_at: string | null;
  ended_at: string | null;
  delay_minutes: number;
  is_simulated: boolean;
  cancelled_reason: string;
  route: ParentRouteRef;
  vehicle: { registration_number: string; fleet_number: string; display_name: string } | null;
  driver: { name: string; phone: string | null } | null;
  next_stop: { id: UUID; name: string; eta: string | null } | null;
}

export interface LiveStudentStop {
  id: UUID;
  name: string;
  sequence: number;
  latitude: number;
  longitude: number;
  planned_time: string | null;
  status: TripStop["status"];
  eta: string | null;
}

export interface LiveTripStudent {
  id: UUID;
  status: TripStudentStatus;
  boarded_at: string | null;
  dropped_at: string | null;
  stop: LiveStudentStop | null;
}

export interface LiveLocation {
  latitude: number;
  longitude: number;
  speed_mps: number | null;
  heading: number | null;
  accuracy_m: number | null;
  recorded_at: string;
  is_simulated: boolean;
}

/** TripStop without the per-stop student counts (parents never see other students' counts). */
export type LiveStop = Omit<TripStop, "expected_count" | "boarded_count">;

export interface LivePayload {
  student: ChildSummary;
  assignment: ParentAssignment | null;
  trip: LiveTrip | null;
  trip_student: LiveTripStudent | null;
  location: LiveLocation | null;
  stale: boolean | null;
  last_location_at: string | null;
  stale_after_seconds?: number;
  eta: Eta | null;
  stops: LiveStop[];
  route_path: [number, number][];
  server_time: string;
}

export interface Announcement {
  id: UUID;
  title: string;
  body: string;
  publish_at: string;
  is_pinned: boolean;
  audience?: string;
}

export interface FeeSummary {
  outstanding: string;
  open_invoices: number;
  overdue: number;
  currency: string;
  next_due: string | null;
}

/** /parent/home/ returns only {children, selected} when no child is linked. */
export interface HomePayload {
  children: ChildSummary[];
  selected: ChildSummary | null;
  today?: string;
  today_trips?: TodayTrip[];
  live?: LivePayload;
  fees?: FeeSummary;
  unread_notifications?: number;
  announcements?: Announcement[];
}

export interface TripHistoryRow {
  trip_id: UUID;
  date: string;
  direction: Direction;
  trip_status: TripStatus;
  student_status: TripStudentStatus;
  boarded_at: string | null;
  dropped_at: string | null;
  route: string;
  vehicle: string | null;
  stop: string | null;
  started_at: string | null;
  ended_at: string | null;
  delay_minutes: number;
  absence_reason: string;
}

export interface AttendanceEvent {
  id: UUID;
  event_type: string;
  occurred_at: string;
  date: string;
  direction: Direction;
  stop: string | null;
  route: string;
  note: string;
}

export interface RouteSchedule {
  id: UUID;
  route: UUID;
  route_name: string;
  route_code: string;
  direction: Direction;
  label: string;
  weekdays: number[];
  start_time: string;
  is_active: boolean;
  effective_from: string | null;
  effective_to: string | null;
}

export interface RouteStop {
  id: UUID;
  route: UUID;
  name: string;
  sequence: number;
  latitude: string | number;
  longitude: string | number;
  address: string;
  landmark: string;
  planned_pickup_time: string | null;
  planned_dropoff_time: string | null;
  is_school_stop: boolean;
  wait_minutes: number;
}

export interface SchedulePayload {
  assignment: ParentAssignment | null;
  schedules: RouteSchedule[];
  stops: RouteStop[];
  route_path?: [number, number][];
}

export interface NotificationPreferences {
  push_enabled: boolean;
  email_enabled: boolean;
  sms_enabled: boolean;
  muted_categories: string[];
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
}

export interface ProfileChild {
  student_id: UUID;
  name: string;
  relationship: string;
  is_primary: boolean;
  can_pickup: boolean;
  receives_notifications: boolean;
}

export interface ParentProfile {
  id: UUID;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  alt_phone: string;
  address: string;
  preferred_language: string;
  status: string;
  children: ProfileChild[];
  notification_preferences: NotificationPreferences;
}

export interface ProfileInput {
  first_name?: string;
  last_name?: string;
  phone?: string;
  alt_phone?: string;
  address?: string;
  preferred_language?: string;
}

// ---------------------------------------------------------------------------
// Billing
// ---------------------------------------------------------------------------
export type InvoiceStatus = "DRAFT" | "ISSUED" | "PARTIALLY_PAID" | "PAID" | "OVERDUE" | "CANCELLED";
export const OPEN_INVOICE_STATUSES: InvoiceStatus[] = ["ISSUED", "PARTIALLY_PAID", "OVERDUE"];

export interface InvoiceLineItem {
  id: UUID;
  description: string;
  quantity: string;
  unit_amount: string;
  amount: string;
}

export interface InvoicePayment {
  payment_id: UUID;
  payment_number: string;
  amount: string;
  method: string;
  status: string;
  paid_at: string | null;
  is_simulated: boolean;
  receipt_number: string | null;
}

export interface ParentInvoice {
  id: UUID;
  invoice_number: string;
  student: UUID;
  student_name: string;
  admission_number: string;
  student_class: string;
  billed_to_name: string | null;
  fee_plan: UUID | null;
  fee_plan_name: string | null;
  period_label: string;
  period_start: string;
  period_end: string;
  issue_date: string;
  due_date: string;
  currency: string;
  subtotal: string;
  discount: string;
  late_fee: string;
  total: string;
  amount_paid: string;
  balance: string;
  status: InvoiceStatus;
  is_overdue: boolean;
  notes: string;
  line_items: InvoiceLineItem[];
  payments: InvoicePayment[];
  created_at: string;
}

export interface PaymentAllocation {
  invoice_id: UUID;
  invoice_number: string;
  period_label: string;
  amount: string;
}

export type PaymentStatus = "PENDING" | "VERIFIED" | "FAILED" | "REVERSED";

export interface ParentPayment {
  id: UUID;
  payment_number: string;
  student: UUID;
  student_name: string;
  admission_number: string;
  paid_by_name: string | null;
  amount: string;
  currency: string;
  method: string;
  status: PaymentStatus;
  transaction_reference: string;
  gateway: string;
  gateway_order_id: string;
  gateway_payment_id: string;
  is_simulated: boolean;
  paid_at: string | null;
  verified_at: string | null;
  received_by_name: string | null;
  reversed_at: string | null;
  reversal_reason: string;
  notes: string;
  receipt_number: string | null;
  receipt_id: UUID | null;
  allocations: PaymentAllocation[];
  created_at: string;
}

export interface PaymentOrder {
  gateway: string;
  order_id: string;
  amount: string;
  currency: string;
  is_simulated: boolean;
  checkout: { type: string; message: string; checkout_url: string };
}

export interface InitiatePaymentResponse {
  payment: ParentPayment;
  order: PaymentOrder;
}

export interface CheckoutResult {
  order_id: string;
  payment_id: string;
  amount: string;
  status: "success" | "failed";
  signature: string;
  currency?: string;
  simulated?: boolean;
}

export interface VerifyPaymentPayload {
  order_id: string;
  payment_id: string;
  amount: string;
  signature: string;
  currency?: string;
  status?: "success" | "failed";
}

export interface Receipt {
  id: UUID;
  receipt_number: string;
  issued_at: string;
  issued_by_name: string | null;
  is_void: boolean;
  payment: ParentPayment;
  school: { name: string; address: string; phone: string; email: string; logo: string | null };
  student: { name: string; admission_number: string; class_label: string };
}

// ---------------------------------------------------------------------------
// Engagement (absences, pickup changes, complaints)
// ---------------------------------------------------------------------------
export type AbsenceDirection = "PICKUP" | "DROPOFF" | "BOTH";
export type AbsenceStatus = "SUBMITTED" | "ACKNOWLEDGED" | "CANCELLED";

export interface AbsenceRequest {
  id: UUID;
  student: UUID;
  student_name: string;
  student_class: string;
  requested_by_name: string | null;
  date_from: string;
  date_to: string;
  direction: AbsenceDirection;
  reason: string;
  status: AbsenceStatus;
  acknowledged_at: string | null;
  created_at: string;
}

export interface AbsenceInput {
  student: UUID;
  date_from: string;
  date_to: string;
  direction: AbsenceDirection;
  reason: string;
}

export type PickupChangeType = "STOP_CHANGE" | "ROUTE_CHANGE" | "TEMPORARY" | "WITHDRAW" | "OTHER";
export type PickupChangeStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";

export interface PickupChangeRequest {
  id: UUID;
  student: UUID;
  student_name: string;
  student_class: string;
  requested_by_name: string | null;
  change_type: PickupChangeType;
  effective_date: string;
  end_date: string | null;
  requested_route: UUID | null;
  requested_route_name: string | null;
  requested_pickup_stop: UUID | null;
  requested_pickup_stop_name: string | null;
  requested_dropoff_stop: UUID | null;
  requested_dropoff_stop_name: string | null;
  details: string;
  status: PickupChangeStatus;
  decided_by_name: string | null;
  decided_at: string | null;
  decision_notes: string;
  current_assignment: { route: string; pickup_stop: string | null } | null;
  created_at: string;
}

export interface PickupChangeInput {
  student: UUID;
  change_type: PickupChangeType;
  effective_date: string;
  end_date?: string | null;
  requested_route?: UUID | null;
  requested_pickup_stop?: UUID | null;
  requested_dropoff_stop?: UUID | null;
  details: string;
}

export type ComplaintCategory = "DRIVER_BEHAVIOUR" | "DELAY" | "SAFETY" | "VEHICLE" | "BILLING" | "APP" | "OTHER";
export type ComplaintPriority = "LOW" | "NORMAL" | "HIGH";
export type ComplaintStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";

export interface ComplaintComment {
  id: UUID;
  author_name: string | null;
  body: string;
  is_internal: boolean;
  created_at: string;
}

export interface Complaint {
  id: UUID;
  ticket_number: string;
  student: UUID | null;
  student_name: string | null;
  raised_by_name: string | null;
  raised_by_email: string | null;
  category: ComplaintCategory;
  priority: ComplaintPriority;
  subject: string;
  description: string;
  status: ComplaintStatus;
  assigned_to: UUID | null;
  assigned_to_name: string | null;
  resolution_notes: string;
  resolved_at: string | null;
  trip: UUID | null;
  comments: ComplaintComment[];
  created_at: string;
  updated_at: string;
}

export interface ComplaintInput {
  student?: UUID | null;
  category: ComplaintCategory;
  priority: ComplaintPriority;
  subject: string;
  description: string;
}
