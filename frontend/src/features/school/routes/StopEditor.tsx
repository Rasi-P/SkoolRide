import { useMemo, useState } from "react";
import { Alert, Button, Card, Col, Empty, Input, InputNumber, Row, Space, Switch, Tag, TimePicker, Tooltip, Typography, message } from "antd";
import { ArrowDownOutlined, ArrowUpOutlined, DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { errorMessage } from "@/api/client";
import { BusMap, type MapStop } from "@/components/map/BusMap";
import { LoadingSkeleton, ErrorState } from "@/components/ui/States";
import { dayjs } from "@/lib/format";
import { invalidate, put } from "../api";
import { useRouteStops } from "../hooks";
import type { RouteDetail, RouteStop, RouteStopWrite } from "../types";

interface EditableStop extends RouteStopWrite {
  key: string;
  student_count: number | null;
}

let seq = 0;
const newKey = () => `new-${Date.now()}-${seq++}`;
const toEditable = (s: RouteStop): EditableStop => ({ key: s.id, id: s.id, name: s.name, latitude: Number(s.latitude), longitude: Number(s.longitude), address: s.address, landmark: s.landmark, planned_pickup_time: s.planned_pickup_time, planned_dropoff_time: s.planned_dropoff_time, is_school_stop: s.is_school_stop, wait_minutes: s.wait_minutes, student_count: s.student_count });

function TimeInput({ value, onChange, label }: { value: string | null; onChange: (v: string | null) => void; label: string }) {
  return <TimePicker aria-label={label} format="HH:mm" minuteStep={5} size="small" style={{ width: "100%" }} value={value ? dayjs(`2000-01-01T${value}`) : null} onChange={(d) => onChange(d ? d.format("HH:mm:ss") : null)} />;
}

/** Ordered stop list beside a map: click the map to add a stop, drag markers to move them, reorder with the arrows, then save the whole list. */
export function StopEditor({ route, canManage }: { route: RouteDetail; canManage: boolean }) {
  const qc = useQueryClient();
  const loaded = useRouteStops(route.id);
  const [draft, setDraft] = useState<EditableStop[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const base = useMemo(() => (loaded.data ?? []).map(toEditable), [loaded.data]);
  const stops = draft ?? base;
  const dirty = draft !== null;
  const update = (fn: (prev: EditableStop[]) => EditableStop[]) => setDraft(fn(stops));
  const patchStop = (key: string, changes: Partial<EditableStop>) => update((prev) => prev.map((s) => (s.key === key ? { ...s, ...changes } : s)));
  const move = (index: number, dir: -1 | 1) => update((prev) => {
    const next = [...prev];
    const j = index + dir;
    if (j < 0 || j >= next.length) return prev;
    [next[index], next[j]] = [next[j], next[index]];
    return next;
  });
  const remove = (index: number) => update((prev) => prev.filter((_, i) => i !== index));
  const addAt = (lat: number, lng: number) => {
    const key = newKey();
    update((prev) => [...prev, { key, name: `Stop ${prev.length + 1}`, latitude: Number(lat.toFixed(6)), longitude: Number(lng.toFixed(6)), address: "", landmark: "", planned_pickup_time: null, planned_dropoff_time: null, is_school_stop: false, wait_minutes: 1, student_count: null }]);
    setSelected(key);
  };
  const save = useMutation({
    mutationFn: (rows: EditableStop[]) => put<RouteStop[]>(`/routing/routes/${route.id}/stops/`, rows.map(({ key: _key, student_count: _sc, ...rest }) => rest)),
    onSuccess: () => {
      setDraft(null);
      invalidate(qc, "route-stops", "route", "routes", "opts-routes", "onboarding", "dashboard");
      message.success("Stops saved");
    },
    onError: (e) => message.error(errorMessage(e)),
  });
  const problems = useMemo(() => {
    const out: string[] = [];
    if (stops.length < 2) out.push("A route needs at least two stops.");
    stops.forEach((s, i) => {
      if (!s.name.trim()) out.push(`Stop ${i + 1} needs a name.`);
      if (!Number.isFinite(s.latitude) || Math.abs(s.latitude) > 90 || !Number.isFinite(s.longitude) || Math.abs(s.longitude) > 180) out.push(`Stop ${i + 1} has invalid coordinates.`);
    });
    return out;
  }, [stops]);
  const removedWithStudents = base.filter((b) => (b.student_count ?? 0) > 0 && !stops.some((s) => s.id === b.id));
  const mapStops: MapStop[] = stops.map((s, i) => ({ id: s.key, name: s.name || `Stop ${i + 1}`, latitude: s.latitude, longitude: s.longitude, sequence: i + 1, is_school_stop: s.is_school_stop, highlight: s.key === selected }));
  const path: [number, number][] = route.path.length > 1 && !dirty ? route.path : stops.map((s) => [s.latitude, s.longitude]);

  if (loaded.isLoading) return <LoadingSkeleton rows={8} />;
  if (loaded.isError) return <ErrorState error={loaded.error} onRetry={() => loaded.refetch()} />;

  return (
    <div className="sbp-stack">
      <div className="sbp-between">
        <Typography.Text type="secondary">{canManage ? "Click the map to add a stop at that point, drag a marker to move it, and reorder with the arrows. Saving replaces the whole list." : "Read-only: you do not have permission to edit stops."}</Typography.Text>
        {canManage && (
          <Space>
            {dirty && <Tag color="gold">Unsaved changes</Tag>}
            <Button disabled={!dirty} onClick={() => setDraft(null)}>Discard</Button>
            <Tooltip title={problems[0]}>
              <Button type="primary" disabled={!dirty || problems.length > 0} loading={save.isPending} onClick={() => save.mutate(stops)}>Save stops</Button>
            </Tooltip>
          </Space>
        )}
      </div>
      {removedWithStudents.length > 0 && <Alert type="warning" showIcon message={`${removedWithStudents.map((s) => s.name).join(", ")} ${removedWithStudents.length === 1 ? "has" : "have"} students assigned; removing them will need those students reassigned.`} />}
      {dirty && problems.length > 0 && <Alert type="error" showIcon message={problems.join(" ")} />}
      <Row gutter={[16, 16]}>
        <Col xs={24} xl={10} style={{ maxHeight: 640, overflow: "auto" }}>
          {stops.length === 0 ? (
            <Empty description="No stops yet. Click the map to place the first one." image={Empty.PRESENTED_IMAGE_SIMPLE} />
          ) : (
            <div className="sbp-stack">
              {stops.map((s, i) => (
                <Card key={s.key} size="small" onClick={() => setSelected(s.key)} style={{ borderColor: s.key === selected ? "var(--sbp-primary-hover)" : undefined, cursor: "pointer" }}
                  title={<span className="sbp-row"><Tag color={s.is_school_stop ? "geekblue" : "default"} style={{ marginInlineEnd: 0 }}>{i + 1}</Tag><span>{s.name || `Stop ${i + 1}`}</span>{(s.student_count ?? 0) > 0 && <span className="sbp-muted" style={{ fontSize: 12, fontWeight: 400 }}>{s.student_count} students</span>}</span>}
                  extra={canManage && (
                    <Space size={2} onClick={(e) => e.stopPropagation()}>
                      <Button size="small" type="text" icon={<ArrowUpOutlined />} aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)} />
                      <Button size="small" type="text" icon={<ArrowDownOutlined />} aria-label="Move down" disabled={i === stops.length - 1} onClick={() => move(i, 1)} />
                      <Button size="small" type="text" danger icon={<DeleteOutlined />} aria-label="Remove stop" onClick={() => remove(i)} />
                    </Space>
                  )}
                >
                  <Row gutter={[8, 8]}>
                    <Col span={24}><Input size="small" aria-label="Stop name" placeholder="Stop name" value={s.name} disabled={!canManage} onChange={(e) => patchStop(s.key, { name: e.target.value })} /></Col>
                    <Col span={14}><Input size="small" aria-label="Address" placeholder="Address" value={s.address} disabled={!canManage} onChange={(e) => patchStop(s.key, { address: e.target.value })} /></Col>
                    <Col span={10}><Input size="small" aria-label="Landmark" placeholder="Landmark" value={s.landmark} disabled={!canManage} onChange={(e) => patchStop(s.key, { landmark: e.target.value })} /></Col>
                    <Col span={8}><div className="sbp-muted" style={{ fontSize: 11 }}>Pickup</div><TimeInput label="Planned pickup time" value={s.planned_pickup_time} onChange={(v) => patchStop(s.key, { planned_pickup_time: v })} /></Col>
                    <Col span={8}><div className="sbp-muted" style={{ fontSize: 11 }}>Drop-off</div><TimeInput label="Planned drop-off time" value={s.planned_dropoff_time} onChange={(v) => patchStop(s.key, { planned_dropoff_time: v })} /></Col>
                    <Col span={8}><div className="sbp-muted" style={{ fontSize: 11 }}>Wait (min)</div><InputNumber size="small" aria-label="Wait minutes" min={0} max={60} style={{ width: "100%" }} value={s.wait_minutes} disabled={!canManage} onChange={(v) => patchStop(s.key, { wait_minutes: v ?? 0 })} /></Col>
                    <Col span={8}><div className="sbp-muted" style={{ fontSize: 11 }}>Latitude</div><InputNumber size="small" aria-label="Latitude" style={{ width: "100%" }} value={s.latitude} step={0.0001} precision={6} disabled={!canManage} onChange={(v) => patchStop(s.key, { latitude: v ?? 0 })} /></Col>
                    <Col span={8}><div className="sbp-muted" style={{ fontSize: 11 }}>Longitude</div><InputNumber size="small" aria-label="Longitude" style={{ width: "100%" }} value={s.longitude} step={0.0001} precision={6} disabled={!canManage} onChange={(v) => patchStop(s.key, { longitude: v ?? 0 })} /></Col>
                    <Col span={8}><div className="sbp-muted" style={{ fontSize: 11 }}>School stop</div><Switch size="small" aria-label="School stop" checked={s.is_school_stop} disabled={!canManage} onChange={(v) => patchStop(s.key, { is_school_stop: v })} /></Col>
                  </Row>
                </Card>
              ))}
            </div>
          )}
          {canManage && (
            <Button icon={<PlusOutlined />} style={{ marginTop: 12 }} onClick={() => { const last = stops[stops.length - 1]; addAt(last ? last.latitude + 0.004 : 12.9716, last ? last.longitude + 0.004 : 77.5946); }}>Add stop</Button>
          )}
        </Col>
        <Col xs={24} xl={14}>
          <BusMap
            height={640}
            colour={route.colour || "#1d4ed8"}
            stops={mapStops}
            path={path}
            fitKey={`${route.id}-${loaded.dataUpdatedAt}-${stops.length}`}
            onStopClick={(s) => setSelected(s.id)}
            onMapClick={canManage ? addAt : undefined}
            draggableStops={canManage}
            onStopDrag={(s, lat, lng) => patchStop(s.id, { latitude: Number(lat.toFixed(6)), longitude: Number(lng.toFixed(6)) })}
          />
        </Col>
      </Row>
    </div>
  );
}
