import { useState } from "react";
import { Segmented } from "antd";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { RightOutlined } from "@ant-design/icons";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState, LoadingSkeleton, QueryState } from "@/components/ui/States";
import { DirectionTag, StatusBadge } from "@/components/ui/StatusBadge";
import { fmtDate, fmtDateTime, fmtTime, titleCase } from "@/lib/format";
import { parentApi, qk } from "../api";
import { DelayTag, StudentStatusBadge } from "../components/Tags";
import { useParent } from "../context";
import { ATTENDANCE_EVENT_LABELS } from "../labels";
import type { AttendanceEvent, TripHistoryRow } from "../types";

type Tab = "trips" | "attendance";

export default function ParentTripsPage() {
  const { selectedId, selected, children, childrenQuery } = useParent();
  const [days, setDays] = useState(30);
  const [tab, setTab] = useState<Tab>("trips");
  const trips = useQuery({ queryKey: qk.trips(selectedId, days), queryFn: () => parentApi.trips(selectedId as string, days), enabled: !!selectedId && tab === "trips" });
  const attendance = useQuery({ queryKey: qk.attendance(selectedId, days), queryFn: () => parentApi.attendance(selectedId as string, days), enabled: !!selectedId && tab === "attendance" });
  if (childrenQuery.isLoading) return <LoadingSkeleton rows={8} />;
  if (children.length === 0) return <EmptyState title="No children linked" description="Trip history appears here once the school links your child to this account." />;
  return (
    <div className="sbp-stack">
      <PageHeader compact title="Trip history" subtitle={selected ? `${selected.name} · ${selected.class_label}` : undefined} crumbs={[{ label: "More", to: "/parent/more" }, { label: "Trip history" }]} />
      <Segmented block value={tab} onChange={(v) => setTab(v as Tab)} options={[{ label: "Trips", value: "trips" }, { label: "Attendance", value: "attendance" }]} aria-label="View" />
      <Segmented
        value={days}
        onChange={(v) => setDays(Number(v))}
        options={[
          { label: "7 days", value: 7 },
          { label: "30 days", value: 30 },
          { label: "90 days", value: 90 },
        ]}
        aria-label="Period"
      />
      {tab === "trips" ? (
        <QueryState query={trips} rows={8} isEmpty={(d) => d.length === 0} emptyTitle="No trips in this period" emptyDescription="Completed and upcoming trips for the selected child are listed here.">
          {(rows) => (
            <div className="sbp-stack" style={{ gap: 8 }}>
              {rows.map((r) => (
                <TripRow key={r.trip_id} row={r} />
              ))}
            </div>
          )}
        </QueryState>
      ) : (
        <QueryState query={attendance} rows={8} isEmpty={(d) => d.length === 0} emptyTitle="No attendance events in this period" emptyDescription="Boarding and drop-off scans recorded by the attendant appear here.">
          {(rows) => (
            <div className="sbp-stack" style={{ gap: 8 }}>
              {rows.map((e) => (
                <AttendanceRow key={e.id} event={e} />
              ))}
            </div>
          )}
        </QueryState>
      )}
    </div>
  );
}

function TripRow({ row }: { row: TripHistoryRow }) {
  const navigate = useNavigate();
  const open = () => navigate(`/parent/track?trip=${row.trip_id}`);
  return (
    <div role="button" tabIndex={0} onClick={open} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && open()} className="sbp-list-card" style={{ cursor: "pointer", alignItems: "flex-start", margin: 0 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="sbp-between" style={{ gap: 8 }}>
          <span style={{ fontWeight: 600 }}>{fmtDate(row.date, "ddd, DD MMM YYYY")}</span>
          <StatusBadge status={row.trip_status} />
        </div>
        <div className="sbp-row" style={{ marginTop: 6, flexWrap: "wrap" }}>
          <DirectionTag direction={row.direction} />
          <StudentStatusBadge status={row.student_status} />
          <DelayTag minutes={row.delay_minutes} />
        </div>
        <div className="sbp-muted" style={{ fontSize: 12, marginTop: 6 }}>
          {row.route}
          {row.vehicle ? ` · ${row.vehicle}` : ""}
          {row.stop ? ` · ${row.stop}` : ""}
        </div>
        {(row.boarded_at || row.dropped_at) && (
          <div style={{ fontSize: 12, marginTop: 4 }}>
            {row.boarded_at && <span>Boarded {fmtTime(row.boarded_at)}</span>}
            {row.boarded_at && row.dropped_at && " · "}
            {row.dropped_at && <span>Dropped off {fmtTime(row.dropped_at)}</span>}
          </div>
        )}
        {row.absence_reason && (
          <div className="sbp-muted" style={{ fontSize: 12, marginTop: 4 }}>
            {row.absence_reason}
          </div>
        )}
      </div>
      <RightOutlined aria-hidden style={{ color: "var(--sbp-text-muted)", marginTop: 4 }} />
    </div>
  );
}

function AttendanceRow({ event }: { event: AttendanceEvent }) {
  return (
    <div className="sbp-list-card" style={{ alignItems: "flex-start", margin: 0 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="sbp-between" style={{ gap: 8 }}>
          <StatusBadge status={event.event_type} label={ATTENDANCE_EVENT_LABELS[event.event_type] ?? titleCase(event.event_type)} />
          <span className="sbp-muted" style={{ fontSize: 12 }}>
            {fmtDateTime(event.occurred_at)}
          </span>
        </div>
        <div style={{ fontSize: 13, marginTop: 6 }}>{event.stop ?? "-"}</div>
        <div className="sbp-row" style={{ marginTop: 6, flexWrap: "wrap" }}>
          <DirectionTag direction={event.direction} />
          <span className="sbp-muted" style={{ fontSize: 12 }}>
            {event.route}
          </span>
        </div>
        {event.note && (
          <div className="sbp-muted" style={{ fontSize: 12, marginTop: 4 }}>
            {event.note}
          </div>
        )}
      </div>
    </div>
  );
}
