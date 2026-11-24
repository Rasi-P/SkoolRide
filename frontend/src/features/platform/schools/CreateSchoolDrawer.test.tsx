import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "@/test/server";
import { renderWithProviders } from "@/test/utils";
import { CreateSchoolDrawer } from "./CreateSchoolDrawer";

const noPlans = () => HttpResponse.json({ count: 0, next: null, previous: null, results: [] });

describe("CreateSchoolDrawer", () => {
  it("validates required fields client-side before calling the API", async () => {
    const user = userEvent.setup();
    let posted = false;
    server.use(
      http.get("/api/platform/plans/", noPlans),
      http.post("/api/platform/schools/", () => {
        posted = true;
        return HttpResponse.json({}, { status: 201 });
      }),
    );
    renderWithProviders(<CreateSchoolDrawer open onClose={() => undefined} />);

    await user.click(await screen.findByRole("button", { name: "Create school" }));

    expect(await screen.findByText("School name is required")).toBeInTheDocument();
    expect(screen.getByText("First name is required")).toBeInTheDocument();
    expect(screen.getByText("Enter a valid email")).toBeInTheDocument();
    expect(posted).toBe(false);
  }, 25_000);

  it("creates the school and shows the admin invitation link", async () => {
    const user = userEvent.setup();
    let body: Record<string, unknown> | null = null;
    server.use(
      http.get("/api/platform/plans/", noPlans),
      http.post("/api/platform/schools/", async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(
          {
            school: { id: "s9", name: "Lakeview High School", status: "APPROVED" },
            invitation: {
              id: "inv9",
              email: "meena@lakeview.demo",
              first_name: "Meenakshi",
              last_name: "Raman",
              role: "SCHOOL_ADMIN",
              status: "PENDING",
              expires_at: "2026-10-29T00:00:00Z",
              accepted_at: null,
              invited_by_name: "Platform Admin",
              accept_url: "http://localhost:5173/invite/abc",
              created_at: "2026-10-22T00:00:00Z",
            },
          },
          { status: 201 },
        );
      }),
    );
    renderWithProviders(<CreateSchoolDrawer open onClose={() => undefined} />);

    await user.type(await screen.findByLabelText("School name"), "Lakeview High School");
    await user.type(screen.getByLabelText("First name"), "Meenakshi");
    await user.type(screen.getByLabelText("Admin email"), "meena@lakeview.demo");
    await user.click(screen.getByRole("button", { name: "Create school" }));

    expect(await screen.findByDisplayValue("http://localhost:5173/invite/abc")).toBeInTheDocument();
    expect(screen.getByText("Lakeview High School is ready")).toBeInTheDocument();
    expect(body).toMatchObject({ name: "Lakeview High School", admin_first_name: "Meenakshi", admin_email: "meena@lakeview.demo", timezone: "Asia/Kolkata", country: "India" });
  }, 25_000);

  it("maps server field errors onto the form", async () => {
    const user = userEvent.setup();
    server.use(
      http.get("/api/platform/plans/", noPlans),
      http.post("/api/platform/schools/", () =>
        HttpResponse.json({ detail: "Validation failed.", code: "validation_error", errors: { admin_email: ["A user with this email already exists."] } }, { status: 400 }),
      ),
    );
    renderWithProviders(<CreateSchoolDrawer open onClose={() => undefined} />);
    await user.type(await screen.findByLabelText("School name"), "Dup School");
    await user.type(screen.getByLabelText("First name"), "Dup");
    await user.type(screen.getByLabelText("Admin email"), "dup@x.demo");
    await user.click(screen.getByRole("button", { name: "Create school" }));
    expect(await screen.findByText("A user with this email already exists.")).toBeInTheDocument();
  }, 25_000);
});
