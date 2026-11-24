import { useEffect, useState } from "react";
import { Button, Col, Drawer, Modal, Row, Space, Tag, Typography, message } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { z } from "zod";
import { fieldErrors } from "@/api/client";
import { useAuth } from "@/app/auth";
import { SelectField, SwitchField, TextAreaField, TextField, applyServerErrors, useZodForm } from "@/components/forms/fields";
import { DataTable } from "@/components/ui/DataTable";
import { FilterSelect } from "@/components/ui/FilterSelect";
import { KeyValue } from "@/components/ui/Misc";
import { PageHeader } from "@/components/ui/PageHeader";
import { InlineError } from "@/components/ui/States";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useTableParams } from "@/hooks/usePagedQuery";
import { dayjs, fmtDate, fmtDateTime, fmtTime, titleCase } from "@/lib/format";
import type { Trip } from "@/types";
import { invalidate, post } from "../api";
import { DateTimeField } from "../components/ExtraFields";
import { FormDrawer } from "../components/FormDrawer";
import { RemoteSelect, RemoteSelectField } from "../components/RemoteSelect";
import { INCIDENT_CATEGORY, INCIDENT_SEVERITY, INCIDENT_STATUS } from "../constants";
import { useVehicleOptions, vehicleLabel } from "../hooks";
import type { Incident, Student } from "../types";

const createSchema = z.object({
  category: z.string().min(1, "Select a category"),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  title: z.string().trim().min(3, "Title is required"),
  description: z.string().trim().min(5, "Describe what happened"),
  occurred_at: z.string({ invalid_type_error: "When did it happen?" }).min(1, "When did it happen?"),
  vehicle: z.string().nullable().optional(),
  trip: z.string().nullable().optional(),
  is_emergency: z.boolean(),
});
const resolveSchema = z.object({ status: z.enum(["INVESTIGATING", "RESOLVED", "CLOSED"]), resolution_notes: z.string().optional() });

function CreateIncidentDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const vehicles = useVehicleOptions();
  const [students, setStudents] = useState<string[]>([]);
  const form = useZodForm(createSchema, { defaultValues: { category: "OTHER", severity: "MEDIUM", title: "", description: "", occurred_at: dayjs().toISOString(), vehicle: null, trip: null, is_emergency: false } });
  useEffect(() => {
    if (open) { form.reset({ category: "OTHER", severity: "MEDIUM", title: "", description: "", occurred_at: dayjs().toISOString(), vehicle: null, trip: null, is_emergency: false }); setStudents([]); }
  }, [open, form]);
  const create = useMutation({
    mutationFn: (d: z.input<typeof createSchema>) => post<Incident>("/trips/incidents/", { ...d, vehicle: d.vehicle || null, trip: d.trip || null, students }),
    onSuccess: () => { invalidate(qc, "incidents", "dashboard"); message.success("Incident reported"); onClose(); },
    onError: (e) => applyServerErrors(form.setError, fieldErrors(e)),
  });
  const c = form.control;
  return (
    <FormDrawer open={open} title="Report incident" onClose={onClose} onSubmit={form.handleSubmit((d) => create.mutate(d))} submitting={create.isPending} error={create.isError ? create.error : undefined} submitLabel="Report incident">
      <Row gutter={16}>
        <Col span={12}><SelectField control={c} name="category" label="Category" required options={INCIDENT_CATEGORY} allowClear={false} /></Col>
        <Col span={12}><SelectField control={c} name="severity" label="Severity" required options={INCIDENT_SEVERITY} allowClear={false} /></Col>
        <Col span={24}><TextField control={c} name="title" label="Title" required /></Col>
        <Col span={24}><TextAreaField control={c} name="description" label="What happened" required rows={4} /></Col>
        <Col span={12}><DateTimeField control={c} name="occurred_at" label="Occurred at" required /></Col>
        <Col span={12}><SelectField control={c} name="vehicle" label="Vehicle" loading={vehicles.isLoading} options={(vehicles.data ?? []).map((v) => ({ value: v.id, label: vehicleLabel(v) }))} /></Col>
        <Col span={24}><RemoteSelectField<z.input<typeof createSchema>, Trip> control={c} name="trip" label="Trip (optional)" path="/trips/trips/" queryKey="trips" params={{ ordering: "-scheduled_date" }} toOption={(t) => ({ value: t.id, label: `${fmtDate(t.scheduled_date)} ${fmtTime(t.scheduled_start_time)} · ${t.route_code} ${t.direction === "PICKUP" ? "pickup" : "drop-off"}${t.vehicle_registration ? ` · ${t.vehicle_registration}` : ""}` })} placeholder="Search trips by route or vehicle" /></Col>
        <Col span={24}>
          <div style={{ marginBottom: 6, fontWeight: 500 }}>Students involved (optional)</div>
          <div style={{ marginBottom: 16 }}><RemoteSelect<Student> path="/people/students/" queryKey="students" toOption={(s) => ({ value: s.id, label: `${s.full_name} · ${s.class_label}` })} mode="multiple" values={students} onChangeMany={setStudents} onChange={() => undefined} placeholder="Search students" /></div>
        </Col>
        <Col span={24}><SwitchField control={c} name="is_emergency" label="Emergency" help="Emergencies alert school admins and parents on the trip immediately." /></Col>
      </Row>
    </FormDrawer>
  );
}

