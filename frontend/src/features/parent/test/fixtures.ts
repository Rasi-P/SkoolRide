/** Shared MSW fixtures for the parent feature tests. Shapes mirror real /api/parent responses. */
import { http, HttpResponse } from "msw";
import type { ChildSummary, HomePayload, LivePayload, LiveLocation, LiveStop, LiveTrip, ParentInvoice, ParentPayment, ParentStop, SchoolInfo } from "../types";

export const STOP: ParentStop = {
  id: "rs-1",
  name: "Kadugodi Bus Stand",
  latitude: 12.9955,
  longitude: 77.762,
  address: "Kadugodi Bus Stand, Bengaluru",
  landmark: "",
  planned_pickup_time: "06:50:00",
  planned_dropoff_time: "16:10:00",
  sequence: 1,
};

export const CHILD_A: ChildSummary = {
  id: "st-1",
  name: "Aarav Sharma",
  first_name: "Aarav",
  admission_number: "GF2024100",
  class_label: "1-A",
  grade: "1",
  section: "A",
  photo: null,
  status: "ACTIVE",
  transport_status: "ACTIVE",
  transport: {
    id: "as-1",
    route: { id: "r1", code: "R1", name: "Whitefield Loop", colour: "#1d4ed8" },
    pickup_stop: STOP,
    dropoff_stop: STOP,
    uses_pickup: true,
    uses_dropoff: true,
    vehicle: { id: "v1", registration_number: "KA01AB1234", fleet_number: "1", display_name: "Bus 1", capacity: 40, colour: "Yellow" },
    driver: { name: "Ravi Kumar", phone: "+91 98450 20001" },
    attendant: { name: "Kavitha R" },
    start_date: "2026-06-24",
  },
};

export const CHILD_B: ChildSummary = { ...CHILD_A, id: "st-2", name: "Ananya Sharma", first_name: "Ananya", admission_number: "GF2024106", class_label: "7-A", grade: "7" };

export const SCHOOL: SchoolInfo = {
  id: "s1",
  name: "Greenfield International School",
  logo: null,
  timezone: "Asia/Kolkata",
  currency: "INR",
  transport_office_phone: "+91 98450 11223",
  transport_office_email: "transport@greenfield.demo",
  emergency_contact_phone: "+91 98450 99999",
  parent_help_text: "Transport office hours: 7am-5pm on school days.",
  address: "Survey 42, Whitefield Main Road, Bengaluru",
  pickup_change_cutoff_hours: 12,
  absence_report_cutoff_minutes: 60,
  arrival_alert_minutes: 10,
  accepted_payment_methods: ["CASH", "UPI", "ONLINE"],
  demo_mode: true,
};

export const TRIP: LiveTrip = {
  id: "t1",
  status: "SCHEDULED",
  direction: "PICKUP",
  scheduled_date: "2026-10-22",
  scheduled_start_time: "06:50:00",
  started_at: null,
  ended_at: null,
  delay_minutes: 0,
  is_simulated: true,
  cancelled_reason: "",
  route: { id: "r1", code: "R1", name: "Whitefield Loop", colour: "#1d4ed8" },
  vehicle: { registration_number: "KA01AB1234", fleet_number: "1", display_name: "Bus 1" },
  driver: { name: "Ravi Kumar", phone: "+91 98450 20001" },
  next_stop: { id: "ts-1", name: "Kadugodi Bus Stand", eta: null },
};

export const STOPS: LiveStop[] = [
  { id: "ts-1", route_stop: "rs-1", sequence: 1, name: "Kadugodi Bus Stand", latitude: "12.995500", longitude: "77.762000", address: "Kadugodi", is_school_stop: false, planned_time: "06:50:00", eta: null, distance_remaining_m: null, arrived_at: null, departed_at: null, status: "PENDING" },
  { id: "ts-2", route_stop: "rs-2", sequence: 2, name: "Greenfield International School", latitude: "12.969800", longitude: "77.750000", address: "Whitefield Main Road", is_school_stop: true, planned_time: "07:30:00", eta: null, distance_remaining_m: null, arrived_at: null, departed_at: null, status: "PENDING" },
];

