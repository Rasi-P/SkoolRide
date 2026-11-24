/**
 * GPS sharing state for the driver area. A single tracker instance lives here (at the driver routes root)
 * so its status survives navigation between tabs. The tracker is enabled only while:
 *   - a trip is attached and IN_PROGRESS,
 *   - the driver toggled sharing on for that trip (remembered per trip in sessionStorage so a reload mid-trip resumes),
 *   - the development GPS simulator is not running for that trip (the two feeds must not mix).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useGeolocationTracker, type GpsSample, type GpsStatus } from "@/hooks/useGeolocationTracker";
import type { TripStatus } from "@/types";

const SHARING_KEY = "sbp.driver.gps.sharingTrip";

export interface AttachableTrip {
  id: string;
  status: TripStatus;
}

export interface GpsContextValue {
  canShare: boolean;
  tripId: string | null;
  tripStatus: TripStatus | null;
  /** Driver toggled sharing on for the attached trip. */
  sharing: boolean;
  /** Development simulator is feeding this trip; real GPS is suspended. */
  simulatorActive: boolean;
  /** The tracker is actually watching and posting. */
  enabled: boolean;
  status: GpsStatus;
  lastSample: GpsSample | null;
  lastSentAt: number | null;
  sentCount: number;
  lastError: string | null;
  hidden: boolean;
  intervalSeconds: number;
  /** Timestamp (ms) of the last attach, used to ignore stale "no active trip" responses. */
  attachedAt: number;
  attachTrip: (trip: AttachableTrip | null) => void;
  /** Attach and turn sharing on in one step (used right after "Start trip"). */
  startSharing: (trip: AttachableTrip) => void;
  setSharing: (on: boolean) => void;
  setSimulatorActive: (tripId: string, on: boolean) => void;
  setIntervalSeconds: (seconds: number) => void;
  sendNow: () => Promise<void>;
}

const GpsContext = createContext<GpsContextValue | null>(null);

function readSharingTrip(): string | null {
  try {
    return sessionStorage.getItem(SHARING_KEY);
  } catch {
    return null;
  }
}

function writeSharingTrip(tripId: string | null) {
  try {
    if (tripId) sessionStorage.setItem(SHARING_KEY, tripId);
    else sessionStorage.removeItem(SHARING_KEY);
  } catch {
    /* storage unavailable (private mode): sharing simply does not survive a reload */
  }
}

const ACTIVE: TripStatus[] = ["IN_PROGRESS", "PAUSED"];

export function GpsProvider({ children, defaultIntervalSeconds = 10, canShare = true }: { children: ReactNode; defaultIntervalSeconds?: number; canShare?: boolean }) {
  const [trip, setTrip] = useState<AttachableTrip | null>(null);
  const [sharingTrip, setSharingTrip] = useState<string | null>(() => readSharingTrip());
  const [simulatorTrip, setSimulatorTrip] = useState<string | null>(null);
  const [intervalSeconds, setIntervalSecondsState] = useState(defaultIntervalSeconds);
  const attachedAt = useRef(0);

  const tripId = trip?.id ?? null;
  const sharing = !!tripId && sharingTrip === tripId;
  const simulatorActive = !!tripId && simulatorTrip === tripId;
  const enabled = canShare && !!tripId && trip?.status === "IN_PROGRESS" && sharing && !simulatorActive;

  const tracker = useGeolocationTracker({ tripId: enabled ? tripId : null, enabled, intervalSeconds });

  const attachTrip = useCallback((next: AttachableTrip | null) => {
    attachedAt.current = Date.now();
    setTrip((current) => {
      if (!next) return null;
      if (current && current.id === next.id) return current.status === next.status ? current : next;
      // Never let a non-active trip (e.g. viewing tomorrow's schedule) displace the trip being tracked.
      if (current && ACTIVE.includes(current.status) && !ACTIVE.includes(next.status)) return current;
      return next;
    });
  }, []);

  const setSharing = useCallback(
    (on: boolean) => {
      const target = on && canShare ? tripId : null;
      setSharingTrip(target);
      writeSharingTrip(target);
    },
    [tripId, canShare],
  );

  const startSharing = useCallback((next: AttachableTrip) => {
    attachedAt.current = Date.now();
    setTrip(next);
    setSharingTrip(canShare ? next.id : null);
    writeSharingTrip(canShare ? next.id : null);
  }, [canShare]);

  const setSimulatorActive = useCallback((id: string, on: boolean) => {
    setSimulatorTrip((current) => (on ? id : current === id ? null : current));
  }, []);

  const setIntervalSeconds = useCallback((s: number) => setIntervalSecondsState(Math.max(3, Math.min(60, Math.round(s) || 10))), []);

  // Forget the per-trip sharing flag once the trip is over.
  useEffect(() => {
    if (trip && !ACTIVE.includes(trip.status) && trip.status !== "SCHEDULED" && sharingTrip === trip.id) {
      setSharingTrip(null);
      writeSharingTrip(null);
    }
  }, [trip, sharingTrip]);

  const value = useMemo<GpsContextValue>(
    () => ({
      canShare,
      tripId,
      tripStatus: trip?.status ?? null,
      sharing,
      simulatorActive,
      enabled,
      status: tracker.status,
      lastSample: tracker.lastSample,
      lastSentAt: tracker.lastSentAt,
      sentCount: tracker.sentCount,
      lastError: tracker.lastError,
      hidden: tracker.hidden,
      intervalSeconds,
      attachedAt: attachedAt.current,
      attachTrip,
      startSharing,
      setSharing,
      setSimulatorActive,
      setIntervalSeconds,
      sendNow: tracker.sendNow,
    }),
    [canShare, tripId, trip?.status, sharing, simulatorActive, enabled, tracker.status, tracker.lastSample, tracker.lastSentAt, tracker.sentCount, tracker.lastError, tracker.hidden, tracker.sendNow, intervalSeconds, attachTrip, startSharing, setSharing, setSimulatorActive, setIntervalSeconds],
  );
  return <GpsContext.Provider value={value}>{children}</GpsContext.Provider>;
}

