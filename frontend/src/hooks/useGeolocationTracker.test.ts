import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "@/test/server";
import { useGeolocationTracker } from "./useGeolocationTracker";

let position: PositionCallback;
const clearWatch = vi.fn();
beforeEach(() => {
  clearWatch.mockClear();
  vi.stubGlobal("isSecureContext", true);
  Object.defineProperty(navigator, "geolocation", { configurable: true, value: {
    watchPosition: vi.fn((callback: PositionCallback) => { position = callback; return 7; }), clearWatch,
  } });
});
afterEach(() => vi.unstubAllGlobals());

function fix() {
  act(() => position({ coords: { latitude: 12.97, longitude: 77.59, accuracy: 10, speed: 5, heading: 90 }, timestamp: Date.now() } as GeolocationPosition));
}

it("stops collecting and sending GPS after the server revokes trip access", async () => {
  let requests = 0;
  server.use(http.post("*/api/driver/trips/trip/location/", () => {
    requests += 1;
    return HttpResponse.json({ detail: "Trip access revoked.", code: "permission_denied" }, { status: 403 });
  }));
  const { result, unmount } = renderHook(() => useGeolocationTracker({ tripId: "trip", enabled: true, intervalSeconds: 10 }));
  fix();
  await act(async () => result.current.sendNow());
  await waitFor(() => expect(clearWatch).toHaveBeenCalledWith(7));
  expect(result.current.status).toBe("error");
  expect(result.current.lastError).toContain("revoked");
  await act(async () => result.current.sendNow());
  expect(requests).toBe(1);
  unmount();
});

it("retains the GPS watch after a temporary network failure and stops it when disabled", async () => {
  server.use(http.post("*/api/driver/trips/trip/location/", () => HttpResponse.error()));
  const { result, rerender, unmount } = renderHook(({ enabled }) => useGeolocationTracker({ tripId: "trip", enabled, intervalSeconds: 10 }), { initialProps: { enabled: true } });
  fix();
  await act(async () => result.current.sendNow());
  expect(result.current.lastError).toBeTruthy();
  expect(clearWatch).not.toHaveBeenCalled();
  rerender({ enabled: false });
  expect(clearWatch).toHaveBeenCalledWith(7);
  expect(result.current.status).toBe("idle");
  unmount();
});
