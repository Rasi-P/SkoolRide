import { DocumentLink } from "@/components/ui/ProtectedMedia";
import { useState } from "react";
import { Alert, Button, Card, Col, Dropdown, List, Row, Space, Table, Tabs, Tag, Typography, Upload, message } from "antd";
import { DownOutlined, PlusOutlined, UploadOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { z } from "zod";
import { errorMessage, fieldErrors } from "@/api/client";
import { useAuth } from "@/app/auth";
import { DateField, NumberField, SelectField, TextAreaField, TextField, applyServerErrors, useZodForm } from "@/components/forms/fields";
import { confirmAction } from "@/components/ui/ConfirmDialog";
import { KeyValue } from "@/components/ui/Misc";
import { PageHeader } from "@/components/ui/PageHeader";
import { QueryState } from "@/components/ui/States";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { fmtDate, fmtDateTime, fmtMoney, titleCase } from "@/lib/format";
import { get, invalidate, post, toFormData } from "../api";
import { AuditTable } from "../components/AuditChanges";
import { FormDrawer } from "../components/FormDrawer";
import { MAINTENANCE_CATEGORY, VEHICLE_DOC_TYPE } from "../constants";
import { staffLabel, useStaffOptions } from "../hooks";
import type { StaffVehicleAssignment, Vehicle, VehicleDocument, VehicleHistory, VehicleMaintenance } from "../types";
import { VehicleFormDrawer } from "./VehicleForm";

const docSchema = z.object({
  doc_type: z.string().min(1, "Select a document type"),
  title: z.string().min(2, "Title is required"),
  number: z.string().optional(),
  issued_on: z.string().nullable().optional(),
  expires_on: z.string().nullable().optional(),
  notes: z.string().optional(),
});
const maintSchema = z.object({
  category: z.string().min(1, "Select a category"),
  description: z.string().min(3, "Describe the work done"),
  performed_on: z.string({ invalid_type_error: "Date is required" }).min(1, "Date is required"),
  cost: z.number({ invalid_type_error: "Enter the cost" }).min(0),
  odometer_km: z.number().min(0).nullable().optional(),
  vendor: z.string().optional(),
  next_due_on: z.string().nullable().optional(),
});
const assignSchema = z.object({
  staff: z.string({ invalid_type_error: "Select a staff member" }).min(1, "Select a staff member"),
  role: z.enum(["DRIVER", "ATTENDANT"]),
  start_date: z.string().nullable().optional(),
  notes: z.string().optional(),
});

function DocumentsTab({ vehicle, canManage }: { vehicle: Vehicle; canManage: boolean }) {
  const qc = useQueryClient();
  const docs = useQuery({ queryKey: ["vehicle-docs", vehicle.id], queryFn: () => get<VehicleDocument[]>(`/fleet/vehicles/${vehicle.id}/documents/`) });
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const form = useZodForm(docSchema, { defaultValues: { doc_type: "INSURANCE", title: "", number: "", issued_on: null, expires_on: null, notes: "" } });
  const add = useMutation({
    mutationFn: (d: z.input<typeof docSchema>) => post<VehicleDocument>(`/fleet/vehicles/${vehicle.id}/documents/`, file ? toFormData({ ...d, file }) : d, file ? { headers: { "Content-Type": "multipart/form-data" } } : undefined),
    onSuccess: () => {
      invalidate(qc, "vehicle-docs", "vehicle", "vehicles", "dashboard");
      message.success("Document added");
      setOpen(false);
      setFile(null);
      form.reset();
    },
    onError: (e) => applyServerErrors(form.setError, fieldErrors(e)),
  });
  const columns: ColumnsType<VehicleDocument> = [
    { title: "Type", dataIndex: "doc_type", render: (v: string) => titleCase(v), width: 150 },
    { title: "Title", dataIndex: "title" },
    { title: "Number", dataIndex: "number" },
    { title: "Issued", dataIndex: "issued_on", render: (v: string | null) => fmtDate(v), width: 120 },
    { title: "Expires", dataIndex: "expires_on", width: 160, render: (v: string | null, r) => (v ? <span style={{ color: r.is_expired ? "var(--sbp-danger)" : undefined }}>{fmtDate(v)}{r.is_expired && <Tag color="red" style={{ marginLeft: 8 }}>Expired</Tag>}</span> : "-") },
    { title: "File", dataIndex: "file", width: 90, render: (v: string | null) => (v ? <DocumentLink src={v} /> : "-") },
  ];
  return (
    <div className="sbp-stack">
      <div className="sbp-between">
        <Typography.Text type="secondary">Scanned certificates and permits. Expiry dates feed the document alerts.</Typography.Text>
        {canManage && <Button icon={<PlusOutlined />} onClick={() => setOpen(true)}>Add document</Button>}
      </div>
      <QueryState query={docs} isEmpty={(d) => d.length === 0} emptyTitle="No documents uploaded" emptyDescription="Registration, insurance, permit and fitness certificates can be tracked here.">
        {(rows) => <div className="sbp-surface"><Table rowKey="id" size="small" columns={columns} dataSource={rows} pagination={false} /></div>}
      </QueryState>
      <FormDrawer open={open} title="Add vehicle document" onClose={() => setOpen(false)} onSubmit={form.handleSubmit((d) => add.mutate(d))} submitting={add.isPending} error={add.isError ? add.error : undefined} submitLabel="Add document">
        <SelectField control={form.control} name="doc_type" label="Document type" required options={VEHICLE_DOC_TYPE} allowClear={false} />
        <TextField control={form.control} name="title" label="Title" required />
        <TextField control={form.control} name="number" label="Document number" />
        <Row gutter={16}>
          <Col span={12}><DateField control={form.control} name="issued_on" label="Issued on" /></Col>
          <Col span={12}><DateField control={form.control} name="expires_on" label="Expires on" /></Col>
        </Row>
        <TextAreaField control={form.control} name="notes" label="Notes" rows={2} />
        <div style={{ marginBottom: 16 }}>
          <Upload maxCount={1} beforeUpload={(f) => { setFile(f); return false; }} onRemove={() => setFile(null)} accept=".pdf,.jpg,.jpeg,.png">
            <Button icon={<UploadOutlined />}>Attach scan (optional)</Button>
          </Upload>
        </div>
      </FormDrawer>
    </div>
  );
}

function MaintenanceTab({ vehicle, canManage }: { vehicle: Vehicle; canManage: boolean }) {
  const qc = useQueryClient();
  const rows = useQuery({ queryKey: ["vehicle-maint", vehicle.id], queryFn: () => get<VehicleMaintenance[]>(`/fleet/vehicles/${vehicle.id}/maintenance/`) });
  const [open, setOpen] = useState(false);
  const form = useZodForm(maintSchema, { defaultValues: { category: "SERVICE", description: "", performed_on: "", cost: 0, odometer_km: vehicle.odometer_km, vendor: "", next_due_on: null } });
  const add = useMutation({
    mutationFn: (d: z.input<typeof maintSchema>) => post<VehicleMaintenance>(`/fleet/vehicles/${vehicle.id}/maintenance/`, d),
    onSuccess: () => {
      invalidate(qc, "vehicle-maint", "vehicle", "vehicles", "dashboard");
      message.success("Maintenance logged; service dates updated");
      setOpen(false);
      form.reset();
    },
    onError: (e) => applyServerErrors(form.setError, fieldErrors(e)),
  });
  const columns: ColumnsType<VehicleMaintenance> = [
    { title: "Date", dataIndex: "performed_on", render: (v: string) => fmtDate(v), width: 120 },
    { title: "Category", dataIndex: "category", render: (v: string) => titleCase(v), width: 130 },
    { title: "Description", dataIndex: "description" },
    { title: "Vendor", dataIndex: "vendor", width: 140 },
    { title: "Odometer", dataIndex: "odometer_km", width: 110, align: "right", render: (v: number | null) => (v ? `${v.toLocaleString()} km` : "-") },
    { title: "Cost", dataIndex: "cost", width: 120, align: "right", render: (v: string) => fmtMoney(v) },
    { title: "Next due", dataIndex: "next_due_on", width: 120, render: (v: string | null) => fmtDate(v) },
  ];
  return (
    <div className="sbp-stack">
      <div className="sbp-between">
        <Typography.Text type="secondary">Logging a service updates the vehicle's last service date, odometer and next due date.</Typography.Text>
        {canManage && <Button icon={<PlusOutlined />} onClick={() => setOpen(true)}>Log maintenance</Button>}
      </div>
      <QueryState query={rows} isEmpty={(d) => d.length === 0} emptyTitle="No maintenance records">
        {(data) => <div className="sbp-surface"><Table rowKey="id" size="small" columns={columns} dataSource={data} pagination={false} /></div>}
      </QueryState>
      <FormDrawer open={open} title="Log maintenance" onClose={() => setOpen(false)} onSubmit={form.handleSubmit((d) => add.mutate(d))} submitting={add.isPending} error={add.isError ? add.error : undefined} submitLabel="Save record">
        <SelectField control={form.control} name="category" label="Category" required options={MAINTENANCE_CATEGORY} allowClear={false} />
        <TextAreaField control={form.control} name="description" label="Work done" required rows={2} />
        <Row gutter={16}>
          <Col span={12}><DateField control={form.control} name="performed_on" label="Performed on" required /></Col>
          <Col span={12}><DateField control={form.control} name="next_due_on" label="Next service due" /></Col>
          <Col span={12}><NumberField control={form.control} name="cost" label="Cost" required min={0} /></Col>
          <Col span={12}><NumberField control={form.control} name="odometer_km" label="Odometer (km)" min={0} /></Col>
        </Row>
        <TextField control={form.control} name="vendor" label="Vendor / garage" />
      </FormDrawer>
    </div>
  );
}

function StaffTab({ vehicle, canManage }: { vehicle: Vehicle; canManage: boolean }) {
  const qc = useQueryClient();
  const [role, setRole] = useState<"DRIVER" | "ATTENDANT" | null>(null);
  const staff = useStaffOptions(role ?? undefined);
  const form = useZodForm(assignSchema, { defaultValues: { staff: "", role: "DRIVER", start_date: null, notes: "" } });
  const assign = useMutation({
    mutationFn: (d: z.input<typeof assignSchema>) => post<StaffVehicleAssignment>(`/fleet/vehicles/${vehicle.id}/assign-staff/`, d),
    onSuccess: () => {
      invalidate(qc, "vehicle", "vehicles", "vehicle-history", "opts-staff", "dashboard");
      message.success("Assignment saved");
      setRole(null);
      form.reset();
    },
    onError: (e) => applyServerErrors(form.setError, fieldErrors(e)),
  });
  const end = useMutation({
    mutationFn: (assignmentId: string) => post(`/fleet/staff-assignments/${assignmentId}/end/`),
    onSuccess: () => {
      invalidate(qc, "vehicle", "vehicles", "vehicle-history", "dashboard");
      message.success("Assignment ended");
    },
    onError: (e) => message.error(errorMessage(e)),
  });
  const openFor = (r: "DRIVER" | "ATTENDANT") => {
    form.reset({ staff: "", role: r, start_date: null, notes: "" });
    setRole(r);
  };
  const slot = (label: string, r: "DRIVER" | "ATTENDANT", current: Vehicle["driver"] | Vehicle["attendant"]) => (
    <Card size="small" title={label}>
      {current ? (
        <div className="sbp-between">
          <div>
            <div style={{ fontWeight: 600 }}>{current.name}</div>
            <div className="sbp-muted" style={{ fontSize: 13 }}>{current.phone || "No phone"}{"licence_expired" in current && current.licence_expired && <Tag color="red" style={{ marginLeft: 8 }}>Licence expired</Tag>}</div>
          </div>
          {canManage && (
            <Space>
              <Button size="small" onClick={() => openFor(r)}>Replace</Button>
              <Button size="small" danger onClick={() => confirmAction({ title: `End ${label.toLowerCase()} assignment?`, content: `${current.name} will no longer be assigned to ${vehicle.registration_number}.`, okText: "End assignment", danger: true, onOk: () => end.mutateAsync(current.assignment_id) })}>End</Button>
            </Space>
          )}
        </div>
      ) : (
        <div className="sbp-between">
          <span className="sbp-muted">Not assigned</span>
          {canManage && <Button size="small" type="primary" onClick={() => openFor(r)}>Assign {label.toLowerCase()}</Button>}
        </div>
      )}
    </Card>
  );
  return (
    <div className="sbp-stack">
      <Row gutter={[16, 16]}>
        <Col xs={24} md={12}>{slot("Driver", "DRIVER", vehicle.driver)}</Col>
        <Col xs={24} md={12}>{slot("Attendant", "ATTENDANT", vehicle.attendant)}</Col>
      </Row>
      <FormDrawer open={role !== null} title={`Assign ${role === "ATTENDANT" ? "attendant" : "driver"}`} onClose={() => setRole(null)} onSubmit={form.handleSubmit((d) => assign.mutate(d))} submitting={assign.isPending} error={assign.isError ? assign.error : undefined} submitLabel="Assign">
        <SelectField control={form.control} name="staff" label={role === "ATTENDANT" ? "Attendant" : "Driver"} required loading={staff.isLoading} options={(staff.data ?? []).map((s) => ({ value: s.id, label: `${staffLabel(s)}${s.current_vehicle ? ` - on ${s.current_vehicle.registration_number}` : ""}${s.licence_expired && s.staff_type === "DRIVER" ? " - licence expired" : ""}` }))} help="Active staff of the matching type. Assigning moves them off any other vehicle." />
        <DateField control={form.control} name="start_date" label="Start date" help="Defaults to today" />
        <TextAreaField control={form.control} name="notes" label="Notes" rows={2} />
      </FormDrawer>
    </div>
  );
}

function HistoryTab({ vehicleId }: { vehicleId: string }) {
  const history = useQuery({ queryKey: ["vehicle-history", vehicleId], queryFn: () => get<VehicleHistory>(`/fleet/vehicles/${vehicleId}/history/`) });
  const columns: ColumnsType<StaffVehicleAssignment> = [
    { title: "Staff", dataIndex: "staff_name" },
    { title: "Role", dataIndex: "role", render: (v: string) => titleCase(v), width: 120 },
    { title: "From", dataIndex: "start_date", render: (v: string) => fmtDate(v), width: 120 },
    { title: "To", dataIndex: "end_date", render: (v: string | null) => fmtDate(v), width: 120 },
    { title: "Status", dataIndex: "is_active", width: 110, render: (v: boolean) => <StatusBadge status={v ? "ACTIVE" : "INACTIVE"} label={v ? "Current" : "Ended"} /> },
    { title: "Notes", dataIndex: "notes" },
  ];
  return (
    <QueryState query={history}>
      {(h) => (
        <Row gutter={[16, 16]}>
          <Col xs={24} xl={12}><Card size="small" title="Crew assignments"><Table rowKey="id" size="small" columns={columns} dataSource={h.assignments} pagination={false} locale={{ emptyText: "No assignments yet" }} /></Card></Col>
          <Col xs={24} xl={12}><Card size="small" title="Audit trail"><AuditTable rows={h.audit} /></Card></Col>
        </Row>
      )}
    </QueryState>
  );
}

export default function VehicleDetailPage() {
  const { id = "" } = useParams();
  const { hasPerm } = useAuth();
  const canManage = hasPerm("vehicles.manage");
  const qc = useQueryClient();
  const vehicle = useQuery({ queryKey: ["vehicle", id], queryFn: () => get<Vehicle>(`/fleet/vehicles/${id}/`), enabled: !!id });
  const [editing, setEditing] = useState(false);
  const setStatus = useMutation({
    mutationFn: (status: string) => post<Vehicle>(`/fleet/vehicles/${id}/set-status/`, { status }),
    onSuccess: (v) => {
      invalidate(qc, "vehicle", "vehicles", "opts-vehicles", "dashboard");
      message.success(`Status set to ${titleCase(v.status)}`);
    },
    onError: (e) => message.error(errorMessage(e)),
  });
  const changeStatus = (status: string, v: Vehicle) =>
    confirmAction({
      title: `Mark ${v.registration_number} as ${titleCase(status).toLowerCase()}?`,
      content: status === "INACTIVE" ? "Inactive vehicles cannot be assigned to routes or trips." : status === "MAINTENANCE" ? "The vehicle will be excluded from trip generation until it is available again." : "The vehicle becomes available for routes and trips.",
      okText: "Change status",
      danger: status === "INACTIVE",
      onOk: () => setStatus.mutateAsync(status),
    });

  return (
    <QueryState query={vehicle}>
      {(v) => (
        <div>
          <PageHeader
            crumbs={[{ label: "Vehicles", to: "/school/vehicles" }, { label: v.registration_number }]}
            title={<span>{v.display_name} <StatusBadge status={v.status} /></span>}
            subtitle={`${v.registration_number} · ${titleCase(v.vehicle_type)} · ${v.capacity} seats${v.make ? ` · ${v.make} ${v.model}` : ""}`}
            extra={canManage && (
              <>
                <Dropdown
                  menu={{
                    items: [
                      { key: "AVAILABLE", label: "Available", disabled: v.status === "AVAILABLE" },
                      { key: "MAINTENANCE", label: "Under maintenance", disabled: v.status === "MAINTENANCE" },
                      { key: "INACTIVE", label: "Inactive (retire)", danger: true, disabled: v.status === "INACTIVE" },
                    ],
                    onClick: ({ key }) => changeStatus(key, v),
                  }}
                >
                  <Button loading={setStatus.isPending}>Set status <DownOutlined /></Button>
                </Dropdown>
                <Button type="primary" onClick={() => setEditing(true)}>Edit vehicle</Button>
              </>
            )}
          />
          {v.document_alerts.length > 0 && (
            <Alert
              type={v.has_expired_documents ? "error" : "warning"}
              showIcon
              style={{ marginBottom: 16 }}
              message={v.has_expired_documents ? "Expired documents" : "Documents expiring soon"}
              description={<List size="small" dataSource={v.document_alerts} renderItem={(a) => <List.Item style={{ padding: "4px 0", border: 0 }}><Tag color={a.level === "expired" ? "red" : "orange"}>{a.level}</Tag> {a.document} · {fmtDate(a.expires_on)}</List.Item>} />}
            />
          )}
          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col xs={24} lg={12}>
              <Card size="small" title="Vehicle">
                <KeyValue items={[
                  { label: "Fleet number", value: v.fleet_number || "-" },
                  { label: "Make / model", value: `${v.make || "-"} ${v.model || ""}`.trim() },
                  { label: "Year", value: v.year ?? "-" },
                  { label: "Colour", value: v.colour || "-" },
                  { label: "Odometer", value: `${v.odometer_km.toLocaleString()} km` },
                  { label: "GPS device", value: v.gps_device_id || "Driver app" },
                  { label: "Last service", value: fmtDate(v.last_service_date) },
                  { label: "Next service due", value: fmtDate(v.next_service_due) },
                  { label: "Notes", value: v.notes || "-" },
                ]} />
              </Card>
            </Col>
            <Col xs={24} lg={12}>
              <Card size="small" title="Operations">
                <KeyValue items={[
                  { label: "Driver", value: v.driver ? `${v.driver.name} (${v.driver.phone || "no phone"})` : "Unassigned" },
                  { label: "Attendant", value: v.attendant ? `${v.attendant.name} (${v.attendant.phone || "no phone"})` : "Unassigned" },
                  { label: "Routes", value: v.routes.length ? v.routes.map((r) => <Link key={r.id} to={`/school/routes/${r.id}`} style={{ marginRight: 8 }}>{r.code} {r.name}</Link>) : "None" },
                  { label: "Students assigned", value: v.assigned_students ?? "-" },
                  { label: "Insurance", value: `${v.insurance_number || "-"} · ${fmtDate(v.insurance_expiry)}` },
                  { label: "Permit", value: `${v.permit_number || "-"} · ${fmtDate(v.permit_expiry)}` },
                  { label: "Fitness", value: `${v.fitness_certificate_number || "-"} · ${fmtDate(v.fitness_expiry)}` },
                  { label: "Pollution cert.", value: fmtDate(v.pollution_expiry) },
                  { label: "Updated", value: fmtDateTime(v.updated_at) },
                ]} />
              </Card>
            </Col>
          </Row>
          <Tabs
            items={[
              { key: "documents", label: "Documents", children: <DocumentsTab vehicle={v} canManage={canManage} /> },
              { key: "maintenance", label: "Maintenance", children: <MaintenanceTab vehicle={v} canManage={canManage} /> },
              { key: "staff", label: "Staff assignment", children: <StaffTab vehicle={v} canManage={canManage} /> },
              { key: "history", label: "History", children: <HistoryTab vehicleId={v.id} /> },
            ]}
          />
          <VehicleFormDrawer open={editing} vehicle={v} onClose={() => setEditing(false)} />
        </div>
      )}
    </QueryState>
  );
}
