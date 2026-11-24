import { useMemo, useState } from "react";
import { Segmented, Typography } from "antd";
import { useQuery } from "@tanstack/react-query";
import { QueryState } from "@/components/ui/States";
import { FilterSelect } from "@/components/ui/FilterSelect";
import { fmtDate } from "@/lib/format";
import type { Trip, TripStatus } from "@/types";
import { driverApi, driverKeys } from "../api";
import { TripCard } from "../components/TripCard";

const DAY_OPTIONS = [7, 14, 30, 90];
const STATUS_OPTIONS = ["SCHEDULED", "IN_PROGRESS", "PAUSED", "COMPLETED", "CANCELLED"].map((s) => ({ value: s, label: s.replace("_", " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase()) }));

export default function DriverHistoryPage() {
  const [days, setDays] = useState(14);
  const [status, setStatus] = useState<TripStatus | undefined>();
  const params = useMemo(() => ({ days, status }), [days, status]);
  const query = useQuery({ queryKey: driverKeys.trips(params), queryFn: () => driverApi.trips(params) });

  return (
    <div className="sbp-stack" style={{ gap: 16 }}>
      <div>
        <h1 className="sbp-section-title" style={{ fontSize: 20, marginBottom: 4 }}>My trips</h1>
        <Typography.Text type="secondary">Past and upcoming trips assigned to you. Tap a trip for its summary.</Typography.Text>
      </div>
      <div className="sbp-between">
        <Segmented aria-label="Days to show" value={days} onChange={(v) => setDays(Number(v))} options={DAY_OPTIONS.map((d) => ({ value: d, label: `${d} days` }))} />
        <FilterSelect value={status} onChange={(v) => setStatus(v as TripStatus | undefined)} options={STATUS_OPTIONS} placeholder="Any status" width={150} />
      </div>
      <QueryState query={query} rows={8} isEmpty={(d: Trip[]) => d.length === 0} emptyTitle="No trips in this period" emptyDescription="Try a longer period or clear the status filter.">
        {(trips) => <TripGroups trips={trips} />}
      </QueryState>
    </div>
  );
}

function TripGroups({ trips }: { trips: Trip[] }) {
  const groups = useMemo(() => {
    const byDate = new Map<string, Trip[]>();
    for (const t of trips) byDate.set(t.scheduled_date, [...(byDate.get(t.scheduled_date) ?? []), t]);
    return [...byDate.entries()];
  }, [trips]);
  return (
    <div className="sbp-stack" style={{ gap: 16 }}>
      {groups.map(([date, items]) => (
        <section key={date} aria-label={fmtDate(date, "dddd, DD MMM YYYY")}>
          <div className="sbp-kicker" style={{ marginBottom: 6 }}>{fmtDate(date, "dddd, DD MMM YYYY")}</div>
          {items.map((t) => <TripCard key={t.id} trip={t} />)}
        </section>
      ))}
    </div>
  );
}
