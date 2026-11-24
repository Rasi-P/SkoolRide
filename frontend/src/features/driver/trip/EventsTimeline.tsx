import { Typography } from "antd";
import { fmtTime, titleCase } from "@/lib/format";
import type { TripEvent } from "@/types";

const COLOUR: Record<string, string> = { STARTED: "#15803d", COMPLETED: "#15803d", RESUMED: "#15803d", STOP_ARRIVED: "#0369a1", STOP_DEPARTED: "#0369a1", PAUSED: "#b45309", DELAY: "#b45309", BREAKDOWN: "#b91c1c", EMERGENCY: "#b91c1c", CANCELLED: "#b91c1c", GPS_STALE: "#64748b", REPLACEMENT: "#b45309", NOTE: "#475569" };

export function EventsTimeline({ events }: { events: TripEvent[] }) {
  if (events.length === 0) return <div className="sbp-surface" style={{ padding: 16 }}><Typography.Text type="secondary">No events recorded yet.</Typography.Text></div>;
  const sorted = [...events].sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1));
  return (
    <div className="sbp-surface" style={{ padding: "4px 14px" }} role="list" aria-label="Trip events">
      {sorted.map((e) => {
        const minutes = (e.data as { minutes?: number } | undefined)?.minutes;
        return (
          <div key={e.id} className="sbp-timeline-stop" role="listitem" style={{ gridTemplateColumns: "12px 1fr auto" }}>
            <span aria-hidden style={{ width: 10, height: 10, borderRadius: "50%", background: COLOUR[e.event_type] ?? "#475569", marginTop: 5 }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>
                {titleCase(e.event_type)}
                {typeof minutes === "number" && ` · ${minutes} min`}
              </div>
              {e.description && <Typography.Text type="secondary" style={{ fontSize: 13 }}>{e.description}</Typography.Text>}
              {e.created_by_name && <div className="sbp-muted" style={{ fontSize: 12 }}>by {e.created_by_name}</div>}
            </div>
            <span className="sbp-mono sbp-muted" style={{ fontSize: 12, whiteSpace: "nowrap" }}>{fmtTime(e.occurred_at)}</span>
          </div>
        );
      })}
    </div>
  );
}
