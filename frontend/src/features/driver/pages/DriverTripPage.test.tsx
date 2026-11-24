import { beforeEach, describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "@/test/server";
import { renderWithProviders } from "@/test/utils";
import type { TripDetail } from "@/types";
import { GpsProvider } from "../gps/GpsContext";
import { activePickupTrip, incidents, scheduledTrip } from "../__fixtures__/driver";
import DriverTripPage from "./DriverTripPage";

function renderTrip(id: string) {
  return renderWithProviders(
    <GpsProvider>
      <DriverTripPage />
    </GpsProvider>,
    { route: `/driver/trips/${id}`, path: "/driver/trips/:id" },
  );
}

describe("DriverTripPage", () => {
  let current: TripDetail;
  const calls: { url: string; body: unknown }[] = [];

  beforeEach(() => {
    calls.length = 0;
    server.use(
      http.get("/api/public/config/", () => HttpResponse.json({ demo_mode: false, vapid_public_key: null, driver_location_interval_seconds: 10, payment_gateway: "mock" })),
      http.get("/api/driver/trips/:id/", () => HttpResponse.json(current)),
      http.post("/api/driver/trips/:id/start/", async ({ request }) => {
        calls.push({ url: request.url, body: null });
        current = { ...current, status: "IN_PROGRESS", is_active: true, started_at: "2026-10-22T10:00:00Z" };
        return HttpResponse.json(current);
      }),
      http.post("/api/driver/trips/:id/students/:sid/board/", async ({ request, params }) => {
        calls.push({ url: request.url, body: await request.json() });
        const s = current.students.find((x) => x.id === params.sid)!;
        const updated = { ...s, status: "BOARDED" as const, boarded_at: "2026-10-22T01:25:00Z" };
        current = { ...current, boarded_count: 1, students: current.students.map((x) => (x.id === s.id ? updated : x)) };
        return HttpResponse.json(updated);
      }),
      http.post("/api/driver/trips/:id/emergency/", async ({ request }) => {
        calls.push({ url: request.url, body: await request.json() });
        return HttpResponse.json(incidents[0], { status: 201 });
      }),
    );
  });

  it("shows the start confirmation for a scheduled trip and starts it after confirming", async () => {
    current = scheduledTrip;
    const user = userEvent.setup();
    renderTrip(scheduledTrip.id);
    expect(await screen.findByText("Ready to start?")).toBeInTheDocument();
    expect(screen.getByText(/Bus 1 · KA01AB1234/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /start trip/i }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getAllByText("Start this trip?").length).toBeGreaterThan(0);
    expect(calls).toHaveLength(0);
    await user.click(within(dialog).getByRole("button", { name: "Yes, start trip" }));
    await waitFor(() => expect(calls.some((c) => c.url.endsWith(`/driver/trips/${scheduledTrip.id}/start/`))).toBe(true));
    expect(await screen.findByRole("button", { name: /end trip/i })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Trip controls" })).toBeInTheDocument();
  });

  it("boards a student and updates the status badge from the API response", async () => {
    current = activePickupTrip;
    const user = userEvent.setup();
    renderTrip(activePickupTrip.id);
    const board = await screen.findByRole("button", { name: "Board Aarav Sharma" });
    await user.click(board);
    await waitFor(() => expect(calls.some((c) => c.url.endsWith("/students/ts-1/board/"))).toBe(true));
    const row = await screen.findByRole("listitem", { name: /Aarav Sharma, boarded/i });
    expect(within(row).getByText("Boarded")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Board Aarav Sharma" })).not.toBeInTheDocument();
  });

  it("requires two confirmations before sending an emergency alert", async () => {
    current = activePickupTrip;
    const user = userEvent.setup();
    renderTrip(activePickupTrip.id);
    await user.click(await screen.findByRole("button", { name: /emergency/i }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Send emergency alert?")).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText(/what is happening/i), "Collision near Varthur");
    await user.click(within(dialog).getByRole("button", { name: /continue/i }));
    expect(within(dialog).getByText("Confirm emergency alert")).toBeInTheDocument();
    expect(calls.filter((c) => c.url.includes("/emergency/"))).toHaveLength(0);
    await user.click(within(dialog).getByRole("button", { name: /yes, send emergency alert/i }));
    await waitFor(() => expect(calls.filter((c) => c.url.includes("/emergency/"))).toHaveLength(1));
    expect(calls.find((c) => c.url.includes("/emergency/"))?.body).toMatchObject({ confirm: true, description: "Collision near Varthur" });
    await waitFor(() => expect(screen.queryByText("Confirm emergency alert")).not.toBeInTheDocument());
  });
});
