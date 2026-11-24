import { DocumentLink } from "@/components/ui/ProtectedMedia";
import { useState } from "react";
import { Alert, Button, Card, Col, Input, Row, Segmented, Space, Table, Tabs, Tag, Typography, Upload, message } from "antd";
import { PlusOutlined, UploadOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { z } from "zod";
import { errorMessage, fieldErrors } from "@/api/client";
import { useAuth } from "@/app/auth";
import { DateField, SelectField, TextAreaField, TextField, applyServerErrors, useZodForm } from "@/components/forms/fields";
import { confirmAction } from "@/components/ui/ConfirmDialog";
import { KeyValue, NameAvatar } from "@/components/ui/Misc";
import { PageHeader } from "@/components/ui/PageHeader";
import { QueryState } from "@/components/ui/States";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { dayjs, fmtDate, titleCase } from "@/lib/format";
import { get, invalidate, listAll, patch, post, toFormData } from "../api";
import { FormDrawer } from "../components/FormDrawer";
import { ATTENDANCE_STATUS, LEAVE_TYPE, STAFF_DOC_TYPE } from "../constants";
import type { Invitation, Staff, StaffAttendance, StaffDocument, StaffHistoryItem, StaffLeave } from "../types";
import { InvitationModal } from "./InvitationModal";
import { StaffFormDrawer } from "./StaffForm";

const docSchema = z.object({
  doc_type: z.string().min(1, "Select a type"),
  title: z.string().min(2, "Title is required"),
  number: z.string().optional(),
  issued_on: z.string().nullable().optional(),
  expires_on: z.string().nullable().optional(),
  notes: z.string().optional(),
});
const leaveSchema = z.object({
  leave_type: z.string().min(1, "Select a leave type"),
  start_date: z.string({ invalid_type_error: "Start date is required" }).min(1, "Start date is required"),
  end_date: z.string({ invalid_type_error: "End date is required" }).min(1, "End date is required"),
  reason: z.string().optional(),
}).refine((d) => d.end_date >= d.start_date, { path: ["end_date"], message: "End date must be on or after start date" });

function DocumentsTab({ staff, canManage }: { staff: Staff; canManage: boolean }) {
  const qc = useQueryClient();
  const docs = useQuery({ queryKey: ["staff-docs", staff.id], queryFn: () => get<StaffDocument[]>(`/people/staff/${staff.id}/documents/`) });
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const form = useZodForm(docSchema, { defaultValues: { doc_type: "LICENCE", title: "", number: "", issued_on: null, expires_on: null, notes: "" } });
  const add = useMutation({
    mutationFn: (d: z.input<typeof docSchema>) => post<StaffDocument>(`/people/staff/${staff.id}/documents/`, file ? toFormData({ ...d, file }) : d, file ? { headers: { "Content-Type": "multipart/form-data" } } : undefined),
    onSuccess: () => {
      invalidate(qc, "staff-docs", "staff-detail", "staff");
      message.success("Document added");
      setOpen(false);
      setFile(null);
      form.reset();
    },
    onError: (e) => applyServerErrors(form.setError, fieldErrors(e)),
  });
  const columns: ColumnsType<StaffDocument> = [
    { title: "Type", dataIndex: "doc_type", width: 170, render: (v: string) => titleCase(v) },
    { title: "Title", dataIndex: "title" },
    { title: "Number", dataIndex: "number" },
    { title: "Issued", dataIndex: "issued_on", width: 120, render: (v: string | null) => fmtDate(v) },
    { title: "Expires", dataIndex: "expires_on", width: 170, render: (v: string | null, r) => (v ? <span style={{ color: r.is_expired ? "var(--sbp-danger)" : undefined }}>{fmtDate(v)}{r.is_expired && <Tag color="red" style={{ marginLeft: 8 }}>Expired</Tag>}</span> : "-") },
    { title: "File", dataIndex: "file", width: 80, render: (v: string | null) => (v ? <DocumentLink src={v} /> : "-") },
  ];
  return (
    <div className="sbp-stack">
      <div className="sbp-between">
        <Typography.Text type="secondary">Licence, ID, police verification and medical certificates with expiry tracking.</Typography.Text>
        {canManage && <Button icon={<PlusOutlined />} onClick={() => setOpen(true)}>Add document</Button>}
      </div>
      <QueryState query={docs} isEmpty={(d) => d.length === 0} emptyTitle="No documents on file">
        {(rows) => <div className="sbp-surface"><Table rowKey="id" size="small" columns={columns} dataSource={rows} pagination={false} /></div>}
      </QueryState>
      <FormDrawer open={open} title="Add staff document" onClose={() => setOpen(false)} onSubmit={form.handleSubmit((d) => add.mutate(d))} submitting={add.isPending} error={add.isError ? add.error : undefined} submitLabel="Add document">
        <SelectField control={form.control} name="doc_type" label="Document type" required options={STAFF_DOC_TYPE} allowClear={false} />
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

function LeaveTab({ staff, canManage }: { staff: Staff; canManage: boolean }) {
  const qc = useQueryClient();
  const leaves = useQuery({ queryKey: ["staff-leaves", staff.id], queryFn: () => listAll<StaffLeave>("/people/staff-leaves/", { staff: staff.id, ordering: "-start_date" }) });
  const [open, setOpen] = useState(false);
  const form = useZodForm(leaveSchema, { defaultValues: { leave_type: "CASUAL", start_date: "", end_date: "", reason: "" } });
  const create = useMutation({
    mutationFn: (d: z.input<typeof leaveSchema>) => post<StaffLeave>("/people/staff-leaves/", { ...d, staff: staff.id }),
    onSuccess: () => {
      invalidate(qc, "staff-leaves");
      message.success("Leave request recorded");
      setOpen(false);
      form.reset();
    },
    onError: (e) => applyServerErrors(form.setError, fieldErrors(e)),
  });
  const decide = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "approve" | "reject" }) => post<StaffLeave>(`/people/staff-leaves/${id}/${action}/`),
    onSuccess: (_, { action }) => {
      invalidate(qc, "staff-leaves", "staff-detail", "staff");
      message.success(action === "approve" ? "Leave approved" : "Leave rejected");
    },
    onError: (e) => message.error(errorMessage(e)),
  });
  const columns: ColumnsType<StaffLeave> = [
    { title: "Type", dataIndex: "leave_type", width: 120, render: (v: string) => titleCase(v) },
    { title: "From", dataIndex: "start_date", width: 120, render: (v: string) => fmtDate(v) },
    { title: "To", dataIndex: "end_date", width: 120, render: (v: string) => fmtDate(v) },
    { title: "Reason", dataIndex: "reason" },
    { title: "Status", dataIndex: "status", width: 110, render: (v: string) => <StatusBadge status={v} /> },
    ...(canManage ? [{
      title: "", key: "actions", width: 170,
      render: (_: unknown, r: StaffLeave) => r.status === "PENDING" ? (
        <Space>
          <Button size="small" type="primary" onClick={() => confirmAction({ title: "Approve leave?", content: `${staff.full_name} will be marked on leave for ${fmtDate(r.start_date)} - ${fmtDate(r.end_date)}.`, okText: "Approve", onOk: () => decide.mutateAsync({ id: r.id, action: "approve" }) })}>Approve</Button>
          <Button size="small" danger onClick={() => decide.mutate({ id: r.id, action: "reject" })}>Reject</Button>
        </Space>
      ) : null,
    }] : []),
  ];
  return (
    <div className="sbp-stack">
      <div className="sbp-between">
        <Typography.Text type="secondary">Approving a leave sets the staff status to "On leave".</Typography.Text>
        {canManage && <Button icon={<PlusOutlined />} onClick={() => setOpen(true)}>Record leave request</Button>}
      </div>
      <QueryState query={leaves} isEmpty={(d) => d.length === 0} emptyTitle="No leave requests">
        {(rows) => <div className="sbp-surface"><Table rowKey="id" size="small" columns={columns} dataSource={rows} pagination={false} /></div>}
      </QueryState>
      <FormDrawer open={open} title="Record leave request" onClose={() => setOpen(false)} onSubmit={form.handleSubmit((d) => create.mutate(d))} submitting={create.isPending} error={create.isError ? create.error : undefined} submitLabel="Save request">
        <SelectField control={form.control} name="leave_type" label="Leave type" required options={LEAVE_TYPE} allowClear={false} />
        <Row gutter={16}>
          <Col span={12}><DateField control={form.control} name="start_date" label="From" required /></Col>
          <Col span={12}><DateField control={form.control} name="end_date" label="To" required /></Col>
        </Row>
        <TextAreaField control={form.control} name="reason" label="Reason" rows={2} />
      </FormDrawer>
    </div>
  );
}

