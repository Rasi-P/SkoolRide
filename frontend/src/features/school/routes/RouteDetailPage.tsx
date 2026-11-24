import { useState } from "react";
import { Alert, Button, Card, Col, Row, Space, Table, Tabs, Tag, message } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { errorMessage } from "@/api/client";
import { useAuth } from "@/app/auth";
import { BusMap } from "@/components/map/BusMap";
import { confirmAction } from "@/components/ui/ConfirmDialog";
import { KeyValue } from "@/components/ui/Misc";
import { PageHeader } from "@/components/ui/PageHeader";
import { QueryState } from "@/components/ui/States";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { fmtDate, fmtTime } from "@/lib/format";
import { del, get, invalidate, post } from "../api";
import { AuditTable } from "../components/AuditChanges";
import { ReasonModal } from "../components/ReasonModal";
import { AssignTransportDrawer } from "../students/AssignTransportDrawer";
import type { RouteDetail, RouteHistory, TransportAssignment } from "../types";
import { RouteFormDrawer } from "./RouteForm";
import { SchedulesTab } from "./SchedulesTab";
import { StopEditor } from "./StopEditor";

function StudentsTab({ route, canManage }: { route: RouteDetail; canManage: boolean }) {
  const qc = useQueryClient();
  const students = useQuery({ queryKey: ["route-students", route.id], queryFn: () => get<TransportAssignment[]>(`/routing/routes/${route.id}/students/`) });
  const [reassign, setReassign] = useState<TransportAssignment | null>(null);
  const [adding, setAdding] = useState(false);
  const [ending, setEnding] = useState<TransportAssignment | null>(null);
  const end = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => post(`/routing/assignments/${id}/end/`, { reason }),
    onSuccess: () => {
      invalidate(qc, "route-students", "route", "routes", "assignments", "students", "student", "route-stops", "dashboard");
      message.success("Assignment ended");
      setEnding(null);
    },
    onError: (e) => message.error(errorMessage(e)),
  });
  const columns: ColumnsType<TransportAssignment> = [
    { title: "Student", dataIndex: "student_name", render: (v: string, r) => <Link to={`/school/students/${r.student}`}>{v}</Link> },
    { title: "Class", dataIndex: "student_class", width: 80 },
    { title: "Admission no", dataIndex: "student_admission_number", width: 130 },
    { title: "Pickup stop", dataIndex: "pickup_stop_name", render: (v: string | null, r) => (r.uses_pickup ? v ?? "-" : <span className="sbp-muted">Not using</span>) },
    { title: "Drop-off stop", dataIndex: "dropoff_stop_name", render: (v: string | null, r) => (r.uses_dropoff ? v ?? "-" : <span className="sbp-muted">Not using</span>) },
    { title: "Since", dataIndex: "start_date", width: 120, render: (v: string) => fmtDate(v) },
    ...(canManage ? [{ title: "", key: "actions", width: 170, render: (_: unknown, r: TransportAssignment) => <Space><Button size="small" onClick={() => setReassign(r)}>Reassign</Button><Button size="small" danger onClick={() => setEnding(r)}>End</Button></Space> }] : []),
  ];
  return (
    <div className="sbp-stack">
      <div className="sbp-between">
        <span className="sbp-muted">{route.student_count} active students{route.vehicle_capacity !== null ? ` · vehicle capacity ${route.vehicle_capacity}` : ""}</span>
        {canManage && <Button icon={<PlusOutlined />} onClick={() => setAdding(true)}>Assign student</Button>}
      </div>
      {route.capacity_warning && <Alert type="warning" showIcon message={route.capacity_warning} />}
      <QueryState query={students} isEmpty={(d) => d.length === 0} emptyTitle="No students on this route" emptyDescription="Assign students from the Students page or with the button above.">
        {(rows) => <div className="sbp-surface"><Table rowKey="id" size="small" columns={columns} dataSource={rows} pagination={rows.length > 25 ? { pageSize: 25 } : false} /></div>}
      </QueryState>
      <AssignTransportDrawer open={!!reassign} current={reassign} onClose={() => setReassign(null)} />
      <AssignTransportDrawer open={adding} presetRoute={route.id} onClose={() => setAdding(false)} />
      <ReasonModal open={!!ending} title={`End ${ending?.student_name ?? ""}'s assignment on ${route.code}?`} description="The student stops appearing on this route's trips from today. The assignment is kept in history." okText="End assignment" danger required={false} loading={end.isPending} onCancel={() => setEnding(null)} onSubmit={(reason) => ending && end.mutate({ id: ending.id, reason })} />
    </div>
  );
}

function HistoryTab({ routeId }: { routeId: string }) {
  const history = useQuery({ queryKey: ["route-history", routeId], queryFn: () => get<RouteHistory>(`/routing/routes/${routeId}/history/`) });
  const columns: ColumnsType<TransportAssignment> = [
    { title: "Student", dataIndex: "student_name", render: (v: string, r) => <Link to={`/school/students/${r.student}`}>{v}</Link> },
    { title: "Pickup stop", dataIndex: "pickup_stop_name", render: (v: string | null) => v ?? "-" },
    { title: "From", dataIndex: "start_date", width: 120, render: (v: string) => fmtDate(v) },
    { title: "To", dataIndex: "end_date", width: 120, render: (v: string | null) => fmtDate(v) },
    { title: "Reason", dataIndex: "ended_reason" },
  ];
  return (
    <QueryState query={history}>
      {(h) => (
        <Row gutter={[16, 16]}>
          <Col xs={24} xl={12}><Card size="small" title="Change log"><AuditTable rows={h.audit} /></Card></Col>
          <Col xs={24} xl={12}><Card size="small" title="Past assignments"><Table rowKey="id" size="small" columns={columns} dataSource={h.past_assignments} pagination={h.past_assignments.length > 10 ? { pageSize: 10 } : false} locale={{ emptyText: "No past assignments" }} /></Card></Col>
        </Row>
      )}
    </QueryState>
  );
}