function IncidentDrawer({ incident, onClose, canManage }: { incident: Incident | null; onClose: () => void; canManage: boolean }) {
  const qc = useQueryClient();
  const [resolving, setResolving] = useState(false);
  const form = useZodForm(resolveSchema, { defaultValues: { status: "INVESTIGATING", resolution_notes: "" } });
  useEffect(() => {
    if (incident) form.reset({ status: incident.status === "OPEN" ? "INVESTIGATING" : incident.status === "INVESTIGATING" ? "RESOLVED" : incident.status === "RESOLVED" ? "CLOSED" : "CLOSED", resolution_notes: incident.resolution_notes });
  }, [incident, form]);
  const resolve = useMutation({
    mutationFn: (d: z.input<typeof resolveSchema>) => post<Incident>(`/trips/incidents/${incident?.id}/resolve/`, d),
    onSuccess: () => { invalidate(qc, "incidents", "dashboard"); message.success("Incident updated"); setResolving(false); onClose(); },
    onError: (e) => applyServerErrors(form.setError, fieldErrors(e)),
  });
  return (
    <Drawer open={!!incident} onClose={onClose} width={620} title={incident?.title} destroyOnHidden extra={canManage && incident && incident.status !== "CLOSED" && <Button type="primary" onClick={() => setResolving(true)}>Update status</Button>}>
      {incident && (
        <div className="sbp-stack">
          <Space wrap><StatusBadge status={incident.status} /><StatusBadge status={incident.severity} label={`${titleCase(incident.severity)} severity`} /><Tag>{titleCase(incident.category)}</Tag>{incident.is_emergency && <Tag color="red">Emergency</Tag>}</Space>
          <KeyValue items={[
            { label: "Occurred", value: fmtDateTime(incident.occurred_at) },
            { label: "Reported by", value: incident.reported_by_name ?? "-" },
            { label: "Vehicle", value: incident.vehicle ? <Link to={`/school/vehicles/${incident.vehicle}`}>{incident.vehicle_registration}</Link> : "-" },
            { label: "Trip", value: incident.trip ? <Link to={`/school/trips/${incident.trip}`}>{incident.route_code ?? "Open trip"}</Link> : "-" },
            { label: "Students", value: incident.student_names.length ? incident.student_names.join(", ") : "-" },
            { label: "Location", value: incident.latitude != null && incident.longitude != null ? `${incident.latitude.toFixed(5)}, ${incident.longitude.toFixed(5)}` : "-" },
            { label: "Resolved", value: incident.resolved_at ? `${fmtDateTime(incident.resolved_at)} by ${incident.resolved_by_name ?? "-"}` : "-" },
          ]} />
          <Typography.Paragraph style={{ whiteSpace: "pre-wrap" }}>{incident.description}</Typography.Paragraph>
          {incident.resolution_notes && <Typography.Paragraph type="secondary" style={{ whiteSpace: "pre-wrap" }}><strong>Resolution:</strong> {incident.resolution_notes}</Typography.Paragraph>}
        </div>
      )}
      <Modal open={resolving} title="Update incident status" okText="Save" confirmLoading={resolve.isPending} onCancel={() => setResolving(false)} onOk={form.handleSubmit((d) => resolve.mutate(d))} centered destroyOnHidden>
        <form noValidate onSubmit={form.handleSubmit((d) => resolve.mutate(d))}>
          <InlineError error={resolve.isError ? resolve.error : undefined} />
          <SelectField control={form.control} name="status" label="Status" required allowClear={false} options={INCIDENT_STATUS.filter((o) => o.value !== "OPEN")} />
          <TextAreaField control={form.control} name="resolution_notes" label="Resolution notes" rows={3} />
        </form>
      </Modal>
    </Drawer>
  );
}

