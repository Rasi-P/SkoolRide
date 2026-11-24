/** Types for the School console (mirrors backend serializers in apps/schools, people, fleet, routing, trips, billing, engagement, reports, notifications). */
import type { Direction, Notification, Trip, TripDetail, TripStatus, UUID } from "@/types";

// ---------------------------------------------------------------------------
// School, dashboard, members
// ---------------------------------------------------------------------------
export interface DashboardTrend {
  date: string;
  expected: number;
  boarded: number;
  absent: number;
}

export interface DocumentAlert {
  vehicle: string;
  vehicle_id: string | null;
  document: string;
  expires_on: string;
  level: "expired" | "expiring";
}

export interface Dashboard {
  date: string;
  students_using_transport: number;
  students_total: number;
  vehicles_total: number;
  vehicles_available: number;
  vehicles_in_service: number;
  vehicles_maintenance: number;
  drivers: number;
  attendants: number;
  trips_running: number;
  trips_upcoming: number;
  trips_completed_today: number;
  trips_today: Trip[];
  boarded_vs_expected: { boarded: number; expected: number };
  pending_fees: string;
  pending_invoices: number;
  overdue_invoices: number;
  currency: string;
  document_alerts: DocumentAlert[];
  open_complaints: number;
  open_incidents: number;
  pending_requests: number;
  recent_complaints: { id: UUID; ticket: string; subject: string; status: string; priority: string; created_at: string }[];
  recent_incidents: { id: UUID; title: string; severity: string; status: string; occurred_at: string; category: string }[];
  recent_announcements: { id: UUID; title: string; publish_at: string; audience: string }[];
  attendance_trend: DashboardTrend[];
}

export interface OnboardingStep {
  key: string;
  label: string;
  done: boolean;
  href: string;
}

export interface Onboarding {
  steps: OnboardingStep[];
  completed_steps: number;
  total_steps: number;
  completed: boolean;
}

export interface SchoolSubscription {
  id: UUID;
  plan: UUID;
  plan_name: string;
  plan_code: string;
  status: string;
  starts_at: string | null;
  ends_at: string | null;
  is_usable: boolean;
  limits: { max_vehicles: number; max_students: number; max_staff: number; max_routes: number };
}

export interface SchoolProfile {
  id: UUID;
  name: string;
  slug: string;
  code: string;
  logo: string | null;
  status: string;
  email: string;
  phone: string;
  website: string;
  address_line1: string;
  address_line2: string;
  city: string;
  state: string;
  country: string;
  postal_code: string;
  latitude: string | null;
  longitude: string | null;
  timezone: string;
  currency: string;
  academic_year_label: string;
  academic_year_start: string | null;
  academic_year_end: string | null;
  operating_weekdays: number[];
  morning_pickup_window_start: string | null;
  afternoon_dropoff_window_start: string | null;
  pickup_change_cutoff_hours: number;
  absence_report_cutoff_minutes: number;
  boarding_grace_minutes: number;
  arrival_alert_minutes: number;
  delay_alert_minutes: number;
  gps_stale_seconds: number;
  notification_channels: Record<string, boolean>;
  fee_billing_cycle: "MONTHLY" | "TERM" | "ANNUAL";
  fee_due_day: number;
  fee_late_fee_amount: string;
  accepted_payment_methods: string[];
  transport_office_phone: string;
  transport_office_email: string;
  emergency_contact_phone: string;
  parent_help_text: string;
  show_driver_phone_to_parents: boolean;
  onboarding_dismissed: boolean;
  is_operational: boolean;
  full_address: string;
  subscription: SchoolSubscription | null;
  approved_at: string | null;
  activated_at: string | null;
  created_at: string;
}

export interface Member {
  id: UUID;
  user: UUID;
  email: string;
  full_name: string;
  phone: string;
  role: string;
  is_active: boolean;
  is_primary: boolean;
  user_is_active: boolean;
  last_login: string | null;
  created_at: string;
}

export interface Invitation {
  id: UUID;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  status: string;
  expires_at: string;
  accepted_at: string | null;
  invited_by_name: string;
  accept_url: string | null;
  created_at: string;
}

export interface AuditLog {
  id: number;
  action: string;
  actor_email: string;
  target_type: string;
  target_id: string;
  target_repr: string;
  changes: Record<string, unknown>;
  ip_address: string | null;
  school: string | null;
  school_name: string;
  created_at: string;
}

