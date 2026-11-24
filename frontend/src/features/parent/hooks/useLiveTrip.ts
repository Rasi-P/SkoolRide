/**
 * Live tracking state for one child: the server payload (polled every 20s, since ETAs are computed server-side)
 * with websocket events layered on top until the next refresh. Only the child's own trip_student is ever updated.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSocket } from "@/hooks/useSocket";
import type { WsMessage } from "@/types";
import { parentApi, qk } from "../api";
import { isTripActive, isTripOpen } from "../lib";
import type { Eta, LiveLocation, LivePayload, LiveStop, LiveTrip, LiveTripStudent } from "../types";

interface EtaEntry {
  trip_stop_id: string;
  sequence?: number;
  distance_m: number | null;
  seconds: number | null;
  eta_at: string | null;
  passed: boolean;
}

function etaFromEntry(e: EtaEntry): Eta | null {
  if (e.passed || !e.eta_at) return null;
  const seconds = e.seconds ?? Math.max(0, Math.round((new Date(e.eta_at).getTime() - Date.now()) / 1000));
  return { eta_at: e.eta_at, seconds, minutes: Math.max(0, Math.round(seconds / 60)), distance_m: e.distance_m };
}

/** Pure reducer: applies one websocket event to the live payload. Exported for tests. */
export function applyWsEvent(live: LivePayload, msg: WsMessage): LivePayload {
  const p = msg.payload as Record<string, unknown> | undefined;
  if (!p || !live.trip) return live;
  if (msg.trip_id && msg.trip_id !== live.trip.id) return live;
  switch (msg.event) {
    case "snapshot":
    case "status": {
      const trip: LiveTrip = { ...live.trip };
      if (typeof p.status === "string") trip.status = p.status as LiveTrip["status"];
      if (typeof p.delay_minutes === "number") trip.delay_minutes = p.delay_minutes;
      if (typeof p.started_at === "string") trip.started_at = p.started_at;
      if ("ended_at" in p) trip.ended_at = (p.ended_at as string | null) ?? null;
      if (typeof p.cancelled_reason === "string") trip.cancelled_reason = p.cancelled_reason;
      if (typeof p.is_simulated === "boolean") trip.is_simulated = p.is_simulated;
      if ("next_stop" in p) trip.next_stop = (p.next_stop as LiveTrip["next_stop"]) ?? null;
      const next: LivePayload = { ...live, trip };
      if ("location" in p) next.location = (p.location as LiveLocation | null) ?? null;
      if ("stale" in p) next.stale = (p.stale as boolean | null) ?? null;
      if (typeof p.last_location_at === "string") next.last_location_at = p.last_location_at;
      if (!isTripActive(trip.status)) {
        next.location = null;
        next.eta = null;
        next.stale = null;
      }
      return next;
    }
    case "location": {
      const loc = p.location as LiveLocation | undefined;
      const etas = (p.etas as EtaEntry[] | undefined) ?? [];
      const byStop = new Map(etas.map((e) => [e.trip_stop_id, e]));
      const stops = live.stops.map((s) => {
        const e = byStop.get(s.id);
        return e ? { ...s, eta: e.eta_at, distance_remaining_m: e.distance_m } : s;
      });
      let eta = live.eta;
      let tripStudent = live.trip_student;
      const myStop = tripStudent?.stop;
      const mine = myStop ? byStop.get(myStop.id) : undefined;
      if (mine && tripStudent && myStop) {
        eta = myStop.status === "PENDING" ? etaFromEntry(mine) : null;
        tripStudent = { ...tripStudent, stop: { ...myStop, eta: mine.eta_at } };
      }
      return {
        ...live,
        stops,
        eta,
        trip_student: tripStudent,
        location: loc ?? live.location,
        last_location_at: loc?.recorded_at ?? live.last_location_at,
        stale: p.stale === true,
        trip: typeof p.delay_minutes === "number" ? { ...live.trip, delay_minutes: p.delay_minutes } : live.trip,
      };
    }
    case "stop": {
      const id = String(p.trip_stop_id);
      const status = p.status as LiveStop["status"];
      const stops = live.stops.map((s) =>
        s.id === id
          ? { ...s, status, arrived_at: typeof p.arrived_at === "string" ? p.arrived_at : s.arrived_at, departed_at: typeof p.departed_at === "string" ? p.departed_at : s.departed_at }
          : s,
      );
      let tripStudent = live.trip_student;
      let eta = live.eta;
      if (tripStudent?.stop && tripStudent.stop.id === id) {
        tripStudent = { ...tripStudent, stop: { ...tripStudent.stop, status } };
        if (status !== "PENDING") eta = null;
      }
      const nextPending = stops.find((s) => s.status === "PENDING");
      const trip: LiveTrip = { ...live.trip, next_stop: nextPending ? { id: nextPending.id, name: nextPending.name, eta: nextPending.eta } : null };
      return { ...live, stops, trip_student: tripStudent, eta, trip };
    }
    case "student": {
      const ts = live.trip_student;
      if (!ts || p.trip_student_id !== ts.id) return live; // never touch other children's rows
      const status = p.status as LiveTripStudent["status"];
      const at = typeof p.occurred_at === "string" ? p.occurred_at : null;
      return {
        ...live,
        trip_student: { ...ts, status, boarded_at: status === "BOARDED" ? at : ts.boarded_at, dropped_at: status === "DROPPED" ? at : ts.dropped_at },
      };
    }
    case "stale":
      return { ...live, stale: true, eta: null, last_location_at: typeof p.last_location_at === "string" ? p.last_location_at : live.last_location_at };
    default:
      return live;
  }
}

export interface EmergencyNotice {
  tripId: string;
  title: string;
}

interface EventLog {
  base: LivePayload | undefined;
  list: WsMessage[];
}

export function useLiveTrip({ studentId, tripId }: { studentId: string | null; tripId: string | null }) {
  const query = useQuery({
    queryKey: qk.live(studentId, tripId),
    queryFn: () => parentApi.live(studentId as string, tripId),
    enabled: !!studentId,
    refetchInterval: 20_000,
    refetchIntervalInBackground: false,
  });
  const data = query.data;
  const { refetch } = query;
  // Websocket events are kept per server payload; a fresh payload supersedes everything received before it.
  const [log, setLog] = useState<EventLog>({ base: undefined, list: [] });
  const [emergency, setEmergency] = useState<EmergencyNotice | null>(null);

  const socketTripId = data?.trip && isTripOpen(data.trip.status) ? data.trip.id : null;
  const socketState = useSocket(socketTripId ? `/ws/trips/${socketTripId}/` : null, (msg) => {
    if (msg.event === "pong" || msg.event === "connected" || msg.event === "notification" || msg.event === "event") return;
    if (msg.event === "emergency") {
      const title = (msg.payload as { title?: string } | undefined)?.title;
      setEmergency({ tripId: msg.trip_id ?? socketTripId ?? "", title: title || "An incident was reported on this trip" });
      return;
    }
    setLog((prev) => ({ base: data, list: (prev.base === data ? prev.list : []).concat(msg) }));
    if (msg.event === "status") void refetch();
  });

  // Returning to the app after it was in the background: refresh immediately instead of waiting for the next poll.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void refetch();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refetch]);

  const live = useMemo(() => {
    if (!data) return undefined;
    const events = log.base === data ? log.list : [];
    return events.reduce(applyWsEvent, data);
  }, [data, log]);

  const activeEmergency = emergency && live?.trip && emergency.tripId === live.trip.id ? emergency : null;
  return { query, live, socketState, emergency: activeEmergency, socketTripId };
}
