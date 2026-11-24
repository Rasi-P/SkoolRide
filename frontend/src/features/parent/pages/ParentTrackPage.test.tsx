import { screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { server } from "@/test/server";
import { renderWithProviders } from "@/test/utils";
import { ParentProvider } from "../context";
import { applyWsEvent } from "../hooks/useLiveTrip";
import { LOCATION, TRIP, baseHandlers, homePayload, livePayload } from "../test/fixtures";
import ParentTrackPage from "./ParentTrackPage";

vi.mock("@/hooks/useSocket", () => ({ useSocket: () => "open" }));
vi.mock("@/components/map/BusMap", () => ({ BusMap: () => <div data-testid="bus-map" /> }));

function renderTrack() {
  return renderWithProviders(
    <ParentProvider>
      <ParentTrackPage />
    </ParentProvider>,
    { route: "/parent/track" },
  );
}

describe("ParentTrackPage", () => {
  it("shows the STALE banner when the live payload reports a lost GPS signal", async () => {
    const old = new Date(Date.now() - 6 * 60_000).toISOString();
    server.use(
      ...baseHandlers,
      http.get("/api/parent/home/", () => HttpResponse.json(homePayload())),
      http.get("/api/parent/children/:id/live/", () =>
        HttpResponse.json(livePayload({ trip: { ...TRIP, status: "IN_PROGRESS", started_at: old }, location: { ...LOCATION, recorded_at: old }, last_location_at: old, stale: true })),
      ),
    );
    renderTrack();
    expect(await screen.findByText("GPS signal lost")).toBeInTheDocument();
    expect(screen.getByText(/has not sent its position for 6 min ago/)).toBeInTheDocument();
    expect(screen.queryByText("LIVE")).not.toBeInTheDocument();
    expect(screen.getByText("SIMULATED GPS feed")).toBeInTheDocument();
    expect(screen.getByTestId("bus-map")).toBeInTheDocument();
  });

  it("shows minutes to the child's stop from the server ETA", async () => {
    const etaAt = new Date(Date.now() + 5 * 60_000).toISOString();
    server.use(
      ...baseHandlers,
      http.get("/api/parent/home/", () => HttpResponse.json(homePayload())),
      http.get("/api/parent/children/:id/live/", () =>
        HttpResponse.json(livePayload({ trip: { ...TRIP, status: "IN_PROGRESS", is_simulated: false }, location: { ...LOCATION, is_simulated: false }, last_location_at: LOCATION.recorded_at, stale: false, eta: { eta_at: etaAt, seconds: 300, minutes: 5, distance_m: 1200 } })),
      ),
    );
    renderTrack();
    expect(await screen.findByText("Bus is 5 min from Kadugodi Bus Stand")).toBeInTheDocument();
    expect(screen.getByText("LIVE")).toBeInTheDocument();
    expect(screen.queryByText("GPS signal lost")).not.toBeInTheDocument();
    expect(screen.getByText("min to your stop")).toBeInTheDocument();
  });

  it("applies websocket location, stop and student events only to the child's own row", () => {
    const base = livePayload({ trip: { ...TRIP, status: "IN_PROGRESS" } });
    const etaAt = new Date(Date.now() + 4 * 60_000).toISOString();
    const afterLocation = applyWsEvent(base, {
      event: "location",
      trip_id: "t1",
      payload: { location: LOCATION, etas: [{ trip_stop_id: "ts-1", sequence: 1, distance_m: 900, seconds: 240, eta_at: etaAt, passed: false }], delay_minutes: 2 },
    });
    expect(afterLocation.location).toEqual(LOCATION);
    expect(afterLocation.eta?.minutes).toBe(4);
    expect(afterLocation.stops[0].eta).toBe(etaAt);
    expect(afterLocation.trip?.delay_minutes).toBe(2);

    const otherStudent = applyWsEvent(afterLocation, { event: "student", trip_id: "t1", payload: { trip_student_id: "someone-else", status: "BOARDED" } });
    expect(otherStudent.trip_student?.status).toBe("EXPECTED");

    const arrived = applyWsEvent(otherStudent, { event: "stop", trip_id: "t1", payload: { trip_stop_id: "ts-1", status: "ARRIVED", arrived_at: new Date().toISOString() } });
    expect(arrived.trip_student?.stop?.status).toBe("ARRIVED");
    expect(arrived.eta).toBeNull();

    const boarded = applyWsEvent(arrived, { event: "student", trip_id: "t1", payload: { trip_student_id: "tstu-1", status: "BOARDED", occurred_at: "2026-10-22T01:25:00Z" } });
    expect(boarded.trip_student?.status).toBe("BOARDED");
    expect(boarded.trip_student?.boarded_at).toBe("2026-10-22T01:25:00Z");

    const stale = applyWsEvent(boarded, { event: "stale", trip_id: "t1", payload: { stale: true, last_location_at: "2026-10-22T01:20:00Z", age_seconds: 300 } });
    expect(stale.stale).toBe(true);
  });
});
