/** Small pure helpers shared by the parent pages. */
import { dayjs, fmtDistance, fmtTime, fromNow } from "@/lib/format";
import type { Eta, LivePayload } from "./types";

export function isTripActive(status: string | null | undefined): boolean {
  return status === "IN_PROGRESS" || status === "PAUSED";
}

/** A trip we should keep a live socket open for (it may still start or is running). */
export function isTripOpen(status: string | null | undefined): boolean {
  return status === "SCHEDULED" || isTripActive(status);
}

/** Minutes until the ETA, recomputed locally from eta_at so the countdown keeps moving between server refreshes. */
export function minutesFromEta(eta: Eta | null | undefined, now: number): number | null {
  if (!eta) return null;
  if (!eta.eta_at) return eta.minutes ?? null;
  return Math.max(0, Math.round((dayjs(eta.eta_at).valueOf() - now) / 60_000));
}

export function ageSeconds(iso: string | null | undefined, now: number): number | null {
  if (!iso) return null;
  return Math.max(0, Math.round((now - dayjs(iso).valueOf()) / 1000));
}

export function fmtAge(seconds: number | null, iso?: string | null): string {
  if (seconds === null) return "never";
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
  return fromNow(iso ?? null);
}

export function greeting(date = new Date()): string {
  const h = date.getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^+\d]/g, "")}`;
}

export function todayIso(): string {
  return dayjs().format("YYYY-MM-DD");
}

/** Minutes the ETA is behind (+) or ahead (-) of the planned time at a stop, in the school's timezone. */
export function etaDeltaMinutes(date: string | null | undefined, planned: string | null | undefined, eta: string | null | undefined, tz?: string | null): number | null {
  if (!date || !planned || !eta) return null;
  const plannedAt = tz ? dayjs.tz(`${date}T${planned}`, tz) : dayjs(`${date}T${planned}`);
  const etaAt = dayjs(eta);
  if (!plannedAt.isValid() || !etaAt.isValid()) return null;
  return Math.round((etaAt.valueOf() - plannedAt.valueOf()) / 60_000);
}

export function sum(values: (string | number | null | undefined)[]): number {
  return values.reduce<number>((acc, v) => acc + (v === null || v === undefined || v === "" ? 0 : Number(v) || 0), 0);
}

export type HeadlineTone = "primary" | "success" | "warning" | "danger" | "neutral";

export interface Headline {
  title: string;
  detail?: string;
  tone: HeadlineTone;
}

/** The one-line status a parent cares about, derived from trip status, their child's row and the ETA to their stop. */
export function describeLive(live: LivePayload, now: number): Headline {
  const trip = live.trip;
  const ts = live.trip_student;
  const stop = ts?.stop;
  const first = live.student?.first_name || "Your child";
  if (!trip) {
    return { title: "No trip today", detail: live.assignment ? "There is no bus trip scheduled for today." : `${first} has no transport assignment yet.`, tone: "neutral" };
  }
  const stopName = stop?.name ?? "your stop";
  if (trip.status === "SCHEDULED") {
    return {
      title: "Not started yet",
      detail: `Bus leaves at ${fmtTime(trip.scheduled_start_time)}${stop?.planned_time ? ` · planned at ${stopName} ${fmtTime(stop.planned_time)}` : ""}`,
      tone: "neutral",
    };
  }
  if (trip.status === "CANCELLED") return { title: "Trip cancelled", detail: trip.cancelled_reason || "The school cancelled this trip.", tone: "danger" };
  if (trip.status === "COMPLETED") {
    if (ts?.status === "DROPPED") return { title: trip.direction === "PICKUP" ? "Arrived at school" : `Dropped off at ${stopName}`, detail: `Dropped off ${fmtTime(ts.dropped_at)}`, tone: "success" };
    if (ts?.status === "NO_SHOW") return { title: "Did not board", detail: `${first} was not at ${stopName} when the bus left.`, tone: "warning" };
    if (ts?.status === "ABSENT") return { title: "Trip completed", detail: `${first} was marked absent for this trip.`, tone: "neutral" };
    return { title: "Trip completed", detail: `Ended ${fmtTime(trip.ended_at)}`, tone: "success" };
  }
  // IN_PROGRESS or PAUSED
  if (ts?.status === "ABSENT") return { title: "Marked absent for this trip", detail: `The bus will not stop for ${first} today.`, tone: "neutral" };
  if (ts?.status === "DROPPED") return { title: trip.direction === "PICKUP" ? "Arrived at school" : `Dropped off at ${stopName}`, detail: `Dropped off ${fmtTime(ts.dropped_at)}`, tone: "success" };
  if (ts?.status === "NO_SHOW") return { title: `Bus has left ${stopName}`, detail: `${first} was marked as not boarded. Contact the school if this is wrong.`, tone: "warning" };
  if (ts?.status === "BOARDED") {
    return {
      title: `Boarding recorded for ${first}`,
      detail: `Recorded ${fmtTime(ts.boarded_at)}. This attendance event does not confirm your child's current location.`,
      tone: "success",
    };
  }
  if (trip.status === "PAUSED") return { title: "Trip paused", detail: "The bus has stopped for a moment. Tracking continues when it moves again.", tone: "warning" };
  if (stop?.status === "ARRIVED") return { title: `Bus is at ${stopName}`, detail: "Please be at the stop now.", tone: "success" };
  if (stop?.status === "DEPARTED") return { title: `Bus has left ${stopName}`, detail: "Contact the school if your child missed the bus.", tone: "warning" };
  if (stop?.status === "SKIPPED") return { title: `${stopName} was skipped`, detail: "Contact the transport office for details.", tone: "warning" };
  const mins = minutesFromEta(live.eta, now);
  if (mins !== null && live.eta) {
    return {
      title: mins <= 1 ? "Bus is arriving now" : `Bus is ${mins} min from ${stopName}`,
      detail: `${live.eta.distance_m !== null && live.eta.distance_m !== undefined ? `${fmtDistance(live.eta.distance_m)} away · ` : ""}ETA ${fmtTime(live.eta.eta_at)}`,
      tone: "primary",
    };
  }
  return { title: "Bus is on its way", detail: live.location ? "Working out the arrival time at your stop…" : "Waiting for the first GPS update from the bus.", tone: "primary" };
}
