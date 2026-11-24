import { http, HttpResponse } from "msw";
import type { User } from "@/types";

export const adminUser: User = {
  id: "u1",
  email: "admin@greenfield.demo",
  first_name: "Lakshmi",
  last_name: "Venkatesh",
  full_name: "Lakshmi Venkatesh",
  phone: "",
  avatar: null,
  is_platform_admin: false,
  must_change_password: false,
  created_at: "2026-01-01T00:00:00Z",
  memberships: [
    {
      id: "m1",
      role: "SCHOOL_ADMIN",
      is_primary: true,
      school_id: "s1",
      school_name: "Greenfield International School",
      school_slug: "greenfield",
      school_status: "ACTIVE",
      school_is_operational: true,
      school_timezone: "Asia/Kolkata",
      school_logo: null,
      onboarding_completed: true,
      permissions: ["dashboard.view", "vehicles.view", "vehicles.manage", "students.view", "trips.view", "billing.view", "reports.view", "school.view", "staff.view", "parents.view", "routes.view", "engagement.view", "attendance.view"],
    },
  ],
};

export const parentUser: User = {
  ...adminUser,
  id: "u2",
  email: "parent@greenfield.demo",
  first_name: "Priya",
  last_name: "Sharma",
  full_name: "Priya Sharma",
  memberships: [{ ...adminUser.memberships[0], id: "m2", role: "PARENT", permissions: ["parent.self"] }],
};

export const handlers = [
  http.get("/api/auth/csrf/", () => HttpResponse.json({ csrfToken: "test-csrf" })),
  http.post("/api/auth/login/", async ({ request }) => {
    const body = (await request.json()) as { email: string; password: string };
    if (body.password !== "Demo@12345") return HttpResponse.json({ detail: "Invalid email or password.", code: "validation_error" }, { status: 400 });
    return HttpResponse.json({ access: "test-token", user: body.email.startsWith("parent") ? parentUser : adminUser });
  }),
  http.post("/api/auth/refresh/", () => HttpResponse.json({ detail: "No refresh token.", code: "no_refresh" }, { status: 401 })),
  http.post("/api/auth/logout/", () => new HttpResponse(null, { status: 204 })),
  http.get("/api/auth/me/", () => HttpResponse.json(adminUser)),
  http.get("/api/public/config/", () => HttpResponse.json({ demo_mode: true, vapid_public_key: null, driver_location_interval_seconds: 10, payment_gateway: "mock" })),
  http.get("/api/notifications/mine/unread-count/", () => HttpResponse.json({ unread: 2 })),
  http.get("/api/school/dashboard/", () =>
    HttpResponse.json({
      date: "2026-10-22",
      students_using_transport: 27,
      students_total: 28,
      vehicles_total: 5,
      vehicles_available: 3,
      vehicles_in_service: 1,
      vehicles_maintenance: 1,
      drivers: 5,
      attendants: 3,
      trips_running: 1,
      trips_upcoming: 7,
      trips_completed_today: 0,
      trips_today: [],
      boarded_vs_expected: { boarded: 6, expected: 27 },
      pending_fees: "48200.00",
      pending_invoices: 22,
      overdue_invoices: 9,
      currency: "INR",
      document_alerts: [{ vehicle: "KA05EF3456", vehicle_id: "v4", document: "Insurance", expires_on: "2026-10-19", level: "expired" }],
      open_complaints: 2,
      open_incidents: 1,
      pending_requests: 1,
      recent_complaints: [],
      recent_incidents: [],
      recent_announcements: [],
      attendance_trend: [{ date: "2026-10-20", expected: 54, boarded: 50, absent: 4 }],
    }),
  ),
  http.get("/api/school/onboarding/", () => HttpResponse.json({ steps: [], completed_steps: 7, total_steps: 7, completed: true })),
  http.get("/api/fleet/vehicles/", ({ request }) => {
    const url = new URL(request.url);
    const search = url.searchParams.get("search") || "";
    const all = [
      { id: "v1", registration_number: "KA01AB1234", fleet_number: "1", display_name: "Bus 1", vehicle_type: "BUS", capacity: 40, status: "AVAILABLE", document_alerts: [], has_expired_documents: false, driver: { id: "d1", name: "Ravi Kumar", phone: "", assignment_id: "a1", licence_expired: false }, attendant: null, routes: [], assigned_students: 7, make: "Tata", model: "Starbus", year: 2021 },
      { id: "v2", registration_number: "KA01AB5678", fleet_number: "2", display_name: "Bus 2", vehicle_type: "BUS", capacity: 32, status: "MAINTENANCE", document_alerts: [], has_expired_documents: true, driver: null, attendant: null, routes: [], assigned_students: 0, make: "Ashok Leyland", model: "Sunshine", year: 2020 },
    ].filter((v) => v.registration_number.toLowerCase().includes(search.toLowerCase()));
    return HttpResponse.json({ count: all.length, next: null, previous: null, results: all });
  }),
];
