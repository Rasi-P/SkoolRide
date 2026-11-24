import { Button, Tag, Typography } from "antd";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { fmtDistance, fmtTime, minutesUntil } from "@/lib/format";
import type { TripDetail, TripStop } from "@/types";
import { useConfirm } from "../confirm";

interface Props {
  trip: TripDetail;
  currentStopId: string | null;
  busyStopId?: string | null;
  readOnly?: boolean;
  onArrive?: (stop: TripStop) => void;
  onDepart?: (stop: TripStop) => void;
}

export function currentStopOf(trip: TripDetail): TripStop | null {
  const sorted = [...trip.stops].sort((a, b) => a.sequence - b.sequence);
  return sorted.find((s) => s.status === "ARRIVED") ?? sorted.find((s) => s.status === "PENDING") ?? null;
}

export function StopsList({ trip, currentStopId, busyStopId, readOnly, onArrive, onDepart }: Props) {
  const confirm = useConfirm();
  const sorted = [...trip.stops].sort((a, b) => a.sequence - b.sequence);
  const pickup = trip.direction === "PICKUP";
  const expectedNotBoardedAt = (stop: TripStop) => trip.students.filter((s) => s.trip_stop === stop.id && s.status === "EXPECTED").length;

  const depart = (stop: TripStop) => {
    const pending = pickup ? expectedNotBoardedAt(stop) : 0;
    if (pending > 0) {
      confirm({
        title: `Depart ${stop.name}?`,
        content: `${pending} student${pending === 1 ? "" : "s"} not boarded will be marked no-show and their parents notified.`,
        okText: "Yes, depart",
        danger: true,
        onOk: () => onDepart?.(stop),
      });
    } else onDepart?.(stop);
  };

  const arriveLater = (stop: TripStop) =>
    confirm({
      title: `Arrived at ${stop.name}?`,
      content: "Earlier stops that were not visited will be marked as skipped.",
      okText: "Yes, arrived here",
      onOk: () => onArrive?.(stop),
    });

  return (
    <div className="sbp-surface" style={{ padding: "4px 14px" }} role="list" aria-label="Stops">
      {sorted.map((stop) => {
        const isCurrent = stop.id === currentStopId;
        const dotClass = stop.status === "DEPARTED" ? "done" : stop.status === "ARRIVED" ? "current" : stop.status === "SKIPPED" ? "skipped" : isCurrent ? "current" : "";
        const eta = stop.status === "PENDING" && stop.eta ? minutesUntil(stop.eta) : null;
        const counts = pickup ? `${stop.boarded_count ?? 0}/${stop.expected_count ?? 0} boarded` : `${stop.boarded_count ?? 0}/${stop.expected_count ?? 0} dropped`;
        return (
          <div key={stop.id} className="sbp-timeline-stop" role="listitem" aria-current={isCurrent ? "step" : undefined} style={{ gridTemplateColumns: "28px 1fr" }}>
            <div className={`sbp-dot ${dotClass}`} aria-hidden />
            <div>
              <div className="sbp-between" style={{ alignItems: "flex-start" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: isCurrent ? 700 : 600, fontSize: 15 }}>
                    {stop.sequence}. {stop.name}
                    {stop.is_school_stop && <Tag style={{ marginInlineStart: 6 }}>School</Tag>}
                  </div>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {stop.planned_time ? `Planned ${fmtTime(stop.planned_time)}` : "No planned time"}
                    {stop.status === "PENDING" && eta !== null && ` · ETA ${eta} min`}
                    {stop.status === "PENDING" && stop.distance_remaining_m !== null && ` · ${fmtDistance(stop.distance_remaining_m)}`}
                    {stop.arrived_at && ` · Arrived ${fmtTime(stop.arrived_at)}`}
                    {stop.departed_at && ` · Departed ${fmtTime(stop.departed_at)}`}
                    {(stop.expected_count ?? 0) > 0 && ` · ${counts}`}
                  </Typography.Text>
                </div>
                <StatusBadge status={stop.status} />
              </div>
              {!readOnly && trip.status === "IN_PROGRESS" && (
                <div style={{ marginTop: 8 }}>
                  {isCurrent && stop.status === "PENDING" && (
                    <Button type="primary" block className="sbp-touch-btn" loading={busyStopId === stop.id} onClick={() => onArrive?.(stop)}>
                      Arrived at {stop.name}
                    </Button>
                  )}
                  {isCurrent && stop.status === "ARRIVED" && (
                    <Button type="primary" block className="sbp-touch-btn" loading={busyStopId === stop.id} onClick={() => depart(stop)}>
                      Departed {stop.name}
                    </Button>
                  )}
                  {!isCurrent && stop.status === "PENDING" && (
                    <Button size="small" type="link" style={{ paddingInline: 0 }} disabled={!!busyStopId} onClick={() => arriveLater(stop)}>
                      Skip ahead: arrived here
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
