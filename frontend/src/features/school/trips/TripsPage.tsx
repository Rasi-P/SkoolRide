import { useMemo, useState } from "react";
import { Button, Modal, Space, Tag, message } from "antd";
import { PlusOutlined, ThunderboltOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";
import { buildQuery, errorMessage } from "@/api/client";
import { useAuth } from "@/app/auth";
import { DateField, useZodForm } from "@/components/forms/fields";
import { confirmAction } from "@/components/ui/ConfirmDialog";
import { DataTable } from "@/components/ui/DataTable";
import { FilterSelect } from "@/components/ui/FilterSelect";
import { PageHeader } from "@/components/ui/PageHeader";
import { DirectionTag, SimulatedTag, StatusBadge } from "@/components/ui/StatusBadge";
import { useTableParams } from "@/hooks/usePagedQuery";
import { dayjs, fmtDate, fmtTime } from "@/lib/format";
import type { Trip } from "@/types";
import { invalidate, post } from "../api";
import { DateRangeFilter, lastDays, nextDays, type DateRange } from "../components/DateRangeFilter";
import { ReasonModal } from "../components/ReasonModal";
import { DIRECTION, TRIP_STATUS } from "../constants";
import { routeLabel, useRouteOptions, useVehicleOptions, vehicleLabel } from "../hooks";
import { TripFormDrawer } from "./TripForm";

const generateSchema = z.object({ date: z.string({ invalid_type_error: "Pick a date" }).min(1, "Pick a date") });

export default function TripsPage({ history = false }: { history?: boolean }) {
  const { hasPerm } = useAuth();
  const canManage = hasPerm("trips.manage");
  const navigate = useNavigate();
  const qc = useQueryClient();
  const state = useTableParams({ ordering: history ? "-scheduled_date" : "scheduled_date" });
  const [range, setRange] = useState<DateRange>(history ? lastDays(30) : nextDays(7));
  const routes = useRouteOptions(false);
  const vehicles = useVehicleOptions();
  const [creating, setCreating] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [cancelling, setCancelling] = useState<Trip | null>(null);
  const extraParams = useMemo(() => ({ date_from: range?.[0], date_to: range?.[1] }), [range]);
  const exportPath = `/trips/trips/export/${buildQuery({ ...extraParams, status: state.params.status, direction: state.params.direction, route: state.params.route, vehicle: state.params.vehicle, search: state.params.search })}`;

  const genForm = useZodForm(generateSchema, { defaultValues: { date: dayjs().format("YYYY-MM-DD") } });
  const generate = useMutation({
    mutationFn: (d: z.input<typeof generateSchema>) => post<{ created: number; trips: Trip[] }>("/trips/trips/generate/", d),
    onSuccess: (r, d) => {
      invalidate(qc, "trips", "dashboard", "sim-candidates");
      message.success(r.created === 0 ? `No new trips for ${fmtDate(d.date)}: every active schedule already has a trip (or none runs that day).` : `${r.created} trip${r.created === 1 ? "" : "s"} generated for ${fmtDate(d.date)}`);
      setGenerating(false);
    },
    onError: (e) => message.error(errorMessage(e)),
  });
  const start = useMutation({
    mutationFn: (t: Trip) => post(`/trips/trips/${t.id}/start/`),
    onSuccess: (_, t) => { invalidate(qc, "trips", "trip", "live", "dashboard"); message.success(`Trip ${t.route_code} started`); },
    onError: (e) => message.error(errorMessage(e)),
  });
  const cancel = useMutation({
    mutationFn: ({ t, reason }: { t: Trip; reason: string }) => post(`/trips/trips/${t.id}/cancel/`, { reason }),
    onSuccess: () => { invalidate(qc, "trips", "trip", "live", "dashboard"); message.success("Trip cancelled; parents have been notified"); setCancelling(null); },
    onError: (e) => message.error(errorMessage(e)),
  });

  const columns: ColumnsType<Trip> = [
    { title: "Date", dataIndex: "scheduled_date", sorter: true, width: 120, render: (v: string) => fmtDate(v) },
    { title: "Time", dataIndex: "scheduled_start_time", sorter: true, width: 90, render: (v: string) => fmtTime(v) },
    { title: "Route", key: "route", render: (_, t) => <span><Tag style={{ borderColor: t.route_colour, color: t.route_colour }}>{t.route_code}</Tag>{t.route_name}</span> },
    { title: "Direction", dataIndex: "direction", width: 170, render: (v: string) => <DirectionTag direction={v} /> },
    { title: "Vehicle", dataIndex: "vehicle_registration", width: 130, render: (v: string | null) => v ?? <Tag color="orange">None</Tag> },
    { title: "Driver", dataIndex: "driver_name", width: 150, render: (v: string | null) => v ?? <span className="sbp-muted">-</span> },
    { title: "Status", dataIndex: "status", sorter: true, width: 150, render: (v: string, t) => <Space size={4}><StatusBadge status={v} /><SimulatedTag show={t.is_simulated} /></Space> },
    { title: "Exp / boarded / absent", key: "counts", width: 170, align: "center", render: (_, t) => <span className="sbp-mono">{t.expected_students} / <span style={{ color: "var(--sbp-success)" }}>{t.boarded_count}</span> / <span style={{ color: t.absent_count ? "var(--sbp-danger)" : undefined }}>{t.absent_count}</span></span> },
    { title: "Delay", dataIndex: "delay_minutes", width: 90, align: "right", render: (v: number) => (v > 0 ? <span style={{ color: v >= 10 ? "var(--sbp-danger)" : "var(--sbp-warning)" }}>+{v} min</span> : <span className="sbp-muted">-</span>) },
    {
      title: "", key: "actions", width: 210,
      render: (_, t) => (
        <Space onClick={(e) => e.stopPropagation()} wrap>
          <Link to={`/school/trips/${t.id}`}><Button size="small">Open</Button></Link>
          {t.is_active && <Link to={`/school/trips/live?trip=${t.id}`}><Button size="small">Live</Button></Link>}
          {canManage && t.status === "SCHEDULED" && <Button size="small" type="primary" loading={start.isPending && start.variables?.id === t.id} onClick={() => confirmAction({ title: `Start trip ${t.route_code} now?`, content: "Parents of expected students are notified that the bus has left.", okText: "Start trip", onOk: () => start.mutateAsync(t) })}>Start</Button>}
          {canManage && (t.status === "SCHEDULED" || t.is_active) && <Button size="small" danger onClick={() => setCancelling(t)}>Cancel</Button>}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title={history ? "Trip history" : "Trips & schedules"}
        subtitle={history ? "Completed and cancelled trips with boarding counts and delays." : "Daily trips generated from route schedules. Start, cancel or create ad-hoc trips here."}
        extra={canManage && !history && (
          <>
            <Button icon={<ThunderboltOutlined />} onClick={() => setGenerating(true)}>Generate trips for a date</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>Create trip</Button>
          </>
        )}
      />
      <DataTable<Trip>
        queryKey={history ? "trips-history" : "trips"}
        path="/trips/trips/"
        columns={columns}
        tableState={state}
        extraParams={extraParams}
        searchPlaceholder="Search route, vehicle, driver"
        exportPath={exportPath}
        exportFilename="trips.csv"
        initialOrdering={history ? "-scheduled_date" : "scheduled_date"}
        emptyTitle={history ? "No trips in this period" : "No trips scheduled"}
        emptyDescription={history ? "Widen the date range to see earlier trips." : "Generate trips for a date from the route schedules, or create one manually."}
        scrollX={1350}
        filters={
          <>
            <DateRangeFilter value={range} onChange={setRange} />
            <FilterSelect value={state.params.status} onChange={(v) => state.setFilter("status", v)} options={TRIP_STATUS} placeholder="Status" width={140} />
            <FilterSelect value={state.params.direction} onChange={(v) => state.setFilter("direction", v)} options={DIRECTION} placeholder="Direction" width={170} />
            <FilterSelect value={state.params.route} onChange={(v) => state.setFilter("route", v)} options={(routes.data ?? []).map((r) => ({ value: r.id, label: routeLabel(r) }))} placeholder="Route" width={200} />
            <FilterSelect value={state.params.vehicle} onChange={(v) => state.setFilter("vehicle", v)} options={(vehicles.data ?? []).map((v) => ({ value: v.id, label: vehicleLabel(v) }))} placeholder="Vehicle" width={170} />
          </>
        }
        onRow={(t) => ({ onClick: () => navigate(`/school/trips/${t.id}`), style: { cursor: "pointer" } })}
      />
      <TripFormDrawer open={creating} trip={null} onClose={() => setCreating(false)} onSaved={(t) => navigate(`/school/trips/${t.id}`)} />
      <Modal open={generating} title="Generate trips from schedules" okText="Generate" confirmLoading={generate.isPending} onCancel={() => setGenerating(false)} onOk={genForm.handleSubmit((d) => generate.mutate(d))} centered destroyOnHidden>
        <p className="sbp-muted">Creates one trip per active schedule that runs on the chosen weekday, using each route's vehicle and crew. Trips that already exist are skipped, so this is safe to repeat.</p>
        <form onSubmit={genForm.handleSubmit((d) => generate.mutate(d))} noValidate>
          <DateField control={genForm.control} name="date" label="Date" required />
        </form>
      </Modal>
      <ReasonModal open={!!cancelling} title={`Cancel trip ${cancelling?.route_code ?? ""} (${cancelling ? fmtDate(cancelling.scheduled_date) : ""})?`} description="Parents of expected students receive a cancellation notice. This cannot be undone." label="Reason (sent to parents)" okText="Cancel trip" danger loading={cancel.isPending} onCancel={() => setCancelling(null)} onSubmit={(reason) => cancelling && cancel.mutate({ t: cancelling, reason })} />
    </div>
  );
}