export default function IncidentsPage() {
  const { hasPerm } = useAuth();
  const canReport = hasPerm("incidents.report");
  const canManage = hasPerm("engagement.manage");
  const [params, setParams] = useSearchParams();
  const state = useTableParams({ ordering: "-occurred_at" });
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<Incident | null>(null);
  const columns: ColumnsType<Incident> = [
    { title: "Occurred", dataIndex: "occurred_at", sorter: true, width: 160, render: (v: string) => fmtDateTime(v) },
    { title: "Incident", dataIndex: "title", render: (v: string, r) => <span style={{ fontWeight: 600 }}>{v} {r.is_emergency && <Tag color="red" style={{ fontSize: 11 }}>Emergency</Tag>}</span> },
    { title: "Category", dataIndex: "category", width: 150, render: (v: string) => titleCase(v) },
    { title: "Severity", dataIndex: "severity", sorter: true, width: 110, render: (v: string) => <StatusBadge status={v} /> },
    { title: "Status", dataIndex: "status", sorter: true, width: 130, render: (v: string) => <StatusBadge status={v} /> },
    { title: "Vehicle", dataIndex: "vehicle_registration", width: 130, render: (v: string | null) => v ?? "-" },
    { title: "Route", dataIndex: "route_code", width: 90, render: (v: string | null) => v ?? "-" },
    { title: "Reported by", dataIndex: "reported_by_name", width: 150, render: (v: string | null) => v ?? "-" },
    { title: "Students", key: "students", width: 160, render: (_, r) => (r.student_names.length ? r.student_names.join(", ") : <span className="sbp-muted">-</span>) },
  ];
  return (
    <div>
      <PageHeader title="Incidents" subtitle="Breakdowns, delays, safety concerns and emergencies reported by crew and staff." extra={canReport && <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>Report incident</Button>} />
      <DataTable<Incident>
        queryKey="incidents"
        path="/trips/incidents/"
        columns={columns}
        tableState={state}
        searchPlaceholder="Search title or description"
        exportPath="/trips/incidents/export/"
        exportFilename="incidents.csv"
        initialOrdering="-occurred_at"
        emptyTitle="No incidents reported"
        scrollX={1200}
        filters={
          <>
            <FilterSelect value={state.params.status} onChange={(v) => state.setFilter("status", v)} options={INCIDENT_STATUS} placeholder="Status" width={140} />
            <FilterSelect value={state.params.category} onChange={(v) => state.setFilter("category", v)} options={INCIDENT_CATEGORY} placeholder="Category" width={160} />
            <FilterSelect value={state.params.severity} onChange={(v) => state.setFilter("severity", v)} options={INCIDENT_SEVERITY} placeholder="Severity" width={120} />
            <FilterSelect value={state.params.is_emergency} onChange={(v) => state.setFilter("is_emergency", v)} options={[{ value: "true", label: "Emergencies only" }]} placeholder="Emergency" width={150} />
          </>
        }
        onRow={(r) => ({ onClick: () => { setSelected(r); setParams({ open: r.id }); }, style: { cursor: "pointer" } })}
      />
      <IncidentDrawer incident={selected} onClose={() => { setSelected(null); if (params.get("open")) setParams({}); }} canManage={canManage} />
      <CreateIncidentDrawer open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}
