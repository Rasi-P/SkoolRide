import { Tag } from "antd";
import { BankOutlined } from "@ant-design/icons";
import { fmtTime } from "@/lib/format";
import { etaDeltaMinutes } from "../lib";

export interface TimelineStop {
  id: string;
  name: string;
  sequence: number;
  planned_time: string | null;
  eta: string | null;
  status: string;
  arrived_at: string | null;
  departed_at: string | null;
  is_school_stop?: boolean;
}

interface Props {
  stops: TimelineStop[];
  myStopId?: string | null;
  nextStopId?: string | null;
  tripActive: boolean;
  tripDate?: string | null;
  timezone?: string | null;
}

/** Vertical list of a trip's stops with status dots, planned time vs live ETA and the child's stop highlighted. */
export function StopsTimeline({ stops, myStopId, nextStopId, tripActive, tripDate, timezone }: Props) {
  if (stops.length === 0) return <div className="sbp-muted">No stops on this trip.</div>;
  return (
    <ol style={{ listStyle: "none", margin: 0, padding: 0 }} aria-label="Stops">
      {stops.map((s) => {
        const done = s.status === "DEPARTED" || s.status === "ARRIVED";
        const current = tripActive && s.id === nextStopId;
        const dotClass = s.status === "SKIPPED" ? "skipped" : done ? "done" : current ? "current" : "";
        const mine = s.id === myStopId;
        const delta = s.status === "PENDING" ? etaDeltaMinutes(tripDate, s.planned_time, s.eta, timezone) : null;
        let detail: string;
        if (s.status === "DEPARTED") detail = `Departed ${fmtTime(s.departed_at)}`;
        else if (s.status === "ARRIVED") detail = `Arrived ${fmtTime(s.arrived_at)}`;
        else if (s.status === "SKIPPED") detail = "Skipped";
        else if (s.eta && tripActive) detail = `ETA ${fmtTime(s.eta)}${delta !== null && Math.abs(delta) >= 2 ? (delta > 0 ? ` (+${delta} min)` : ` (${delta} min)`) : ""}`;
        else detail = tripActive ? "ETA pending" : "Not started";
        return (
          <li
            key={s.id}
            className="sbp-timeline-stop"
            aria-current={mine ? "location" : undefined}
            style={mine ? { background: "#fff7ed", margin: "0 -8px", padding: "10px 8px", borderRadius: 10 } : undefined}
          >
            <div className={`sbp-dot ${dotClass}`} aria-hidden />
            <div style={{ minWidth: 0 }}>
              <div className="sbp-row" style={{ fontWeight: mine ? 700 : 500, flexWrap: "wrap" }}>
                {s.is_school_stop && <BankOutlined aria-label="School" />}
                <span>
                  {s.sequence}. {s.name}
                </span>
                {mine && (
                  <Tag color="orange" style={{ marginInlineEnd: 0 }}>
                    Your stop
                  </Tag>
                )}
              </div>
              <div style={{ fontSize: 12, color: delta !== null && delta >= 2 ? "var(--sbp-warning)" : "var(--sbp-text-muted)" }}>{detail}</div>
            </div>
            <div className="sbp-mono" style={{ textAlign: "right", fontSize: 13 }}>
              <div className="sbp-muted" style={{ fontSize: 11 }}>
                Planned
              </div>
              {fmtTime(s.planned_time)}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
