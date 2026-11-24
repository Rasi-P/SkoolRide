import { useMemo, useRef, useState } from "react";
import { Alert, Button, Card, Col, Modal, Row, Segmented, Space, Table, Tag, Timeline, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { z } from "zod";
import { errorMessage, fieldErrors } from "@/api/client";
import { useAuth } from "@/app/auth";
import { NumberField, SelectField, TextAreaField, applyServerErrors, useZodForm } from "@/components/forms/fields";
import { BusMap, type MapStop, type MapVehicle } from "@/components/map/BusMap";
import { confirmAction } from "@/components/ui/ConfirmDialog";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { InlineError, QueryState } from "@/components/ui/States";
import { DirectionTag, SimulatedTag, StatusBadge } from "@/components/ui/StatusBadge";
import { useSocket, type SocketState } from "@/hooks/useSocket";
import { fmtDate, fmtDateTime, fmtDistance, fmtSpeed, fmtTime, fromNow, titleCase } from "@/lib/format";
import type { TripDetail, TripStudent, VehicleLocation } from "@/types";
import { get, invalidate, post } from "../api";
import { ReasonModal } from "../components/ReasonModal";
import { staffLabel, useStaffOptions, useVehicleOptions, vehicleLabel } from "../hooks";
import type { GPSPoint } from "../types";
import { TripFormDrawer } from "./TripForm";

const replaceSchema = z.object({ vehicle: z.string({ invalid_type_error: "Select a vehicle" }).min(1, "Select a vehicle"), driver: z.string().nullable().optional(), reason: z.string().trim().min(3, "Give a reason") });
const eventSchema = z.object({ event_type: z.enum(["DELAY", "BREAKDOWN", "NOTE"]), description: z.string().trim().min(3, "Describe what happened"), minutes: z.number().int().min(0).max(600).nullable().optional() });

interface LiveState {
  location: VehicleLocation;
  etas: Record<string, { eta_at: string | null; passed: boolean; distance_m: number | null }>;
  delay: number | null;
  stale: boolean;
}

const EVENT_COLOUR: Record<string, string> = { STARTED: "blue", COMPLETED: "green", CANCELLED: "red", EMERGENCY: "red", BREAKDOWN: "red", DELAY: "orange", GPS_STALE: "gray", REPLACEMENT: "purple", STOP_ARRIVED: "cyan", STOP_DEPARTED: "green", PAUSED: "orange", RESUMED: "blue", NOTE: "gray" };

export default function TripDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { hasPerm } = useAuth();
  const canManage = hasPerm("trips.manage");
  const canExecute = canManage || hasPerm("trips.execute");
  const [live, setLive] = useState<LiveState | null>(null);
  const [mapMode, setMapMode] = useState<"route" | "trail">("route");
  const [editing, setEditing] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [eventOpen, setEventOpen] = useState(false);
  const socketRef = useRef<SocketState>("closed");

  const trip = useQuery({
    queryKey: ["trip", id],
    queryFn: () => get<TripDetail>(`/trips/trips/${id}/`),
    enabled: !!id,
    refetchInterval: (q) => (q.state.data?.is_active && socketRef.current !== "open" ? 15_000 : false),
  });
  const socket = useSocket(trip.data?.is_active ? `/ws/trips/${id}/` : null, (msg) => {
    if (msg.event === "location" && msg.payload?.location) {
      const etas: LiveState["etas"] = {};
      for (const e of msg.payload.etas ?? []) etas[e.trip_stop_id] = { eta_at: e.eta_at, passed: e.passed, distance_m: e.distance_m };
      setLive({ location: msg.payload.location, etas, delay: msg.payload.delay_minutes ?? null, stale: false });
    } else if (msg.event === "stale") {
      setLive((l) => (l ? { ...l, stale: true } : l));
    } else if (msg.event === "snapshot") {
      const p = msg.payload as { location?: VehicleLocation | null; stale?: boolean | null } | undefined;
      if (p?.location) setLive({ location: p.location, etas: {}, delay: null, stale: !!p.stale });
    } else if (["status", "stop", "student", "event", "emergency"].includes(msg.event)) {
      qc.invalidateQueries({ queryKey: ["trip", id] });
      if (msg.event === "status") qc.invalidateQueries({ queryKey: ["trips"] });
    }
  });
  socketRef.current = socket;
  const locations = useQuery({ queryKey: ["trip-locations", id], queryFn: () => get<GPSPoint[]>(`/trips/trips/${id}/locations/`), enabled: !!id, refetchInterval: trip.data?.is_active ? 30_000 : false });

  const vehicles = useVehicleOptions();
  const drivers = useStaffOptions("DRIVER");
  const replaceForm = useZodForm(replaceSchema, { defaultValues: { vehicle: "", driver: null, reason: "" } });
  const eventForm = useZodForm(eventSchema, { defaultValues: { event_type: "DELAY", description: "", minutes: null } });

  const refresh = () => invalidate(qc, "trip", "trips", "trips-history", "live", "dashboard", "trip-locations", "sim-candidates");
  const lifecycle = useMutation({
    mutationFn: ({ action, body }: { action: string; body?: unknown }) => post<TripDetail>(`/trips/trips/${id}/${action}/`, body ?? {}),
    onSuccess: (_, { action }) => { refresh(); message.success(action === "start" ? "Trip started" : action === "end" ? "Trip ended" : "Trip cancelled"); setCancelOpen(false); },
    onError: (e) => message.error(errorMessage(e)),
  });
  const replace = useMutation({
    mutationFn: (d: z.input<typeof replaceSchema>) => post<TripDetail>(`/trips/trips/${id}/replace-vehicle/`, d),
    onSuccess: (t) => { refresh(); message.success(`Replacement trip created on ${t.vehicle_registration}`); setReplaceOpen(false); navigate(`/school/trips/${t.id}`); },
    onError: (e) => applyServerErrors(replaceForm.setError, fieldErrors(e)),
  });
  const addEvent = useMutation({
    mutationFn: (d: z.input<typeof eventSchema>) => post(`/trips/trips/${id}/events/`, { ...d, minutes: d.event_type === "DELAY" ? d.minutes ?? undefined : undefined }),
    onSuccess: () => { refresh(); message.success("Event recorded"); setEventOpen(false); eventForm.reset(); },
    onError: (e) => applyServerErrors(eventForm.setError, fieldErrors(e)),
  });
  const mark = useMutation({
    mutationFn: ({ ts, event }: { ts: TripStudent; event: "boarded" | "dropped" | "absent" }) => post(`/trips/trips/${id}/students/${ts.id}/${event}/`, { note: "" }),
    onSuccess: (_, { ts, event }) => { invalidate(qc, "trip", "live", "dashboard"); message.success(`${ts.student_name} marked ${event}`); },
    onError: (e) => message.error(errorMessage(e)),
  });

  const t = trip.data;
  const nextId = useMemo(() => t?.stops.find((s) => s.status === "PENDING")?.id ?? null, [t]);
  const groups = useMemo(() => {
    const map = new Map<string, { name: string; seq: number; rows: TripStudent[] }>();
    for (const s of t?.students ?? []) {
      const key = s.trip_stop ?? "none";
      if (!map.has(key)) map.set(key, { name: s.stop_name ?? "No stop", seq: s.stop_sequence ?? 999, rows: [] });
      map.get(key)!.rows.push(s);
    }
    return [...map.values()].sort((a, b) => a.seq - b.seq);
  }, [t]);

  const studentColumns: ColumnsType<TripStudent> = [
    { title: "Student", dataIndex: "student_name", render: (v: string, r) => <Link to={`/school/students/${r.student}`}>{v}</Link> },
    { title: "Class", dataIndex: "class_label", width: 80 },
    { title: "Status", dataIndex: "status", width: 110, render: (v: string) => <StatusBadge status={v} /> },
    { title: "Time", key: "time", width: 130, render: (_, r) => (r.dropped_at ? `Dropped ${fmtTime(r.dropped_at)}` : r.boarded_at ? `Boarded ${fmtTime(r.boarded_at)}` : r.absence_reason || "-") },
    { title: "Guardian", dataIndex: "guardian_phone", width: 150, render: (v: string | null) => v ?? "-" },
    ...(canExecute && t?.is_active ? [{
      title: "", key: "actions", width: 230,
      render: (_: unknown, r: TripStudent) => (
        <Space>
          {r.status === "EXPECTED" && <Button size="small" type="primary" onClick={() => mark.mutate({ ts: r, event: "boarded" })}>Boarded</Button>}
          {r.status === "BOARDED" && <Button size="small" onClick={() => mark.mutate({ ts: r, event: "dropped" })}>Dropped</Button>}
          {(r.status === "EXPECTED" || r.status === "NO_SHOW") && <Button size="small" danger onClick={() => confirmAction({ title: `Mark ${r.student_name} absent?`, content: "The guardian is notified that the student did not board.", okText: "Mark absent", danger: true, onOk: () => mark.mutateAsync({ ts: r, event: "absent" }) })}>Absent</Button>}
        </Space>
      ),
    }] : []),
  ];

  return (
    <QueryState query={trip}>
      {(trip) => {
        const loc = live?.location ?? trip.current_location;
        const mapVehicles: MapVehicle[] = loc && trip.is_active ? [{ id: trip.id, latitude: Number(loc.latitude), longitude: Number(loc.longitude), heading: loc.heading, label: trip.vehicle_registration ?? undefined, simulated: loc.is_simulated || trip.is_simulated, stale: live ? live.stale : !!trip.gps_stale }] : [];
        const mapStops: MapStop[] = trip.stops.map((s) => ({ id: s.id, name: s.name, latitude: Number(s.latitude), longitude: Number(s.longitude), sequence: s.sequence, is_school_stop: s.is_school_stop, status: s.status, highlight: s.id === nextId }));
        const trail: [number, number][] = (locations.data ?? []).map((p) => [p.latitude, p.longitude]);
        const delay = live?.delay ?? trip.delay_minutes;
        const stale = live ? live.stale : !!trip.gps_stale;
        return (
          <div>
            <PageHeader
              crumbs={[{ label: "Trips", to: "/school/trips" }, { label: `${trip.route_code} · ${fmtDate(trip.scheduled_date)}` }]}
              title={<span className="sbp-row" style={{ flexWrap: "wrap" }}><Tag style={{ borderColor: trip.route_colour, color: trip.route_colour, fontSize: 14 }}>{trip.route_code}</Tag>{trip.route_name} <DirectionTag direction={trip.direction} /> <StatusBadge status={trip.status} /> <SimulatedTag show={trip.is_simulated} /></span>}
              subtitle={`${fmtDate(trip.scheduled_date, "dddd, DD MMM YYYY")} · ${fmtTime(trip.scheduled_start_time)} · ${trip.vehicle_registration ?? "no vehicle"} · ${trip.driver_name ?? "no driver"}${trip.attendant_name ? ` · ${trip.attendant_name}` : ""}${trip.replacement_of_id ? " · replacement trip" : ""}`}
              extra={
                <Space wrap>
                  {trip.is_active && <Link to={`/school/trips/live?trip=${trip.id}`}><Button>Live map</Button></Link>}
                  {canManage && trip.status === "SCHEDULED" && <Button onClick={() => setEditing(true)}>Edit</Button>}
                  {canManage && trip.status === "SCHEDULED" && <Button type="primary" loading={lifecycle.isPending} onClick={() => confirmAction({ title: "Start this trip now?", content: "Parents of expected students are notified that the bus has left.", okText: "Start trip", onOk: () => lifecycle.mutateAsync({ action: "start" }) })}>Start trip</Button>}
                  {canManage && trip.is_active && <Button type="primary" loading={lifecycle.isPending} onClick={() => confirmAction({ title: "End this trip?", content: "Remaining expected students are marked no-show and the trip is completed.", okText: "End trip", onOk: () => lifecycle.mutateAsync({ action: "end" }) })}>End trip</Button>}
                  {canManage && (trip.status === "SCHEDULED" || trip.is_active) && <Button onClick={() => { replaceForm.reset({ vehicle: "", driver: trip.driver, reason: "" }); setReplaceOpen(true); }}>Replace vehicle</Button>}
                  {canExecute && (trip.status === "SCHEDULED" || trip.is_active) && <Button onClick={() => setEventOpen(true)}>Add event</Button>}
                  {canManage && (trip.status === "SCHEDULED" || trip.is_active) && <Button danger onClick={() => setCancelOpen(true)}>Cancel trip</Button>}
                </Space>
              }
            />
            {trip.status === "CANCELLED" && <Alert type="error" showIcon style={{ marginBottom: 16 }} message="Trip cancelled" description={trip.cancelled_reason || "No reason recorded."} />}
            {trip.is_active && stale && <Alert type="warning" showIcon style={{ marginBottom: 16 }} message="GPS signal lost" description={`Last position ${loc ? fromNow(loc.recorded_at) : "unknown"}. The driver's phone may be offline or the app in the background.`} />}
            <div className="sbp-grid sbp-grid-4" style={{ marginBottom: 16 }}>
              <StatCard title="Expected" value={trip.expected_students} tone="neutral" />
              <StatCard title="Boarded" value={trip.boarded_count} hint={`${trip.dropped_count} dropped off`} tone="success" />
              <StatCard title="Absent / no-show" value={trip.absent_count} tone={trip.absent_count ? "danger" : "neutral"} />
              <StatCard title="Delay" value={delay > 0 ? `+${delay} min` : "On time"} tone={delay >= 10 ? "danger" : delay > 0 ? "warning" : "success"} hint={trip.started_at ? `Started ${fmtTime(trip.started_at)}${trip.ended_at ? ` · ended ${fmtTime(trip.ended_at)}` : ""}` : "Not started"} />
            </div>
            <Row gutter={[16, 16]}>
              <Col xs={24} xl={15}>
                <div className="sbp-between" style={{ marginBottom: 8 }}>
                  <Segmented aria-label="Map layer" options={[{ label: "Route path", value: "route" }, { label: `GPS trail (${locations.data?.length ?? 0} points)`, value: "trail" }]} value={mapMode} onChange={(v) => setMapMode(v as "route" | "trail")} />
                  {loc && <span className="sbp-muted" style={{ fontSize: 12 }}>Position {fromNow(loc.recorded_at)} · {fmtSpeed(loc.speed_mps)}{live?.etas && nextId && live.etas[nextId]?.distance_m != null ? ` · ${fmtDistance(live.etas[nextId].distance_m)} to next stop` : ""}{socket === "open" ? " · live" : trip.is_active ? " · polling" : ""}</span>}
                </div>
                <BusMap height={480} colour={mapMode === "trail" ? "#94a3b8" : trip.route_colour || "#1d4ed8"} path={mapMode === "trail" ? trail : trip.route_path} stops={mapStops} vehicles={mapVehicles} follow={trip.is_active ? trip.id : null} fitKey={`${trip.id}-${mapMode}-${trip.stops.length}`} />
                <Card size="small" title="Students by stop" style={{ marginTop: 16 }}>
                  {groups.length === 0 ? <Typography.Text type="secondary">No students on this trip.</Typography.Text> : groups.map((g) => (
                    <div key={g.name} style={{ marginBottom: 16 }}>
                      <Typography.Text strong style={{ display: "block", marginBottom: 6 }}>{g.seq < 999 ? `${g.seq}. ` : ""}{g.name} <span className="sbp-muted" style={{ fontWeight: 400 }}>· {g.rows.filter((r) => r.status === "BOARDED" || r.status === "DROPPED").length}/{g.rows.length} boarded</span></Typography.Text>
                      <Table rowKey="id" size="small" columns={studentColumns} dataSource={g.rows} pagination={false} />
                    </div>
                  ))}
                </Card>
              </Col>
              <Col xs={24} xl={9}>
                <Card size="small" title="Stops" style={{ marginBottom: 16 }}>
                  {trip.stops.map((s) => {
                    const eta = live?.etas[s.id]?.eta_at ?? s.eta;
                    const cls = s.status === "DEPARTED" || s.status === "ARRIVED" ? "done" : s.status === "SKIPPED" ? "skipped" : s.id === nextId && trip.is_active ? "current" : "";
                    return (
                      <div className="sbp-timeline-stop" key={s.id}>
                        <span className={`sbp-dot ${cls}`} />
                        <div>
                          <div style={{ fontWeight: 600 }}>{s.sequence}. {s.name} {s.is_school_stop && <Tag style={{ fontSize: 11 }}>School</Tag>}<StatusBadge status={s.status} /></div>
                          <div className="sbp-muted" style={{ fontSize: 12 }}>Planned {fmtTime(s.planned_time)}{s.arrived_at ? ` · arrived ${fmtTime(s.arrived_at)}` : eta && s.status === "PENDING" ? ` · ETA ${fmtTime(eta)}` : ""}{s.departed_at ? ` · departed ${fmtTime(s.departed_at)}` : ""}</div>
                        </div>
                        <span className="sbp-mono sbp-muted" style={{ fontSize: 12 }}>{s.boarded_count ?? 0}/{s.expected_count ?? 0}</span>
                      </div>
                    );
                  })}
                </Card>
                <Card size="small" title="Events">
                  {trip.events.length === 0 ? <Typography.Text type="secondary">No events yet.</Typography.Text> : (
                    <Timeline items={[...trip.events].sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1)).map((e) => ({ color: EVENT_COLOUR[e.event_type] ?? "blue", children: <div><div><Tag style={{ fontSize: 11 }}>{titleCase(e.event_type)}</Tag>{e.description}{typeof e.data?.minutes === "number" ? ` (+${e.data.minutes} min)` : ""}</div><div className="sbp-muted" style={{ fontSize: 12 }}>{fmtDateTime(e.occurred_at)}{e.created_by_name ? ` · ${e.created_by_name}` : ""}</div></div> }))} />
                  )}
                </Card>
              </Col>
            </Row>
            <TripFormDrawer open={editing} trip={trip} onClose={() => setEditing(false)} />
            <ReasonModal open={cancelOpen} title="Cancel this trip?" description="Parents of expected students receive a cancellation notice. This cannot be undone." label="Reason (sent to parents)" okText="Cancel trip" danger loading={lifecycle.isPending} onCancel={() => setCancelOpen(false)} onSubmit={(reason) => lifecycle.mutate({ action: "cancel", body: { reason } })} />
            <Modal open={replaceOpen} title="Replace vehicle" okText="Create replacement trip" confirmLoading={replace.isPending} onCancel={() => setReplaceOpen(false)} onOk={replaceForm.handleSubmit((d) => replace.mutate(d))} centered destroyOnHidden>
              <p className="sbp-muted">The current trip is closed and a replacement trip continues from the next pending stop with the new vehicle. Parents are notified.</p>
              <form noValidate onSubmit={replaceForm.handleSubmit((d) => replace.mutate(d))}>
                <InlineError error={replace.isError ? replace.error : undefined} />
                <SelectField control={replaceForm.control} name="vehicle" label="Replacement vehicle" required loading={vehicles.isLoading} options={(vehicles.data ?? []).filter((v) => v.id !== trip.vehicle && v.status !== "INACTIVE").map((v) => ({ value: v.id, label: `${vehicleLabel(v)} · ${titleCase(v.status)}` }))} />
                <SelectField control={replaceForm.control} name="driver" label="Driver" loading={drivers.isLoading} options={(drivers.data ?? []).map((s) => ({ value: s.id, label: staffLabel(s) }))} help="Leave empty to keep the current driver" />
                <TextAreaField control={replaceForm.control} name="reason" label="Reason" required rows={2} />
              </form>
            </Modal>
            <Modal open={eventOpen} title="Add trip event" okText="Record event" confirmLoading={addEvent.isPending} onCancel={() => setEventOpen(false)} onOk={eventForm.handleSubmit((d) => addEvent.mutate(d))} centered destroyOnHidden>
              <form noValidate onSubmit={eventForm.handleSubmit((d) => addEvent.mutate(d))}>
                <InlineError error={addEvent.isError ? addEvent.error : undefined} />
                <SelectField control={eventForm.control} name="event_type" label="Type" required allowClear={false} options={[{ value: "DELAY", label: "Delay" }, { value: "BREAKDOWN", label: "Breakdown" }, { value: "NOTE", label: "Note" }]} />
                {eventForm.watch("event_type") === "DELAY" && <NumberField control={eventForm.control} name="minutes" label="Delay (minutes)" min={0} max={600} help="Parents of pending stops are told the bus is running late." />}
                <TextAreaField control={eventForm.control} name="description" label="Description" required rows={3} />
              </form>
            </Modal>
          </div>
        );
      }}
    </QueryState>
  );
}
