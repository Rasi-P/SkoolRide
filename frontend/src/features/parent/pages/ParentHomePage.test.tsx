import { screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { server } from "@/test/server";
import { renderWithProviders } from "@/test/utils";
import { ParentProvider } from "../context";
import { LOCATION, TRIP, baseHandlers, homePayload, livePayload } from "../test/fixtures";
import ParentHomePage from "./ParentHomePage";

vi.mock("@/components/map/BusMap", () => ({ BusMap: () => <div data-testid="bus-map" /> }));

describe("ParentHomePage", () => {
  it("renders today's trip, the live map and the fee card from /parent/home/", async () => {
    const etaAt = new Date(Date.now() + 7 * 60_000).toISOString();
    server.use(
      ...baseHandlers,
      http.get("/api/parent/home/", () =>
        HttpResponse.json(
          homePayload({
            today_trips: [
              {
                trip_id: "t1",
                direction: "PICKUP",
                status: "IN_PROGRESS",
                scheduled_start_time: "06:50:00",
                student_status: "EXPECTED",
                stop: "Kadugodi Bus Stand",
                planned_time: "06:50:00",
                eta: { eta_at: etaAt, seconds: 420, minutes: 7, distance_m: 2100 },
                vehicle: "Bus 1",
                delay_minutes: 3,
                is_simulated: true,
              },
            ],
            live: livePayload({ trip: { ...TRIP, status: "IN_PROGRESS" }, location: LOCATION, eta: { eta_at: etaAt, seconds: 420, minutes: 7, distance_m: 2100 } }),
            fees: { outstanding: "2400.00", open_invoices: 1, overdue: 1, currency: "INR", next_due: "2026-10-10" },
          }),
        ),
      ),
    );
    renderWithProviders(
      <ParentProvider>
        <ParentHomePage />
      </ParentProvider>,
      { route: "/parent" },
    );

    // Today card: direction, stop, live ETA countdown, delay and simulated tags.
    expect(await screen.findByRole("button", { name: /Morning pickup trip/ })).toBeInTheDocument();
    expect(screen.getByText("Morning pickup")).toBeInTheDocument();
    expect(screen.getAllByText(/Kadugodi Bus Stand/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Bus about 7 min away/)).toBeInTheDocument();
    expect(screen.getByText("3 min late")).toBeInTheDocument();
    expect(screen.getAllByText("SIMULATED").length).toBeGreaterThan(0);
    expect(screen.getAllByText("LIVE").length).toBeGreaterThan(0);
    // Live mini map for the active trip.
    expect(screen.getByTestId("bus-map")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open live tracking" })).toBeInTheDocument();
    // Fee card.
    expect(screen.getByText(/2,400/)).toBeInTheDocument();
    expect(screen.getByText("1 overdue")).toBeInTheDocument();
    expect(screen.getByText(/Next due 10 Oct 2026/)).toBeInTheDocument();
    // Bus & driver card with call button, and both children selectable.
    expect(screen.getByRole("link", { name: /Call driver Ravi Kumar/ })).toHaveAttribute("href", "tel:+919845020001");
    expect(screen.getByRole("radio", { name: /Aarav/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /Ananya/ })).toBeInTheDocument();
    expect(screen.getByText("Transport fee due on the 10th")).toBeInTheDocument();
  });

  it("shows an empty state for a day without trips", async () => {
    server.use(...baseHandlers, http.get("/api/parent/home/", () => HttpResponse.json(homePayload({ today_trips: [], live: livePayload({ trip: null, trip_student: null }) }))));
    renderWithProviders(
      <ParentProvider>
        <ParentHomePage />
      </ParentProvider>,
      { route: "/parent" },
    );
    expect(await screen.findByText("No bus trips scheduled for today.")).toBeInTheDocument();
    expect(screen.queryByTestId("bus-map")).not.toBeInTheDocument();
  });

  it("never labels an old GPS position as live on the home map", async () => {
    const old = new Date(Date.now() - 10 * 60_000).toISOString();
    server.use(...baseHandlers, http.get("/api/parent/home/", () => HttpResponse.json(homePayload({
      today_trips: [], live: livePayload({ trip: { ...TRIP, status: "IN_PROGRESS" }, location: { ...LOCATION, recorded_at: old }, last_location_at: old, stale: false }),
    }))));
    renderWithProviders(<ParentProvider><ParentHomePage /></ParentProvider>, { route: "/parent" });
    expect(await screen.findByText("Current bus location unavailable")).toBeInTheDocument();
    expect(screen.getByText(/map shows the last recorded bus position/)).toBeInTheDocument();
    expect(screen.queryByText("LIVE")).not.toBeInTheDocument();
  });
});
