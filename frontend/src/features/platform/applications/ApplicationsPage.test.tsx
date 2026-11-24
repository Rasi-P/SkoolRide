import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "@/test/server";
import { renderWithProviders } from "@/test/utils";
import type { SchoolApplication, SubscriptionPlan } from "../types";
import ApplicationsPage from "./ApplicationsPage";

const application: SchoolApplication = {
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
  requested_plan: "plan1",
  requested_plan_name: "Starter",
  message: "We run two buses.",
  status: "PENDING",
  review_notes: "",
  reviewed_by: null,
  reviewed_by_name: null,
  reviewed_at: null,
  school: null,
  school_id: null,
  created_at: "2026-10-20T05:53:50Z",
  updated_at: "2026-10-20T05:53:50Z",
};

const plan: SubscriptionPlan = {
  id: "plan1",
  code: "starter",
  name: "Starter",
  description: "",
  price_monthly: "2999.00",
  currency: "INR",
  max_vehicles: 5,
  max_students: 300,
  max_staff: 15,
  max_routes: 6,
  features: ["Live tracking"],
  is_active: true,
  sort_order: 1,
  created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-01T00:00:00Z",
};

const paged = <T,>(results: T[]) => ({ count: results.length, next: null, previous: null, results });

describe("ApplicationsPage", () => {
  it("opens the deep-linked application and shows the invitation link after approval", async () => {
    const user = userEvent.setup();
    let approveBody: { plan?: string; notes?: string } | null = null;
    server.use(
      http.get("/api/platform/applications/", () => HttpResponse.json(paged([application]))),
      http.get("/api/platform/applications/app1/", () => HttpResponse.json(application)),
      http.get("/api/platform/plans/", () => HttpResponse.json(paged([plan]))),
      http.post("/api/platform/applications/app1/approve/", async ({ request }) => {
        approveBody = (await request.json()) as { plan?: string; notes?: string };
        return HttpResponse.json(
          {
            application: { ...application, status: "APPROVED", school_id: "s1" },
            school: { id: "s1", name: "Hillcrest Montessori", status: "APPROVED" },
            invitation: {
              id: "inv1",
              email: "daniel@hillcrest.demo",
              first_name: "Daniel",
              last_name: "D'Souza",
              role: "SCHOOL_ADMIN",
              status: "PENDING",
              expires_at: "2026-10-29T05:53:58Z",
              accepted_at: null,
              invited_by_name: "Platform Admin",
              accept_url: "http://localhost:5173/invite/tok123",
              created_at: "2026-10-22T05:53:58Z",
            },
          },
          { status: 201 },
        );
      }),
    );
    renderWithProviders(<ApplicationsPage />, { route: "/platform/applications?id=app1", path: "/platform/applications" });

    // Drawer opened from ?id= and shows full details (address only appears in the drawer)
    expect(await screen.findByText("Hill Top Road, Porvorim")).toBeInTheDocument();
    expect(screen.getByText("We run two buses.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /approve$/i }));
    await user.click(await screen.findByRole("button", { name: "Confirm approval" }));

    expect(await screen.findByDisplayValue("http://localhost:5173/invite/tok123")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy invitation link" })).toBeInTheDocument();
    expect(screen.getByText("Application approved")).toBeInTheDocument();
    expect(approveBody).toEqual({ plan: "plan1", notes: "" });
  }, 40_000);

  it("requires a reason to reject and surfaces backend state errors", async () => {
    const user = userEvent.setup();
    server.use(
      http.get("/api/platform/applications/", () => HttpResponse.json(paged([application]))),
      http.get("/api/platform/applications/app1/", () => HttpResponse.json(application)),
      http.post("/api/platform/applications/app1/reject/", () => HttpResponse.json({ detail: "Application is already approved.", code: "invalid_transition" }, { status: 400 })),
    );
    renderWithProviders(<ApplicationsPage />, { route: "/platform/applications?id=app1", path: "/platform/applications" });
    expect(await screen.findByText("Hill Top Road, Porvorim")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /reject$/i }));
    await user.click(await screen.findByRole("button", { name: "Confirm rejection" }));
    expect(await screen.findByText("Please give a reason for the applicant")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Reason"), "Not a registered school");
    await user.click(screen.getByRole("button", { name: "Confirm rejection" }));
    expect(await screen.findByText("Application is already approved.")).toBeInTheDocument();
  }, 40_000);
});
