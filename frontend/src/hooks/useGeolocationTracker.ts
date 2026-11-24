/**
 * Driver GPS sharing. Uses the browser Geolocation API (explicit permission, secure context) and posts a
 * sample to the backend at a configurable interval while enabled. Handles permission denial, poor accuracy,
 * offline periods and page visibility changes. Browsers suspend timers/geolocation in background tabs on
 * most mobile platforms: this is documented in docs/GPS_TRACKING.md and surfaced as a warning in the UI.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import { api, errorMessage } from "@/api/client";

export type GpsStatus = "idle" | "requesting" | "active" | "denied" | "unsupported" | "insecure" | "error" | "poor_accuracy" | "paused";

export interface GpsSample {
  latitude: number;
  longitude: number;
  accuracy_m: number | null;
  speed_mps: number | null;
  heading: number | null;
  recorded_at: string;
}

interface Options {
  tripId: string | null;
  enabled: boolean;
  intervalSeconds: number;
  maxAccuracy?: number;
  onSample?: (s: GpsSample, accepted: boolean) => void;
}

export function useGeolocationTracker({ tripId, enabled, intervalSeconds, maxAccuracy = 250, onSample }: Options) {
  const [status, setStatus] = useState<GpsStatus>("idle");
  const [lastSample, setLastSample] = useState<GpsSample | null>(null);
  const [lastSentAt, setLastSentAt] = useState<number | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [sentCount, setSentCount] = useState(0);
  const [blockedTrip, setBlockedTrip] = useState<string | null>(null);
  const [hidden, setHidden] = useState(document.visibilityState === "hidden");
  const latest = useRef<GpsSample | null>(null);
  const sending = useRef(false);

  useEffect(() => {
    const onVis = () => setHidden(document.visibilityState === "hidden");
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // Watch position while enabled.
  useEffect(() => {
    if (!enabled || !tripId) {
      latest.current = null;
      setStatus("idle");
      return;
    }
    if (blockedTrip === tripId) {
      latest.current = null;
      setStatus("error");
      return;
    }
    if (!("geolocation" in navigator)) {
      setStatus("unsupported");
      return;
    }
    if (!window.isSecureContext) {
      setStatus("insecure");
      return;
    }
    setStatus("requesting");
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const s: GpsSample = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy_m: pos.coords.accuracy ?? null,
          speed_mps: pos.coords.speed ?? null,
          heading: Number.isFinite(pos.coords.heading as number) ? pos.coords.heading : null,
          recorded_at: new Date(pos.timestamp).toISOString(),
        };
        latest.current = s;
        setLastSample(s);
        setStatus(s.accuracy_m !== null && s.accuracy_m > maxAccuracy ? "poor_accuracy" : "active");
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) setStatus("denied");
        else {
          setStatus("error");
          setLastError(err.message);
        }
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [enabled, tripId, maxAccuracy, blockedTrip]);

  const send = useCallback(async () => {
    const s = latest.current;
    if (!enabled || !s || !tripId || blockedTrip === tripId || sending.current) return;
    if (s.accuracy_m !== null && s.accuracy_m > maxAccuracy) return;
    if (Date.now() - new Date(s.recorded_at).getTime() > 60_000) return; // stale fix
    sending.current = true;
    try {
      await api.post(`/driver/trips/${tripId}/location/`, s);
      setLastSentAt(Date.now());
      setSentCount((c) => c + 1);
      setLastError(null);
      onSample?.(s, true);
    } catch (e) {
      setLastError(errorMessage(e));
      if (axios.isAxiosError(e) && ([401, 403, 404].includes(e.response?.status ?? 0) || e.response?.data?.code === "invalid_transition")) {
        latest.current = null;
        setBlockedTrip(tripId);
        setStatus("error");
      }
      onSample?.(s, false);
    } finally {
      sending.current = false;
    }
  }, [enabled, tripId, blockedTrip, maxAccuracy, onSample]);

  // Interval sender.
  useEffect(() => {
    if (!enabled || !tripId || blockedTrip === tripId) return;
    const t = window.setInterval(send, Math.max(3, intervalSeconds) * 1000);
    const first = window.setTimeout(send, 1500);
    return () => {
      window.clearInterval(t);
      window.clearTimeout(first);
    };
  }, [enabled, tripId, blockedTrip, intervalSeconds, send]);

  return { status, lastSample, lastSentAt, lastError, sentCount, hidden, sendNow: send };
}