function AttendanceTab({ staff, canManage }: { staff: Staff; canManage: boolean }) {
  const qc = useQueryClient();
  const today = dayjs().format("YYYY-MM-DD");
  const rows = useQuery({ queryKey: ["staff-attendance", staff.id], queryFn: () => listAll<StaffAttendance>("/people/staff-attendance/", { staff: staff.id, ordering: "-date", page_size: 60 }) });
  const todayRow = rows.data?.find((r) => r.date === today) ?? null;
  const [status, setStatus] = useState<string | null>(null);
  const [note, setNote] = useState("");
  // The backend's create endpoint is documented as an upsert but its unique (staff, date) validator rejects a second
  // POST for the same day, so updates go through PATCH on the existing record.
  const mark = useMutation({
    mutationFn: (s: string) => (todayRow ? patch<StaffAttendance>(`/people/staff-attendance/${todayRow.id}/`, { status: s, note }) : post<StaffAttendance>("/people/staff-attendance/", { staff: staff.id, date: today, status: s, note })),
    onSuccess: (r) => {
      invalidate(qc, "staff-attendance");
      message.success(`Marked ${titleCase(r.status).toLowerCase()} for today`);
    },
    onError: (e) => message.error(errorMessage(e)),
  });
  const current = status ?? todayRow?.status ?? null;
  const columns: ColumnsType<StaffAttendance> = [
    { title: "Date", dataIndex: "date", width: 140, render: (v: string) => fmtDate(v) },
    { title: "Status", dataIndex: "status", width: 120, render: (v: string) => <StatusBadge status={v} /> },
    { title: "Note", dataIndex: "note" },
  ];
  return (
    <div className="sbp-stack">
      {canManage && (
        <Card size="small" title={`Today, ${fmtDate(today)}`}>
          <Space direction="vertical" style={{ width: "100%" }}>
            <Segmented aria-label="Attendance status for today" options={ATTENDANCE_STATUS.map((o) => ({ label: o.label, value: o.value }))} value={current ?? undefined} onChange={(v) => setStatus(String(v))} />
            <Input placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Attendance note" style={{ maxWidth: 420 }} />
            <Button type="primary" disabled={!current} loading={mark.isPending} onClick={() => current && mark.mutate(current)}>{todayRow ? "Update today's attendance" : "Save today's attendance"}</Button>
          </Space>
        </Card>
      )}
      <QueryState query={rows} isEmpty={(d) => d.length === 0} emptyTitle="No attendance recorded yet">
        {(data) => <div className="sbp-surface"><Table rowKey="id" size="small" columns={columns} dataSource={data} pagination={{ pageSize: 15 }} /></div>}
      </QueryState>
    </div>
  );
}

