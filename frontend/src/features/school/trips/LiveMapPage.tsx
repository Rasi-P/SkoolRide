import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, Col, List, Row, Space, Tag, Typography } from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "@/app/auth";
import { BusMap, type MapStop, type MapVehicle } from "@/components/map/BusMap";
import { PageHeader } from "@/components/ui/PageHeader";
import { ErrorState } from "@/components/ui/States";
import { DirectionTag, SimulatedTag, StatusBadge } from "@/components/ui/StatusBadge";
import { useSocket } from "@/hooks/useSocket";
import { dayjs, fmtTime, fromNow, minutesUntil } from "@/lib/format";
import type { Trip, TripDetail, VehicleLocation } from "@/types";
import { get } from "../api";
import { usePublicConfig } from "../hooks";
import type { LiveResponse } from "../types";
import { SimulatorPanel } from "./SimulatorPanel";

interface Override {
  location: VehicleLocation;
  delay?: number;
  stale?: boolean;
  at: number;
}

export default function LiveMapPage() {
  const { membership } = useAuth();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const selectedId = params.get("trip");
  const config = usePublicConfig();
  const [overrides, setOverrides] = useState<Record<string, Override>>({});
  const [socketAt, setSocketAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 5000);
    return () => window.clearInterval(t);
  }, []);

  const socket = useSocket(membership ? `/ws/schools/${membership.school_id}/live/` : null, (msg) => {
    if (!msg.trip_id) return;
    const id = msg.trip_id;
    if (msg.event === "location" && msg.payload?.location) {
      const loc = msg.payload.location;
      const delay = msg.payload.delay_minutes;
      setOverrides((o) => ({ ...o, [id]: { location: loc, delay, stale: false, at: Date.now() } }));
      setSocketAt(Date.now());
    } else if (msg.event === "stale") {
      setOverrides((o) => (o[id] ? { ...o, [id]: { ...o[id], stale: true } } : o));
    } else if (["status", "stop", "student", "event", "emergency", "snapshot"].includes(msg.event)) {
      qc.invalidateQueries({ queryKey: ["live"] });
      qc.invalidateQueries({ queryKey: ["trip", id] });
      setSocketAt(Date.now());
    }
  });
  const socketOpen = socket === "open";
  const live = useQuery({ queryKey: ["live"], queryFn: () => get<LiveResponse>("/trips/trips/live/"), refetchInterval: socketOpen ? 60_000 : 15_000 });
  const selected = useQuery({ queryKey: ["trip", selectedId], queryFn: () => get<TripDetail>(`/trips/trips/${selectedId}/`), enabled: !!selectedId });

  const trips = useMemo(() => live.data?.trips ?? [], [live.data]);
  const lastUpdate = Math.max(live.dataUpdatedAt || 0, socketAt || 0) || null;

  const vehicles = useMemo<MapVehicle[]>(() => {
    const out: MapVehicle[] = [];
    for (const t of trips) {
      const o = overrides[t.id];
      const base = t.current_location;
      const useOverride = o && (!base || dayjs(o.location.recorded_at).valueOf() >= dayjs(base.recorded_at).valueOf());
      const loc = useOverride ? o.location : base;
      if (!loc) continue;
      out.push({ id: t.id, latitude: Number(loc.latitude), longitude: Number(loc.longitude), heading: loc.heading, label: `${t.route_code} · ${t.vehicle_registration ?? "no vehicle"}`, simulated: loc.is_simulated || t.is_simulated, stale: useOverride ? !!o.stale : !!(t.gps_stale ?? loc.is_stale), colour: t.route_colour });
    }
    return out;
  }, [trips, overrides]);

  const stops = useMemo<MapStop[]>(() => (selected.data?.stops ?? []).map((s) => ({ id: s.id, name: s.name, latitude: Number(s.latitude), longitude: Number(s.longitude), sequence: s.sequence, is_school_stop: s.is_school_stop, status: s.status })), [selected.data]);
  const path = selected.data?.route_path ?? [];
  const today = dayjs().format("YYYY-MM-DD");

  const tripRow = (t: Trip) => {
    const o = overrides[t.id];
    const delay = o?.delay ?? t.delay_minutes;
    const stale = o ? !!o.stale : !!t.gps_stale;
    const hasLoc = !!(o?.location ?? t.current_location);
    const eta = minutesUntil(t.next_stop?.eta);
    const active = t.id === selectedId;
    return (
      <List.Item key={t.id} onClick={() => setParams({ trip: t.id })} style={{ cursor: "pointer", background: active ? "var(--sbp-primary-soft)" : undefined, borderRadius: 10, padding: "10px 12px" }} aria-current={active ? "true" : undefined}>
        <List.Item.Meta
          title={<span className="sbp-row" style={{ flexWrap: "wrap" }}><Tag style={{ borderColor: t.route_colour, color: t.route_colour, marginInlineEnd: 0 }}>{t.route_code}</Tag><span>{t.route_name}</span><DirectionTag direction={t.direction} /><StatusBadge status={t.status} /><SimulatedTag show={t.is_simulated} /></span>}
          description={
            <div style={{ fontSize: 12 }}>
              <div>{t.vehicle_registration ?? "No vehicle"} · {t.driver_name ?? "No driver"} · boarded {t.boarded_count}/{t.expected_students}</div>
              <div>Next: {t.next_stop ? <span>{t.next_stop.name}{eta !== null ? ` · ETA ${eta} min` : t.next_stop.planned_time ? ` · planned ${fmtTime(t.next_stop.planned_time)}` : ""}</span> : "all stops done"}</div>
              <Space size={4} wrap style={{ marginTop: 4 }}>
                {delay > 0 && <Tag color={delay >= 10 ? "red" : "orange"}>+{delay} min late</Tag>}
                {!hasLoc && <Tag>No GPS yet</Tag>}
                {hasLoc && stale && <Tag color="red">GPS stale</Tag>}
                <Link to={`/school/trips/${t.id}`} onClick={(e) => e.stopPropagation()}>Open trip</Link>
              </Space>
            </div>
          }
        />
      </List.Item>
    );
  };

  return (
    <div>
      <PageHeader
        title="Live map"
        subtitle="Every bus on an active trip, updated in real time."
        extra={
          <Space wrap>
            {socketOpen ? <Tag color="green">Live</Tag> : socket === "connecting" ? <Tag color="blue">Connecting...</Tag> : socket === "unauthorized" ? <Tag color="red">Not authorised for live updates</Tag> : <Tag color="orange">Connection lost · polling every 15s</Tag>}
            <span className="sbp-muted" style={{ fontSize: 12 }}>{lastUpdate ? `Last update ${fromNow(new Date(lastUpdate).toISOString())}` : "Waiting for data..."}</span>
            <Button icon={<ReloadOutlined />} aria-label="Refresh" onClick={() => live.refetch()} loading={live.isFetching} />
          </Space>
        }
      />
      {!socketOpen && socket !== "connecting" && lastUpdate && now - lastUpdate > 60_000 && (
        <Alert type="warning" showIcon style={{ marginBottom: 16 }} message={`Live connection lost. Showing data from ${fromNow(new Date(lastUpdate).toISOString())}; refreshing every 15 seconds.`} />
      )}
      {live.isError && <ErrorState error={live.error} onRetry={() => live.refetch()} />}
      <Row gutter={[16, 16]}>
        <Col xs={24} xl={16}>
          <BusMap height={620} vehicles={vehicles} stops={stops} path={path} colour={selected.data?.route_colour ?? "#1d4ed8"} follow={selectedId && vehicles.some((v) => v.id === selectedId) ? selectedId : null} fitKey={`${selectedId ?? "all"}-${stops.length}-${vehicles.length > 0 ? "v" : "nov"}`} />
          {selected.data && (
            <Card size="small" style={{ marginTop: 12 }} title={<span>{selected.data.route_code} {selected.data.route_name} <DirectionTag direction={selected.data.direction} /></span>} extra={<Space><Link to={`/school/trips/${selected.data.id}`}>Trip details</Link><Button size="small" onClick={() => setParams({})}>Clear</Button></Space>}>
              <div className="sbp-row" style={{ flexWrap: "wrap", gap: 16, fontSize: 13 }}>
                {selected.data.stops.map((s) => (
                  <span key={s.id} className="sbp-row" style={{ gap: 6 }}>
                    <span className={`sbp-dot ${s.status === "DEPARTED" || s.status === "ARRIVED" ? "done" : s.status === "SKIPPED" ? "skipped" : selected.data?.next_stop?.id === s.id ? "current" : ""}`} style={{ margin: 0 }} />
                    <span>{s.sequence}. {s.name}</span>
                    <span className="sbp-muted">{s.departed_at ? fmtTime(s.departed_at) : s.eta ? `ETA ${fmtTime(s.eta)}` : s.planned_time ? fmtTime(s.planned_time) : ""}</span>
                  </span>
                ))}
              </div>
            </Card>
          )}
        </Col>
        <Col xs={24} xl={8}>
          <div className="sbp-stack">
            <Card size="small" title={`Active trips (${trips.length})`} styles={{ body: { padding: 8 } }}>
              {trips.length === 0 ? (
                <Typography.Text type="secondary" style={{ display: "block", padding: 12 }}>{live.isLoading ? "Loading..." : "No trips are running right now. Buses appear here as soon as a driver starts a trip."}</Typography.Text>
              ) : (
                <List dataSource={trips} renderItem={tripRow} split={false} />
              )}
            </Card>
            {config.data?.demo_mode && <SimulatorPanel today={today} selectedTripId={selectedId} />}
          </div>
        </Col>
      </Row>
    </div>
  );
}