export interface NotificationTemplate {
  id: UUID;
  school: UUID | null;
  category: string;
  channel: "IN_APP" | "PUSH" | "EMAIL" | "SMS";
  subject: string;
  body: string;
  is_active: boolean;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Fleet
// ---------------------------------------------------------------------------
export type VehicleStatus = "AVAILABLE" | "IN_SERVICE" | "MAINTENANCE" | "INACTIVE";

export interface VehicleDocument {
  id: UUID;
  vehicle: UUID;
  doc_type: string;
  title: string;
  number: string;
  issued_on: string | null;
  expires_on: string | null;
  file: string | null;
  notes: string;
  is_expired: boolean;
  created_at: string;
}

export interface VehicleMaintenance {
  id: UUID;
  vehicle: UUID;
  category: string;
  description: string;
  performed_on: string;
  cost: string;
  odometer_km: number | null;
  vendor: string;
  next_due_on: string | null;
  created_at: string;
}

export interface StaffVehicleAssignment {
  id: UUID;
  vehicle: UUID;
  vehicle_registration: string;
  staff: UUID;
  staff_name: string;
  staff_type: string;
  staff_phone: string;
  role: "DRIVER" | "ATTENDANT";
  start_date: string;
  end_date: string | null;
  is_active: boolean;
  notes: string;
  created_at: string;
}

export interface VehicleAlert {
  document: string;
  expires_on: string;
  level: "expired" | "expiring";
}

export interface Vehicle {
  id: UUID;
  registration_number: string;
  fleet_number: string;
  display_name: string;
  vehicle_type: "BUS" | "MINI_BUS" | "VAN" | "OTHER";
  make: string;
  model: string;
  year: number | null;
  colour: string;
  capacity: number;
  status: VehicleStatus;
  gps_device_id: string;
  insurance_number: string;
  insurance_expiry: string | null;
  permit_number: string;
  permit_expiry: string | null;
  fitness_certificate_number: string;
  fitness_expiry: string | null;
  pollution_expiry: string | null;
  last_service_date: string | null;
  next_service_due: string | null;
  odometer_km: number;
  notes?: string;
  document_alerts: VehicleAlert[];
  has_expired_documents: boolean;
  driver: { assignment_id: UUID; id: UUID; name: string; phone: string; licence_expired: boolean } | null;
  attendant: { assignment_id: UUID; id: UUID; name: string; phone: string } | null;
  routes: { id: UUID; name: string; code: string }[];
  assigned_students: number | null;
  documents?: VehicleDocument[];
  created_at: string;
  updated_at: string;
}

export interface VehicleHistory {
  assignments: StaffVehicleAssignment[];
  audit: AuditLog[];
}

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------
export type StaffType = "DRIVER" | "ATTENDANT" | "TRANSPORT_MANAGER" | "SCHOOL_ADMIN";

export interface StaffDocument {
  id: UUID;
  staff: UUID;
  doc_type: string;
  title: string;
  number: string;
  issued_on: string | null;
  expires_on: string | null;
  file: string | null;
  notes: string;
  is_expired: boolean;
  created_at: string;
}

export interface Staff {
  id: UUID;
  staff_type: StaffType;
  employee_id: string;
  first_name: string;
  last_name: string;
  full_name: string;
  email: string;
  phone: string;
  date_of_birth: string | null;
  gender: string;
  photo: string | null;
  address: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  joining_date: string | null;
  status: "ACTIVE" | "ON_LEAVE" | "INACTIVE";
  licence_number: string;
  licence_class: string;
  licence_expiry: string | null;
  licence_expired: boolean;
  notes: string;
  user_email: string | null;
  has_account: boolean;
  account_active: boolean;
  documents: StaffDocument[];
  current_vehicle: { id: UUID; registration_number: string; role: string } | null;
  expiring_documents: { title: string; expires_on: string; expired: boolean }[];
  created_at: string;
  updated_at: string;
}

export interface StaffLeave {
  id: UUID;
  staff: UUID;
  staff_name: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  decided_by: UUID | null;
  created_at: string;
}

export interface StaffAttendance {
  id: UUID;
  staff: UUID;
  staff_name: string;
  date: string;
  status: "PRESENT" | "ABSENT" | "LEAVE" | "HALF_DAY";
  note: string;
}

export interface StaffHistoryItem {
  id: UUID;
  vehicle: string;
  role: string;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
}

export interface GuardianLink {
  id: UUID;
  parent: UUID;
  parent_name: string;
  parent_phone: string;
  parent_email: string;
  parent_status: string;
  student: UUID;
  student_name: string;
  student_admission_number: string;
  student_class: string;
  relationship: "FATHER" | "MOTHER" | "GUARDIAN" | "OTHER";
  is_primary: boolean;
  can_pickup: boolean;
  receives_notifications: boolean;
  created_at: string;
}

export interface StudentTransportSummary {
  id: UUID;
  route_id: UUID;
  route_name: string;
  route_code: string;
  pickup_stop_id: UUID | null;
  pickup_stop_name: string | null;
  dropoff_stop_id: UUID | null;
  dropoff_stop_name: string | null;
  vehicle_registration: string | null;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
}

export interface Student {
  id: UUID;
  admission_number: string;
  first_name: string;
  last_name: string;
  full_name: string;
  grade: string;
  section: string;
  class_label: string;
  date_of_birth: string | null;
  gender: string;
  photo: string | null;
  blood_group: string;
  medical_notes: string;
  pickup_address: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  status: "ACTIVE" | "TRANSFERRED" | "WITHDRAWN" | "INACTIVE";
  transport_status: "ACTIVE" | "WITHDRAWN" | "NONE";
  status_changed_at: string | null;
  status_reason: string;
  notes: string;
  guardians: GuardianLink[];
  transport: StudentTransportSummary | null;
  fee_plan: { id: UUID; name: string; amount: string } | null;
  created_at: string;
  updated_at: string;
}

export interface ImportRow {
  line: number | null;
  status: "ok" | "error" | "duplicate_in_file" | "duplicate_existing";
  errors: Record<string, string[]>;
  data: Record<string, string | null>;
}

export interface ImportPreview {
  rows: ImportRow[];
  summary: { total: number; valid: number; errors: number; duplicates: number };
}

export interface ImportResult {
  created_students: number;
  created_parents: number;
  linked: number;
  skipped?: number;
  summary?: ImportPreview["summary"];
  [key: string]: unknown;
}

export interface Parent {
  id: UUID;
  first_name: string;
  last_name: string;
  full_name: string;
  email: string;
  phone: string;
  alt_phone: string;
  address: string;
  status: "INVITED" | "ACTIVE" | "SUSPENDED";
  phone_verified: boolean;
  email_verified: boolean;
  preferred_language: string;
  notes: string;
  has_account: boolean;
  account_active: boolean;
  last_login: string | null;
  children: {
    link_id: UUID;
    student_id: UUID;
    name: string;
    admission_number: string;
    class_label: string;
    relationship: string;
    is_primary: boolean;
    transport_status: string;
  }[];
  fee_summary: { outstanding: string; invoice_count: number };
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------
export interface RouteStop {
  id: UUID;
  route: UUID;
  name: string;
  sequence: number;
  latitude: string;
  longitude: string;
  address: string;
  landmark: string;
  planned_pickup_time: string | null;
  planned_dropoff_time: string | null;
  is_school_stop: boolean;
  wait_minutes: number;
  student_count: number | null;
}

export interface RouteStopWrite {
  id?: UUID;
  name: string;
  latitude: number;
  longitude: number;
  address: string;
  landmark: string;
  planned_pickup_time: string | null;
  planned_dropoff_time: string | null;
  is_school_stop: boolean;
  wait_minutes: number;
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
  created_at: string;
}

export interface RouteListItem {
  id: UUID;
  name: string;
  code: string;
  description: string;
  colour: string;
  vehicle: UUID | null;
  vehicle_registration: string | null;
  vehicle_fleet_number: string | null;
  vehicle_capacity: number | null;
  driver: UUID | null;
  driver_name: string | null;
  attendant: UUID | null;
  attendant_name: string | null;
  is_active: boolean;
  distance_km: string | null;
  estimated_duration_minutes: number | null;
  version: number;
  student_count: number;
  stop_count: number;
  capacity_warning: string | null;
  created_at: string;
  updated_at: string;
}

export interface RouteDetail extends RouteListItem {
  path: [number, number][];
  stops: RouteStop[];
  schedules: RouteSchedule[];
}

export interface TransportAssignment {
  id: UUID;
  student: UUID;
  student_name: string;
  student_admission_number: string;
  student_class: string;
  route: UUID;
  route_name: string;
  route_code: string;
  pickup_stop: UUID | null;
  pickup_stop_name: string | null;
  dropoff_stop: UUID | null;
  dropoff_stop_name: string | null;
  uses_pickup: boolean;
  uses_dropoff: boolean;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
  ended_reason: string;
  notes: string;
  created_at: string;
}

export interface RouteHistory {
  audit: AuditLog[];
  past_assignments: TransportAssignment[];
}

// ---------------------------------------------------------------------------
// Trips
// ---------------------------------------------------------------------------
export interface LiveResponse {
  trips: Trip[];
  server_time: string;
}

export interface GPSPoint {
  id: number;
  latitude: number;
  longitude: number;
  accuracy_m: number | null;
  speed_mps: number | null;
  heading: number | null;
  recorded_at: string;
  received_at: string;
  source: string;
  is_simulated: boolean;
}

export interface BoardingEvent {
  id: UUID;
  trip: UUID;
  trip_direction: Direction;
  trip_date: string;
  route_code: string;
  vehicle_registration: string | null;
  student: UUID;
  student_name: string;
  admission_number: string;
  class_label: string;
  trip_stop: UUID | null;
  stop_name: string | null;
  event_type: "BOARDED" | "DROPPED" | "ABSENT" | "NO_SHOW";
  occurred_at: string;
  recorded_by_name: string | null;
  latitude: number | null;
  longitude: number | null;
  note: string;
}

export interface Incident {
  id: UUID;
  trip: UUID | null;
  route_code: string | null;
  vehicle: UUID | null;
  vehicle_registration: string | null;
  reported_by_name: string | null;
  category: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  title: string;
  description: string;
  occurred_at: string;
  latitude: number | null;
  longitude: number | null;
  status: "OPEN" | "INVESTIGATING" | "RESOLVED" | "CLOSED";
  is_emergency: boolean;
  resolution_notes: string;
  resolved_at: string | null;
  resolved_by_name: string | null;
  students: UUID[];
  student_names: string[];
  created_at: string;
}

export interface SimulationState {
  is_running: boolean;
  progress_m: number;
  speed_mps: number;
  auto_board: boolean;
  auto_complete: boolean;
  last_tick_at: string | null;
}

export interface SimulationPayload {
  simulated: boolean;
  label: string;
  simulation: SimulationState | null;
  trip: TripDetail;
  celery_beat_required: boolean;
}

export interface RunningSimulation {
  trip_id: UUID;
  route: string;
  progress_m: number;
  speed_mps: number;
}

export type { Trip, TripDetail, TripStatus };

// ---------------------------------------------------------------------------
// Billing
// ---------------------------------------------------------------------------
export interface FeePlan {
  id: UUID;
  name: string;
  code: string;
  basis: "ROUTE" | "DISTANCE" | "GRADE" | "CUSTOM";
  billing_cycle: "MONTHLY" | "TERM" | "ANNUAL";
  amount: string;
  currency: string;
  route: UUID | null;
  route_name: string | null;
  distance_min_km: string | null;
  distance_max_km: string | null;
  grades: string[];
  description: string;
  is_active: boolean;
  assigned_students: number | null;
  created_at: string;
}

export interface FeeAssignment {
  id: UUID;
  student: UUID;
  student_name: string;
  student_class: string;
  admission_number: string;
  fee_plan: UUID;
  fee_plan_name: string;
  fee_plan_amount: string;
  billing_cycle: string;
  start_date: string;
  end_date: string | null;
  discount_amount: string;
  discount_reason: string;
  is_active: boolean;
  notes: string;
  created_at: string;
}

export type InvoiceStatus = "DRAFT" | "ISSUED" | "PARTIALLY_PAID" | "PAID" | "OVERDUE" | "CANCELLED";

export interface Invoice {
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
  created_at: string;
}

export interface InvoiceDetail extends Invoice {
  line_items: { id: UUID; description: string; quantity: string; unit_amount: string; amount: string }[];
  payments: {
    payment_id: UUID;
    payment_number: string;
    amount: string;
    method: string;
    status: string;
    paid_at: string;
    is_simulated: boolean;
    receipt_number: string | null;
  }[];
}

export type PaymentMethod = "CASH" | "BANK_TRANSFER" | "UPI" | "CHEQUE" | "ONLINE";

export interface Payment {
  id: UUID;
  payment_number: string;
  student: UUID;
  student_name: string;
  admission_number: string;
  paid_by_name: string | null;
  amount: string;
  currency: string;
  method: PaymentMethod;
  status: "PENDING" | "VERIFIED" | "FAILED" | "REVERSED";
  transaction_reference: string;
  gateway: string;
  gateway_order_id: string;
  gateway_payment_id: string;
  is_simulated: boolean;
  paid_at: string;
  verified_at: string | null;
  received_by_name: string | null;
  reversed_at: string | null;
  reversal_reason: string;
  notes: string;
  receipt_number: string | null;
  receipt_id: UUID | null;
  allocations: { invoice_id: UUID; invoice_number: string; period_label: string; amount: string }[];
  created_at: string;
}

export interface PaymentAdjustment {
  id: UUID;
  kind: string;
  amount: string;
  reason: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  payment_number: string | null;
  invoice_number: string | null;
  created_by_name: string | null;
  created_at: string;
}

export interface BillingSummary {
  billed: string;
  collected: string;
  outstanding: string;
  overdue: string;
  simulated_collected: string;
  invoice_count: number;
  payment_count: number;
  overdue_count: number;
  by_method: { method: string; total: string }[];
  by_status: { status: string; count: number; total: string }[];
  monthly_collections: { month: string; total: string }[];
  monthly_billed: { month: string; total: string }[];
  currency: string;
  date_from?: string;
  date_to?: string;
}

// ---------------------------------------------------------------------------
// Engagement
// ---------------------------------------------------------------------------
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
  category: string;
  priority: "LOW" | "NORMAL" | "HIGH";
  subject: string;
  description: string;
  status: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
  assigned_to: UUID | null;
  assigned_to_name: string | null;
  resolution_notes: string;
  resolved_at: string | null;
  trip: UUID | null;
  comments: ComplaintComment[];
  created_at: string;
  updated_at: string;
}

export interface Announcement {
  id: UUID;
  title: string;
  body: string;
  audience: "ALL" | "PARENTS" | "STAFF" | "ROUTE";
  route: UUID | null;
  route_name: string | null;
  is_pinned: boolean;
  publish_at: string;
  expires_at: string | null;
  created_by_name: string | null;
  notification_sent_at: string | null;
  is_live: boolean;
  created_at: string;
}

export interface AbsenceRequest {
  id: UUID;
  student: UUID;
  student_name: string;
  student_class: string;
  requested_by_name: string | null;
  date_from: string;
  date_to: string;
  direction: "PICKUP" | "DROPOFF" | "BOTH";
  reason: string;
  status: "SUBMITTED" | "ACKNOWLEDGED" | "CANCELLED";
  acknowledged_at: string | null;
  created_at: string;
}

export interface PickupChangeRequest {
  id: UUID;
  student: UUID;
  student_name: string;
  student_class: string;
  requested_by_name: string | null;
  change_type: "STOP_CHANGE" | "ROUTE_CHANGE" | "TEMPORARY" | "WITHDRAW" | "OTHER";
  effective_date: string;
  end_date: string | null;
  requested_route: UUID | null;
  requested_route_name: string | null;
  requested_pickup_stop: UUID | null;
  requested_pickup_stop_name: string | null;
  requested_dropoff_stop: UUID | null;
  requested_dropoff_stop_name: string | null;
  details: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
  decided_by_name: string | null;
  decided_at: string | null;
  decision_notes: string;
  current_assignment: { route: string; pickup_stop: string | null } | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------
export interface AttendanceReport {
  date_from: string;
  date_to: string;
  totals: { expected: number; boarded: number; absent: number; no_show: number };
  by_day: { date: string; direction: Direction; expected: number; boarded: number; absent: number }[];
  by_route: { route: string; expected: number; boarded: number; absent: number }[];
  frequent_absentees: { student_id: UUID; name: string; admission_number: string; grade: string; count: number }[];
  unboarded: { student_id: UUID; name: string; admission_number: string; date: string; route: string; status: string }[];
  events_by_type: { event_type: string; count: number }[];
}

export interface TripsReport {
  date_from: string;
  date_to: string;
  total: number;
  completed: number;
  cancelled: number;
  on_time_rate: number | null;
  avg_delay_minutes: number;
  by_status: { status: string; count: number }[];
  by_day: { date: string; total: number; completed: number; cancelled: number; avg_delay: number }[];
  by_route: { route: string; total: number; completed: number; avg_delay: number; students: number }[];
}

export interface FleetReport {
  vehicles: {
    id: UUID;
    registration: string;
    fleet_number: string;
    status: string;
    capacity: number;
    trips_30d: number;
    completed_30d: number;
    students_30d: number;
    incidents_30d: number;
    maintenance_cost_30d: string;
    document_alerts: number;
    odometer_km: number;
  }[];
  by_status: { status: string; count: number }[];
}

export interface StudentsReport {
  by_status: { status: string; count: number }[];
  by_grade: { grade: string; total: number; transport: number }[];
  by_route: { route: string; count: number; capacity: number | null }[];
  by_stop: { stop: string; route: string; count: number }[];
}

export type { Notification };