function HistoryTab({ staffId }: { staffId: string }) {
  const history = useQuery({ queryKey: ["staff-history", staffId], queryFn: () => get<StaffHistoryItem[]>(`/people/staff/${staffId}/history/`) });
  const columns: ColumnsType<StaffHistoryItem> = [
    { title: "Vehicle", dataIndex: "vehicle" },
    { title: "Role", dataIndex: "role", render: (v: string) => titleCase(v), width: 120 },
    { title: "From", dataIndex: "start_date", render: (v: string) => fmtDate(v), width: 130 },
    { title: "To", dataIndex: "end_date", render: (v: string | null) => fmtDate(v), width: 130 },
    { title: "Status", dataIndex: "is_active", width: 110, render: (v: boolean) => <StatusBadge status={v ? "ACTIVE" : "INACTIVE"} label={v ? "Current" : "Ended"} /> },
  ];
  return (
    <QueryState query={history} isEmpty={(d) => d.length === 0} emptyTitle="No vehicle assignments yet">
      {(rows) => <div className="sbp-surface"><Table rowKey="id" size="small" columns={columns} dataSource={rows} pagination={false} /></div>}
    </QueryState>
  );
}

export default function StaffDetailPage() {
  const { id = "" } = useParams();
  const { hasPerm } = useAuth();
  const canManage = hasPerm("staff.manage");
  const qc = useQueryClient();
  const staff = useQuery({ queryKey: ["staff-detail", id], queryFn: () => get<Staff>(`/people/staff/${id}/`), enabled: !!id });
  const [editing, setEditing] = useState(false);
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const invite = useMutation({ mutationFn: () => post<Invitation>(`/people/staff/${id}/invite/`, {}), onSuccess: (inv) => { invalidate(qc, "staff", "staff-detail"); setInvitation(inv); }, onError: (e) => message.error(errorMessage(e)) });
  const access = useMutation({
    mutationFn: (on: boolean) => post(`/people/staff/${id}/${on ? "activate-access" : "deactivate-access"}/`),
    onSuccess: (_, on) => { invalidate(qc, "staff", "staff-detail", "members"); message.success(on ? "Access activated" : "Access deactivated"); },
    onError: (e) => message.error(errorMessage(e)),
  });
  return (
    <QueryState query={staff}>
      {(s) => (
        <div>
          <PageHeader
            crumbs={[{ label: "Staff", to: "/school/staff" }, { label: s.full_name }]}
            title={<span className="sbp-row"><NameAvatar name={s.full_name} src={s.photo} /> {s.full_name} <StatusBadge status={s.status} /></span>}
            subtitle={`${titleCase(s.staff_type)} · ${s.employee_id} · ${s.phone}`}
            extra={canManage && (
              <>
                {!s.has_account && s.email && <Button onClick={() => invite.mutate()} loading={invite.isPending}>Invite to app</Button>}
                {s.has_account && (s.account_active
                  ? <Button danger onClick={() => confirmAction({ title: "Deactivate app access?", content: `${s.full_name} will no longer be able to sign in.`, okText: "Deactivate", danger: true, onOk: () => access.mutateAsync(false) })}>Deactivate access</Button>
                  : <Button onClick={() => access.mutate(true)}>Activate access</Button>)}
                <Button type="primary" onClick={() => setEditing(true)}>Edit profile</Button>
              </>
            )}
          />
          {s.expiring_documents.length > 0 && (
            <Alert type={s.expiring_documents.some((d) => d.expired) ? "error" : "warning"} showIcon style={{ marginBottom: 16 }} message="Document attention needed" description={s.expiring_documents.map((d) => `${d.title}: ${d.expired ? "expired" : "expires"} ${fmtDate(d.expires_on)}`).join(" · ")} />
          )}
          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col xs={24} lg={12}>
              <Card size="small" title="Profile">
                <KeyValue items={[
                  { label: "Email", value: s.email || "-" },
                  { label: "App account", value: !s.has_account ? "Not invited" : s.account_active ? `Active (${s.user_email})` : `Deactivated (${s.user_email})` },
                  { label: "Date of birth", value: fmtDate(s.date_of_birth) },
                  { label: "Gender", value: s.gender || "-" },
                  { label: "Joined", value: fmtDate(s.joining_date) },
                  { label: "Address", value: s.address || "-" },
                  { label: "Emergency contact", value: s.emergency_contact_name ? `${s.emergency_contact_name} · ${s.emergency_contact_phone}` : "-" },
                  { label: "Notes", value: s.notes || "-" },
                ]} />
              </Card>
            </Col>
            <Col xs={24} lg={12}>
              <Card size="small" title="Operations">
                <KeyValue items={[
                  { label: "Current vehicle", value: s.current_vehicle ? <Link to={`/school/vehicles/${s.current_vehicle.id}`}>{s.current_vehicle.registration_number} ({titleCase(s.current_vehicle.role)})</Link> : "Not assigned" },
                  ...(s.staff_type === "DRIVER" ? [
                    { label: "Licence", value: `${s.licence_number || "-"}${s.licence_class ? ` (${s.licence_class})` : ""}` },
                    { label: "Licence expiry", value: <span style={{ color: s.licence_expired ? "var(--sbp-danger)" : undefined }}>{fmtDate(s.licence_expiry)}{s.licence_expired ? " - expired" : ""}</span> },
                  ] : []),
                  { label: "Documents", value: `${s.documents.length} on file` },
                ]} />
              </Card>
            </Col>
          </Row>
          <Tabs items={[
            { key: "documents", label: "Documents", children: <DocumentsTab staff={s} canManage={canManage} /> },
            { key: "leave", label: "Leave requests", children: <LeaveTab staff={s} canManage={canManage} /> },
            { key: "attendance", label: "Attendance", children: <AttendanceTab staff={s} canManage={canManage} /> },
            { key: "history", label: "Vehicle history", children: <HistoryTab staffId={s.id} /> },
          ]} />
          <StaffFormDrawer open={editing} staff={s} onClose={() => setEditing(false)} />
          <InvitationModal invitation={invitation} onClose={() => setInvitation(null)} />
        </div>
      )}
    </QueryState>
  );
}
