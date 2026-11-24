/** Trip detail query + live updates (websocket + polling fallback) + typed mutations for the driver trip page. */
import { useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { App } from "antd";
import { errorMessage } from "@/api/client";
import { useSocket } from "@/hooks/useSocket";
import type { TripDetail, TripStudent, WsMessage } from "@/types";
import { driverApi, driverKeys } from "../api";
import type { EmergencyInput, MarkStudentInput, StopAction, StudentAction, TripEventInput, TripLifecycleAction } from "../types";

function applyLocation(trip: TripDetail, payload: NonNullable<WsMessage["payload"]>): TripDetail {
  const loc = payload.location;
  if (!loc) return trip;
  const etas = new Map((payload.etas ?? []).map((e) => [e.trip_stop_id, e]));
  const stops = trip.stops.map((s) => {
    const e = etas.get(s.id);
    if (!e || s.status !== "PENDING") return s;
    return { ...s, eta: e.eta_at, distance_remaining_m: e.distance_m };
  });
  const nextPending = stops.find((s) => s.status === "PENDING");
  return {
    ...trip,
    stops,
    current_location: { ...loc, is_stale: false },
    last_location_at: loc.recorded_at,
    gps_stale: false,
    delay_minutes: typeof payload.delay_minutes === "number" ? payload.delay_minutes : trip.delay_minutes,
    next_stop: nextPending ? { id: nextPending.id, name: nextPending.name, sequence: nextPending.sequence, eta: nextPending.eta, planned_time: nextPending.planned_time, distance_remaining_m: nextPending.distance_remaining_m } : null,
  };
}

export function useDriverTrip(id: string) {
  const qc = useQueryClient();
  const key = useMemo(() => driverKeys.trip(id), [id]);
  const query = useQuery({
    queryKey: key,
    queryFn: () => driverApi.trip(id),
    refetchInterval: (q) => (q.state.data?.is_active ? 30_000 : false),
  });
  const setTrip = useCallback((t: TripDetail) => qc.setQueryData(key, t), [qc, key]);
  const refresh = useCallback(() => qc.invalidateQueries({ queryKey: key }), [qc, key]);
  const active = query.data?.is_active ?? false;

  const socket = useSocket(active ? `/ws/trips/${id}/` : null, (msg) => {
    if (msg.trip_id && msg.trip_id !== id) return;
    if (msg.event === "location" && msg.payload?.location) {
      qc.setQueryData<TripDetail>(key, (old) => (old ? applyLocation(old, msg.payload!) : old));
    } else if (["stop", "student", "status", "event", "emergency", "stale", "snapshot"].includes(msg.event)) {
      refresh();
    }
  });

  return { query, trip: query.data, setTrip, refresh, socket };
}

export function useTripMutations(id: string, setTrip: (t: TripDetail) => void, refresh: () => void) {
  const qc = useQueryClient();
  const { message } = App.useApp();
  const key = driverKeys.trip(id);
  const fail = (e: unknown) => message.error(errorMessage(e));
  const invalidateLists = () => {
    qc.invalidateQueries({ queryKey: driverKeys.home });
    qc.invalidateQueries({ queryKey: ["driver", "trips"] });
  };

  const lifecycle = useMutation({
    mutationFn: ({ action, body }: { action: TripLifecycleAction; body?: Record<string, unknown> }) => driverApi.tripAction(id, action, body),
    onSuccess: (t) => {
      setTrip(t);
      invalidateLists();
    },
    onError: fail,
  });

  const stop = useMutation({
    mutationFn: ({ stopId, action }: { stopId: string; action: StopAction }) => driverApi.stopAction(id, stopId, action),
    onSuccess: (t) => {
      setTrip(t);
      invalidateLists();
    },
    onError: fail,
  });

  const student = useMutation({
    mutationFn: ({ studentId, action, body }: { studentId: string; action: StudentAction; body?: MarkStudentInput }) => driverApi.studentAction(id, studentId, action, body),
    onSuccess: (s: TripStudent) => {
      qc.setQueryData<TripDetail>(key, (old) => (old ? { ...old, students: old.students.map((x) => (x.id === s.id ? s : x)) } : old));
      refresh(); // counts and stop tallies come from the server
      invalidateLists();
    },
    onError: fail,
  });

  const event = useMutation({
    mutationFn: (body: TripEventInput) => driverApi.addEvent(id, body),
    onSuccess: (_e, body) => {
      refresh();
      invalidateLists();
      message.success(body.event_type === "DELAY" ? "Delay reported; parents have been notified." : body.event_type === "BREAKDOWN" ? "Breakdown reported to the transport office." : "Note added to the trip.");
    },
    onError: fail,
  });

  const emergency = useMutation({
    mutationFn: (body: EmergencyInput) => driverApi.emergency(id, body),
    onSuccess: () => {
      refresh();
      qc.invalidateQueries({ queryKey: driverKeys.incidents });
      message.warning({ content: "Emergency alert sent. The transport office has been notified.", duration: 6 });
    },
    onError: fail,
  });

  return { lifecycle, stop, student, event, emergency };
}
