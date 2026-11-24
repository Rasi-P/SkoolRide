import { screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "@/test/server";
import { renderWithProviders } from "@/test/utils";
import SchoolDashboardPage from "./SchoolDashboardPage";

describe("SchoolDashboardPage", () => {
  it("renders the headline stats from /school/dashboard/", async () => {
    server.use(http.get("/api/school/profile/", () => HttpResponse.json({ id: "s1", name: "Greenfield", onboarding_dismissed: false, subscription: null })));
    renderWithProviders(<SchoolDashboardPage />, { route: "/school" });
    expect(await screen.findByText("Students using transport")).toBeInTheDocument();
    expect(screen.getByText("27")).toBeInTheDocument();
    expect(screen.getByText("of 28 active students")).toBeInTheDocument();
    expect(screen.getByText("Buses available")).toBeInTheDocument();
    expect(screen.getByText("3 / 5")).toBeInTheDocument();
    expect(screen.getByText("1 in service · 1 in maintenance")).toBeInTheDocument();
    expect(screen.getByText("Trips today")).toBeInTheDocument();
    expect(screen.getByText("1 running")).toBeInTheDocument();
    expect(screen.getByText("Boarded vs expected")).toBeInTheDocument();
    expect(screen.getByText("6 / 27")).toBeInTheDocument();
    // document alert from the mocked dashboard payload
    expect(screen.getByText("KA05EF3456")).toBeInTheDocument();
    expect(screen.getByText(/Insurance · 19 Oct 2026/)).toBeInTheDocument();
    // onboarding is complete in the mock, so the checklist card is hidden
    expect(screen.queryByText("Getting started")).not.toBeInTheDocument();
  });
});
