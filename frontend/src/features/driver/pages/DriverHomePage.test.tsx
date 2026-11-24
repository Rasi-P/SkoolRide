import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "@/test/server";
import { renderWithProviders } from "@/test/utils";
import { GpsProvider } from "../gps/GpsContext";
import { home } from "../__fixtures__/driver";
import DriverHomePage from "./DriverHomePage";

function renderHome() {
  return renderWithProviders(
    <GpsProvider>
      <DriverHomePage />
    </GpsProvider>,
    { route: "/driver" },
  );
}

describe("DriverHomePage", () => {
  it("renders the assigned vehicle, document alerts and today's trips from /driver/home/", async () => {
    server.use(http.get("/api/driver/home/", () => HttpResponse.json(home)));
    renderHome();
    expect(await screen.findByText("Bus 1")).toBeInTheDocument();
    expect(screen.getByText(/KA01AB1234/)).toBeInTheDocument();
    expect(screen.getByText("Vehicle documents expired")).toBeInTheDocument();
    expect(screen.getAllByText("R1 · Whitefield Loop")).toHaveLength(2);
    expect(screen.getByRole("link", { name: /drop-off at 3:30 PM, scheduled/i })).toBeInTheDocument();
    expect(screen.getByText("Transport office · +91 98450 11223")).toBeInTheDocument();
    expect(screen.getByText("GPS off")).toBeInTheDocument();
  });

  it("shows a prominent continue card when a trip is in progress", async () => {
    server.use(http.get("/api/driver/home/", () => HttpResponse.json({ ...home, active_trip: { ...home.trips[1], status: "IN_PROGRESS", is_active: true, stops: [], students: [], events: [], route_path: [] } })));
    renderHome();
    expect(await screen.findByRole("button", { name: /continue trip/i })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Trip in progress" })).toBeInTheDocument();
  });

  it("shows an error state with retry when the API fails", async () => {
    server.use(http.get("/api/driver/home/", () => HttpResponse.json({ detail: "Your staff profile is inactive.", code: "permission_denied" }, { status: 403 })));
    renderHome();
    expect(await screen.findByText("Could not load data")).toBeInTheDocument();
    expect(screen.getByText("Your staff profile is inactive.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});