export default function RouteDetailPage() {
  const { id = "" } = useParams();
  const { hasPerm } = useAuth();
  const canManage = hasPerm("routes.manage");
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const route = useQuery({ queryKey: ["route", id], queryFn: () => get<RouteDetail>(`/routing/routes/${id}/`), enabled: !!id });
  const [editing, setEditing] = useState(false);
  const deactivate = useMutation({
    mutationFn: () => del(`/routing/routes/${id}/`),
    onSuccess: () => { invalidate(qc, "routes", "route", "opts-routes"); message.success("Route deactivated"); navigate("/school/routes"); },
    onError: (e) => message.error(errorMessage(e)),
  });
  return (
    <QueryState query={route}>
      {(r) => (
        <div>
          <PageHeader
            crumbs={[{ label: "Routes", to: "/school/routes" }, { label: r.code }]}
            title={<span className="sbp-row"><span aria-hidden style={{ width: 14, height: 14, borderRadius: 4, background: r.colour || "#1d4ed8" }} />{r.code} · {r.name} <StatusBadge status={r.is_active ? "ACTIVE" : "INACTIVE"} /></span>}
            subtitle={`${r.stop_count} stops · ${r.student_count} students${r.distance_km ? ` · ${r.distance_km} km` : ""}${r.estimated_duration_minutes ? ` · ~${r.estimated_duration_minutes} min` : ""} · version ${r.version}`}
            extra={canManage && (
              <>
                {r.is_active && <Button danger onClick={() => confirmAction({ title: `Deactivate route ${r.code}?`, content: "Routes with active student assignments cannot be deactivated. Trips already generated are kept.", okText: "Deactivate", danger: true, onOk: () => deactivate.mutateAsync() })}>Deactivate</Button>}
                <Button type="primary" onClick={() => setEditing(true)}>Edit route</Button>
              </>
            )}
          />
          {r.capacity_warning && <Alert type="warning" showIcon style={{ marginBottom: 16 }} message={r.capacity_warning} />}
          <Tabs
            activeKey={params.get("tab") || "overview"}
            onChange={(k) => setParams({ tab: k })}
            items={[
              {
                key: "overview", label: "Overview",
                children: (
                  <Row gutter={[16, 16]}>
                    <Col xs={24} lg={10}>
                      <Card size="small" title="Route">
                        <KeyValue items={[
                          { label: "Description", value: r.description || "-" },
                          { label: "Vehicle", value: r.vehicle ? <Link to={`/school/vehicles/${r.vehicle}`}>{r.vehicle_registration}{r.vehicle_fleet_number ? ` (Bus ${r.vehicle_fleet_number})` : ""}</Link> : <Tag color="orange">Not assigned</Tag> },
                          { label: "Capacity", value: r.vehicle_capacity !== null ? `${r.student_count} / ${r.vehicle_capacity}` : "-" },
                          { label: "Driver", value: r.driver ? <Link to={`/school/staff/${r.driver}`}>{r.driver_name}</Link> : "-" },
                          { label: "Attendant", value: r.attendant ? <Link to={`/school/staff/${r.attendant}`}>{r.attendant_name}</Link> : "-" },
                          { label: "Schedules", value: r.schedules.length ? r.schedules.map((s) => <div key={s.id}>{s.direction === "PICKUP" ? "Pickup" : "Drop-off"} {fmtTime(s.start_time)}{s.is_active ? "" : " (inactive)"}</div>) : "None" },
                          { label: "Stops", value: r.stops.length ? r.stops.map((s) => <div key={s.id}>{s.sequence}. {s.name}{s.planned_pickup_time ? ` · ${fmtTime(s.planned_pickup_time)}` : ""}</div>) : "None" },
                          { label: "Updated", value: fmtDate(r.updated_at) },
                        ]} />
                      </Card>
                    </Col>
                    <Col xs={24} lg={14}>
                      <BusMap height={460} colour={r.colour || "#1d4ed8"} path={r.path.length > 1 ? r.path : r.stops.map((s) => [Number(s.latitude), Number(s.longitude)] as [number, number])} stops={r.stops.map((s) => ({ id: s.id, name: s.name, latitude: Number(s.latitude), longitude: Number(s.longitude), sequence: s.sequence, is_school_stop: s.is_school_stop }))} fitKey={`${r.id}-${r.version}`} />
                    </Col>
                  </Row>
                ),
              },
              { key: "stops", label: `Stops (${r.stop_count})`, children: <StopEditor route={r} canManage={canManage} /> },
              { key: "schedules", label: "Schedules", children: <SchedulesTab routeId={r.id} canManage={canManage} /> },
              { key: "students", label: `Students (${r.student_count})`, children: <StudentsTab route={r} canManage={canManage} /> },
              { key: "history", label: "History", children: <HistoryTab routeId={r.id} /> },
            ]}
          />
          <RouteFormDrawer open={editing} route={r} onClose={() => setEditing(false)} />
        </div>
      )}
    </QueryState>
  );
}
