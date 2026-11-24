import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "@/test/server";
import { renderWithProviders } from "@/test/utils";
import type { AuditLog } from "../types";
import PlatformAuditLogsPage from "./PlatformAuditLogsPage";

const entry: AuditLog = {
  id: 1245,
  action: "school.suspended",
  actor_email: "superadmin@schoolbuspro.demo",
  target_type: "School",
  target_id: "20c7733b-f28e-4f67-be63-8cd652c4cb61",
  target_repr: "Riverside Academy",
  changes: { reason: "Subscription payment overdue by 45 days." },
  ip_address: "127.0.0.1",
  school: "Riverside Academy",
  school_name: "Riverside Academy",
  created_at: "2026-10-19T05:53:50Z",
};
const schools = () => HttpResponse.json({ count: 0, next: null, previous: null, results: [] });

describe("PlatformAuditLogsPage", () => {
  it("lists entries and expands a row to show the changes JSON", async () => {
    const user = userEvent.setup();
    server.use(
      http.get("/api/platform/audit-logs/", () => HttpResponse.json({ count: 1, next: null, previous: null, results: [entry] })),
      http.get("/api/platform/schools/", schools),
    );
    renderWithProviders(<PlatformAuditLogsPage />);
    expect(await screen.findByText("School suspended")).toBeInTheDocument();
    expect(screen.getByText("superadmin@schoolbuspro.demo")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Expand row" }));
    expect(await screen.findByText(/"reason": "Subscription payment overdue by 45 days."/)).toBeInTheDocument();
  }, 25_000);

  it("shows the empty state when nothing has been recorded", async () => {
    server.use(
      http.get("/api/platform/audit-logs/", () => HttpResponse.json({ count: 0, next: null, previous: null, results: [] })),
      http.get("/api/platform/schools/", schools),
    );
    renderWithProviders(<PlatformAuditLogsPage />);
    expect(await screen.findByText("No audit entries yet")).toBeInTheDocument();
  });

  it("shows an error state when the API fails", async () => {
    server.use(
      http.get("/api/platform/audit-logs/", () => HttpResponse.json({ detail: "Audit store offline", code: "server_error" }, { status: 503 })),
      http.get("/api/platform/schools/", schools),
    );
    renderWithProviders(<PlatformAuditLogsPage />);
    expect(await screen.findByText("Could not load data")).toBeInTheDocument();
    expect(screen.getByText("Audit store offline")).toBeInTheDocument();
  });
});
