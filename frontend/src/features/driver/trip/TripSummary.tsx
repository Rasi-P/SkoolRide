import { Alert, Typography } from "antd";
import { useQuery } from "@tanstack/react-query";
import { QueryState } from "@/components/ui/States";
import { StatCard } from "@/components/ui/StatCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { KeyValue } from "@/components/ui/Misc";
import { dayjs, fmtDateTime, fmtTime } from "@/lib/format";
import type { TripDetail } from "@/types";
import { driverApi, driverKeys } from "../api";
import type { BoardingEvent } from "../types";
import { EventsTimeline } from "./EventsTimeline";
import { StopsList } from "./StopsList";
import { TripMapSection } from "./TripMapSection";

function duration(start: string | null, end: string | null): string {
  if (!start || !end) return "-";
  const mins = Math.max(0, Math.round(dayjs(end).diff(dayjs(start), "minute")));
  return mins >= 60 ? `${Math.floor(mins / 60)} h ${mins % 60} min` : `${mins} min`;
}

/** Read-only view for completed and cancelled trips. */
export function TripSummary({ trip }: { trip: TripDetail }) {
  const boarding = useQuery({ queryKey: driverKeys.boardingEvents(trip.id), queryFn: () => driverApi.boardingEvents(trip.id) });
  const noShow = trip.students.filter((s) => s.status === "NO_SHOW").length;
  return (
    <div className="sbp-stack" style={{ gap: 16 }}>
      {trip.status === "CANCELLED" && <Alert type="error" showIcon message="Trip cancelled" description={trip.cancelled_reason || "No reason recorded."} />}
      <div className="sbp-grid sbp-grid-2" style={{ gap: 10 }}>
        <StatCard title="Expected" value={trip.expected_students} tone="neutral" />
        <StatCard title="Boarded" value={trip.boarded_count + trip.dropped_count} tone="success" />
        <StatCard title="Dropped off" value={trip.dropped_count} tone="info" />
        <StatCard title="Absent / no-show" value={trip.absent_count} tone={trip.absent_count > 0 ? "warning" : "neutral"} hint={noShow > 0 ? `${noShow} no-show` : undefined} />
      </div>
      <div className="sbp-surface" style={{ padding: 14 }}>
        <KeyValue
          items={[
            { label: "Started", value: fmtDateTime(trip.started_at) },
            { label: "Ended", value: fmtDateTime(trip.ended_at) },
            { label: "Duration", value: duration(trip.started_at, trip.ended_at) },
            { label: "Delay", value: trip.delay_minutes > 0 ? `${trip.delay_minutes} min` : "On time" },
            { label: "Vehicle", value: trip.vehicle_display_name ? `${trip.vehicle_display_name} (${trip.vehicle_registration})` : "-" },
            { label: "Driver", value: trip.driver_name },
            { label: "Attendant", value: trip.attendant_name },
            ...(trip.notes ? [{ label: "Notes", value: trip.notes }] : []),
          ]}
        />
      </div>
      <section>
        <h2 className="sbp-section-title">Stops</h2>
        <StopsList trip={trip} currentStopId={null} readOnly />
      </section>
      <section>
        <h2 className="sbp-section-title">Boarding record</h2>
        <QueryState query={boarding} rows={4} isEmpty={(d: BoardingEvent[]) => d.length === 0} emptyTitle="No boarding events" emptyDescription="Nobody was boarded or marked on this trip.">
          {(events) => (
            <div className="sbp-surface" style={{ padding: "4px 14px" }} role="list" aria-label="Boarding events">
              {events.map((e) => (
                <div key={e.id} className="sbp-between" role="listitem" style={{ padding: "10px 0", borderBottom: "1px solid var(--sbp-border)" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }}>{e.student_name} <span className="sbp-muted" style={{ fontWeight: 400, fontSize: 12 }}>{e.class_label}</span></div>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      {e.stop_name ?? "No stop"} · {fmtTime(e.occurred_at)}{e.note && ` · ${e.note}`}
                    </Typography.Text>
                  </div>
                  <StatusBadge status={e.event_type} />
                </div>
              ))}
            </div>
          )}
        </QueryState>
      </section>
      <section>
        <h2 className="sbp-section-title">Events</h2>
        <EventsTimeline events={trip.events} />
      </section>
      <TripMapSection trip={trip} currentStopId={null} />
    </div>
  );
}
