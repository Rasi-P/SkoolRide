import { screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "@/test/server";
import { renderWithProviders } from "@/test/utils";
import type { PlatformOverview, PlatformStats } from "../types";
import PlatformDashboardPage from "./PlatformDashboardPage";

const overview: PlatformOverview = {
  total_schools: 4,
  active_schools: 3,
  suspended_schools: 1,
  pending_applications: 2,
  total_vehicles: 8,
  total_students: 36,
  active_trips: 0,
  trips_today: 8,
  recent_applications: [
    {
      id: "app1",
      tracking_code: "APP-FAB7A83E",
      school_name: "Hillcrest Montessori",
      contact_name: "Daniel D'Souza",
      contact_email: "daniel@hillcrest.demo",
      contact_phone: "+91 832 245 6677",
      designation: "Director",
      address: "Hill Top Road, Porvorim",
      city: "Panaji",
      state: "Goa",
      country: "India",
      postal_code: "",
      website: "",
      estimated_students: 120,
      estimated_vehicles: 2,
      requested_plan: null,
      requested_plan_name: null,
      message: "",
      status: "UNDER_REVIEW",
      review_notes: "",
      reviewed_by: null,
      reviewed_by_name: null,
      reviewed_at: null,
      school: null,
      school_id: null,
      created_at: "2026-10-20T05:53:50Z",
      updated_at: "2026-10-20T05:53:50Z",
    },
  ],
  recent_activity: [
    {
      id: 1245,
      action: "school.suspended",
      actor_email: "superadmin@schoolbuspro.demo",
      target_type: "School",
      target_id: "20c7733b",
      target_repr: "Riverside Academy",
      changes: { reason: "Subscription payment overdue" },
      ip_address: "127.0.0.1",
      school: "Riverside Academy",
      school_name: "Riverside Academy",
      created_at: "2026-10-21T05:53:50Z",
    },
  ],
  school_growth: [{ month: "2026-10", count: 4 }],
  schools_by_status: [
    { status: "ACTIVE", count: 3 },
    { status: "SUSPENDED", count: 1 },
  ],
};

const stats: PlatformStats = { gps_points_today: 3, trips_completed_today: 1, notifications_today: 148, deliveries_failed_today: 0, users_total: 40, users_active_last_7_days: 5 };

describe("PlatformDashboardPage", () => {
  it("renders stat cards, recent applications, activity and system stats from the API", async () => {
    server.use(
      http.get("/api/platform/overview/", () => HttpResponse.json(overview)),
      http.get("/api/platform/stats/", () => HttpResponse.json(stats)),
    );
    renderWithProviders(<PlatformDashboardPage />, { route: "/platform" });

    expect(await screen.findByText("Total schools")).toBeInTheDocument();
    expect(await screen.findByText("36")).toBeInTheDocument(); // active students
    expect(screen.getByText("Pending applications")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Hillcrest Montessori" })).toHaveAttribute("href", "/platform/applications?id=app1");
    expect(screen.getByText("School suspended")).toBeInTheDocument();
    expect(screen.getAllByText("Riverside Academy", { exact: false }).length).toBeGreaterThan(0);
    expect(await screen.findByText("148")).toBeInTheDocument(); // notifications today
    expect(screen.getByRole("img", { name: /Schools onboarded per month/ })).toBeInTheDocument();
  }, 25_000);

  it("shows an error state with a retry action when the overview request fails", async () => {
    server.use(
      http.get("/api/platform/overview/", () => HttpResponse.json({ detail: "Overview unavailable", code: "server_error" }, { status: 500 })),
      http.get("/api/platform/stats/", () => HttpResponse.json(stats)),
    );
    renderWithProviders(<PlatformDashboardPage />, { route: "/platform" });
    expect(await screen.findByText("Could not load data")).toBeInTheDocument();
    expect(screen.getByText("Overview unavailable")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});