export function useGps(): GpsContextValue {
  const ctx = useContext(GpsContext);
  if (!ctx) throw new Error("useGps must be used within GpsProvider (driver routes root)");
  return ctx;
}

export type GpsChip = { tone: "success" | "warning" | "danger" | "neutral" | "info"; label: string; detail: string };

/** One place that turns tracker state into driver-facing wording (used by the header dot, chips and cards). */
export function describeGps(g: Pick<GpsContextValue, "enabled" | "sharing" | "simulatorActive" | "status" | "lastSentAt" | "intervalSeconds" | "tripId" | "tripStatus" | "lastError" | "hidden"> & { canShare?: boolean }, now = Date.now()): GpsChip {
  if (g.canShare === false) return { tone: "neutral", label: "Driver GPS", detail: "Location is shared by the assigned driver. This attendant account can record boarding and drop-off events." };
  if (g.simulatorActive) return { tone: "warning", label: "Simulated", detail: "The development GPS simulator is feeding this trip. Real location sharing from this device is paused." };
  if (!g.tripId || !g.tripStatus || !["IN_PROGRESS", "PAUSED"].includes(g.tripStatus)) return { tone: "neutral", label: "GPS off", detail: "Location sharing starts automatically when you start a trip." };
  if (g.tripStatus === "PAUSED") return { tone: "neutral", label: "Paused", detail: "The trip is paused, so no locations are sent. Resume the trip to continue sharing." };
  if (!g.sharing) return { tone: "neutral", label: "GPS off", detail: "Location sharing is switched off. Parents cannot see the bus until you turn it on." };
  switch (g.status) {
    case "denied":
      return { tone: "danger", label: "GPS denied", detail: "Location permission is blocked. Open your browser's site settings for this app, allow Location, then reload this page." };
    case "unsupported":
      return { tone: "danger", label: "No GPS", detail: "This browser does not support location. Use a recent Chrome, Safari or Firefox on a phone with GPS." };
    case "insecure":
      return { tone: "danger", label: "Insecure", detail: "Location only works over HTTPS (or localhost). Open the app from its secure address." };
    case "error":
      return { tone: "danger", label: "GPS error", detail: g.lastError || "The device could not get a position. Move to open sky and keep the app in the foreground." };
    case "poor_accuracy":
      return { tone: "warning", label: "Poor accuracy", detail: "The position fix is too imprecise to send (over 250 m). Waiting for a better signal; move away from buildings if possible." };
    case "requesting":
      return { tone: "info", label: "Requesting", detail: "Waiting for location permission and the first GPS fix. If a prompt appears, tap Allow." };
    case "active": {
      if (g.hidden) return { tone: "warning", label: "Background", detail: "The app is in the background; mobile browsers may pause tracking. Bring it back to the foreground and keep the screen on." };
      const stale = g.lastSentAt !== null && now - g.lastSentAt > Math.max(30_000, g.intervalSeconds * 3000);
      if (g.lastSentAt === null) return { tone: "info", label: "Sending", detail: g.lastError ? `Last send failed: ${g.lastError}` : "Position acquired; sending the first update." };
      if (stale || g.lastError) return { tone: "warning", label: "Stale", detail: g.lastError ? `Last send failed: ${g.lastError}` : "No update has been sent for a while. Check your connection." };
      return { tone: "success", label: "GPS live", detail: "Your position is being shared with the school and parents." };
    }
    default:
      return { tone: "info", label: "Starting", detail: "Location sharing is starting." };
  }
}