export const LOCATION: LiveLocation = { latitude: 12.99, longitude: 77.76, speed_mps: 8.2, heading: 90, accuracy_m: 12, recorded_at: new Date().toISOString(), is_simulated: true };

export function livePayload(overrides: Partial<LivePayload> = {}): LivePayload {
  return {
    student: CHILD_A,
    assignment: CHILD_A.transport,
    trip: TRIP,
    trip_student: { id: "tstu-1", status: "EXPECTED", boarded_at: null, dropped_at: null, stop: { id: "ts-1", name: "Kadugodi Bus Stand", sequence: 1, latitude: 12.9955, longitude: 77.762, planned_time: "06:50:00", status: "PENDING", eta: null } },
    location: null,
    stale: null,
    last_location_at: null,
    stale_after_seconds: 120,
    eta: null,
    stops: STOPS,
    route_path: [
      [12.9955, 77.762],
      [12.9698, 77.75],
    ],
    server_time: new Date().toISOString(),
    ...overrides,
  };
}

export function homePayload(overrides: Partial<HomePayload> = {}): HomePayload {
  return {
    children: [CHILD_A, CHILD_B],
    selected: CHILD_A,
    today: "2026-10-22",
    today_trips: [],
    live: livePayload(),
    fees: { outstanding: "0", open_invoices: 0, overdue: 0, currency: "INR", next_due: null },
    unread_notifications: 2,
    announcements: [{ id: "a1", title: "Transport fee due on the 10th", body: "Please clear this month's transport fee.", publish_at: new Date().toISOString(), is_pinned: true }],
    ...overrides,
  };
}

export const INVOICE: ParentInvoice = {
  id: "inv-1",
  invoice_number: "INV-GFIS-00042",
  student: "st-1",
  student_name: "Aarav Sharma",
  admission_number: "GF2024100",
  student_class: "1-A",
  billed_to_name: "Priya Sharma",
  fee_plan: "fp-1",
  fee_plan_name: "Zone B (5-10 km)",
  period_label: "October 2026",
  period_start: "2026-10-01",
  period_end: "2026-10-31",
  issue_date: "2026-10-01",
  due_date: "2026-10-10",
  currency: "INR",
  subtotal: "2400.00",
  discount: "0.00",
  late_fee: "0.00",
  total: "2400.00",
  amount_paid: "0.00",
  balance: "2400.00",
  status: "OVERDUE",
  is_overdue: true,
  notes: "",
  line_items: [{ id: "li-1", description: "Zone B (5-10 km) - October 2026", quantity: "1.00", unit_amount: "2400.00", amount: "2400.00" }],
  payments: [],
  created_at: "2026-10-01T00:00:00Z",
};

export const PENDING_PAYMENT: ParentPayment = {
  id: "pay-1",
  payment_number: "PAY-GFIS-00099",
  student: "st-1",
  student_name: "Aarav Sharma",
  admission_number: "GF2024100",
  paid_by_name: "Priya Sharma",
  amount: "2400.00",
  currency: "INR",
  method: "ONLINE",
  status: "PENDING",
  transaction_reference: "",
  gateway: "mock",
  gateway_order_id: "mock_order_1",
  gateway_payment_id: "",
  is_simulated: true,
  paid_at: new Date().toISOString(),
  verified_at: null,
  received_by_name: null,
  reversed_at: null,
  reversal_reason: "",
  notes: "Online payment for INV-GFIS-00042",
  receipt_number: null,
  receipt_id: null,
  allocations: [{ invoice_id: "inv-1", invoice_number: "INV-GFIS-00042", period_label: "October 2026", amount: "2400.00" }],
  created_at: new Date().toISOString(),
};

/** Handlers every parent page needs (children list + school info). */
export const baseHandlers = [
  http.get("/api/parent/children/", () => HttpResponse.json([CHILD_A, CHILD_B])),
  http.get("/api/parent/school/", () => HttpResponse.json(SCHOOL)),
];
