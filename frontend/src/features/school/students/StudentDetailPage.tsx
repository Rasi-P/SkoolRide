import { useState } from "react";
import { Button, Card, Dropdown, List, Row, Col, Space, Table, Tag, Typography, message } from "antd";
import { DownOutlined, PlusOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { z } from "zod";
import { errorMessage, fieldErrors } from "@/api/client";
import { useAuth } from "@/app/auth";
import { SelectField, SwitchField, applyServerErrors, useZodForm } from "@/components/forms/fields";
import { confirmAction } from "@/components/ui/ConfirmDialog";
import { KeyValue, NameAvatar } from "@/components/ui/Misc";
import { PageHeader } from "@/components/ui/PageHeader";
import { QueryState } from "@/components/ui/States";
import { DirectionTag, StatusBadge } from "@/components/ui/StatusBadge";
import { fmtDate, fmtDateTime, fmtMoney, titleCase } from "@/lib/format";
import type { Paginated } from "@/types";
import { del, get, invalidate, post } from "../api";
import { FormDrawer } from "../components/FormDrawer";
import { ReasonModal } from "../components/ReasonModal";
import { RemoteSelectField } from "../components/RemoteSelect";
import { RELATIONSHIP } from "../constants";
import { FeeAssignDrawer } from "../billing/FeeAssignDrawer";
import type { AbsenceRequest, BoardingEvent, GuardianLink, Invoice, Parent, PickupChangeRequest, Student, TransportAssignment } from "../types";
import { AssignTransportDrawer } from "./AssignTransportDrawer";
import { StudentFormDrawer } from "./StudentForm";

const linkSchema = z.object({
  parent: z.string({ invalid_type_error: "Select a parent" }).min(1, "Select a parent"),
  relationship: z.enum(["FATHER", "MOTHER", "GUARDIAN", "OTHER"]),
  is_primary: z.boolean(),
  can_pickup: z.boolean(),
  receives_notifications: z.boolean(),
});

function LinkParentDrawer({ student, open, onClose }: { student: Student; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const form = useZodForm(linkSchema, { defaultValues: { parent: "", relationship: "GUARDIAN", is_primary: student.guardians.length === 0, can_pickup: true, receives_notifications: true } });
  const link = useMutation({
    mutationFn: (d: z.input<typeof linkSchema>) => post<GuardianLink>("/people/guardian-links/", { ...d, student: student.id }),
    onSuccess: () => {
      invalidate(qc, "student", "students", "parents", "parent");
      message.success("Guardian linked");
      form.reset();
      onClose();
    },
    onError: (e) => applyServerErrors(form.setError, fieldErrors(e)),
  });
  return (
    <FormDrawer open={open} title={`Link a parent to ${student.full_name}`} onClose={onClose} onSubmit={form.handleSubmit((d) => link.mutate(d))} submitting={link.isPending} error={link.isError ? link.error : undefined} submitLabel="Link guardian">
      <RemoteSelectField<z.input<typeof linkSchema>, Parent> control={form.control} name="parent" label="Parent" required path="/people/parents/" queryKey="parents" toOption={(p) => ({ value: p.id, label: `${p.full_name} · ${p.phone || p.email}` })} placeholder="Search parents by name, phone or email" help={<span>Not registered yet? <Link to="/school/parents">Add the parent first</Link>.</span>} />
      <SelectField control={form.control} name="relationship" label="Relationship" required options={RELATIONSHIP} allowClear={false} />
      <SwitchField control={form.control} name="is_primary" label="Primary guardian" help="Primary guardian is billed and contacted first." />
      <SwitchField control={form.control} name="can_pickup" label="Allowed to collect the child" />
      <SwitchField control={form.control} name="receives_notifications" label="Receives bus notifications" />
    </FormDrawer>
  );
}

export default function StudentDetailPage() {
  const { id = "" } = useParams();
  const { hasPerm } = useAuth();
  const canManage = hasPerm("students.manage");
  const canAssign = hasPerm("routes.manage");
  const canBilling = hasPerm("billing.view");
  const canBillingManage = hasPerm("billing.manage");
  const qc = useQueryClient();
  const student = useQuery({ queryKey: ["student", id], queryFn: () => get<Student>(`/people/students/${id}/`), enabled: !!id });
  const history = useQuery({ queryKey: ["student-history", id], queryFn: () => get<TransportAssignment[]>(`/people/students/${id}/history/`), enabled: !!id });
  const invoices = useQuery({ queryKey: ["student-invoices", id], queryFn: () => get<Paginated<Invoice>>("/billing/invoices/", { student: id, page_size: 12, ordering: "-issue_date" }), enabled: !!id && canBilling });
  const events = useQuery({ queryKey: ["student-events", id], queryFn: () => get<Paginated<BoardingEvent>>("/trips/boarding-events/", { student: id, page_size: 10, ordering: "-occurred_at" }), enabled: !!id });
  const absences = useQuery({ queryKey: ["student-absences", id], queryFn: () => get<Paginated<AbsenceRequest>>("/engagement/absence-requests/", { student: id, page_size: 10 }), enabled: !!id });
  const pickupReqs = useQuery({ queryKey: ["student-pickup-requests", id], queryFn: () => get<Paginated<PickupChangeRequest>>("/engagement/pickup-change-requests/", { student: id, page_size: 10 }), enabled: !!id && hasPerm("routes.view") });
  const [editing, setEditing] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [linking, setLinking] = useState(false);
  const [feeOpen, setFeeOpen] = useState(false);
  const [reason, setReason] = useState<"transfer" | "withdraw-transport" | null>(null);

  const statusChange = useMutation({
    mutationFn: ({ kind, reasonText }: { kind: "transfer" | "withdraw-transport" | "reactivate"; reasonText?: string }) => post<Student>(`/people/students/${id}/${kind}/`, reasonText !== undefined ? { reason: reasonText } : {}),
    onSuccess: (_, { kind }) => {
      invalidate(qc, "student", "students", "student-history", "assignments", "dashboard");
      message.success(kind === "transfer" ? "Student marked as transferred" : kind === "withdraw-transport" ? "Transport withdrawn" : "Student reactivated");
      setReason(null);
    },
    onError: (e) => message.error(errorMessage(e)),
  });
  const unlink = useMutation({
    mutationFn: (linkId: string) => del(`/people/guardian-links/${linkId}/`),
    onSuccess: () => {
      invalidate(qc, "student", "students", "parents", "parent");
      message.success("Guardian unlinked");
    },
    onError: (e) => message.error(errorMessage(e)),
  });

  const guardianColumns: ColumnsType<GuardianLink> = [
    { title: "Parent", dataIndex: "parent_name", render: (v: string, r) => <Link to={`/school/parents/${r.parent}`}>{v}</Link> },
    { title: "Relationship", dataIndex: "relationship", width: 120, render: (v: string) => titleCase(v) },
    { title: "Phone", dataIndex: "parent_phone", width: 150 },
    { title: "Email", dataIndex: "parent_email" },
    { title: "Account", dataIndex: "parent_status", width: 110, render: (v: string) => <StatusBadge status={v} /> },
    { title: "Flags", key: "flags", width: 230, render: (_, r) => <Space size={4} wrap>{r.is_primary && <Tag color="blue">Primary</Tag>}{r.can_pickup && <Tag>Can pick up</Tag>}{r.receives_notifications && <Tag>Notified</Tag>}</Space> },
    ...(canManage ? [{ title: "", key: "actions", width: 90, render: (_: unknown, r: GuardianLink) => <Button size="small" danger onClick={() => confirmAction({ title: `Unlink ${r.parent_name}?`, content: "They will no longer see this child or receive its notifications.", okText: "Unlink", danger: true, onOk: () => unlink.mutateAsync(r.id) })}>Unlink</Button> }] : []),
  ];
  const historyColumns: ColumnsType<TransportAssignment> = [
    { title: "Route", key: "route", render: (_, r) => <Link to={`/school/routes/${r.route}`}>{r.route_code} {r.route_name}</Link> },
    { title: "Pickup", dataIndex: "pickup_stop_name", render: (v: string | null) => v ?? "-" },
    { title: "Drop-off", dataIndex: "dropoff_stop_name", render: (v: string | null) => v ?? "-" },
    { title: "From", dataIndex: "start_date", width: 120, render: (v: string) => fmtDate(v) },
    { title: "To", dataIndex: "end_date", width: 120, render: (v: string | null) => fmtDate(v) },
    { title: "Status", key: "status", width: 110, render: (_, r) => <StatusBadge status={r.is_active ? "ACTIVE" : "INACTIVE"} label={r.is_active ? "Current" : r.ended_reason || "Ended"} /> },
  ];
  const invoiceColumns: ColumnsType<Invoice> = [
    { title: "Invoice", dataIndex: "invoice_number", render: (v: string, r) => <Link to={`/school/invoices/${r.id}`}>{v}</Link> },
    { title: "Period", dataIndex: "period_label" },
    { title: "Due", dataIndex: "due_date", width: 120, render: (v: string) => fmtDate(v) },
    { title: "Total", dataIndex: "total", width: 120, align: "right", render: (v: string, r) => fmtMoney(v, r.currency) },
    { title: "Balance", dataIndex: "balance", width: 120, align: "right", render: (v: string, r) => fmtMoney(v, r.currency) },
    { title: "Status", dataIndex: "status", width: 120, render: (v: string) => <StatusBadge status={v} /> },
  ];
  const eventColumns: ColumnsType<BoardingEvent> = [
    { title: "When", dataIndex: "occurred_at", width: 170, render: (v: string) => fmtDateTime(v) },
    { title: "Trip", key: "trip", render: (_, r) => <Link to={`/school/trips/${r.trip}`}>{r.route_code} <DirectionTag direction={r.trip_direction} /></Link> },
    { title: "Event", dataIndex: "event_type", width: 110, render: (v: string) => <StatusBadge status={v} /> },
    { title: "Stop", dataIndex: "stop_name", render: (v: string | null) => v ?? "-" },
    { title: "By", dataIndex: "recorded_by_name", width: 150, render: (v: string | null) => v ?? "-" },
  ];

  return (
    <QueryState query={student}>
      {(s) => (
        <div>
          <PageHeader
            crumbs={[{ label: "Students", to: "/school/students" }, { label: s.full_name }]}
            title={<span className="sbp-row"><NameAvatar name={s.full_name} src={s.photo} /> {s.full_name} <StatusBadge status={s.status} /> <StatusBadge status={s.transport_status} label={s.transport_status === "ACTIVE" ? "Using transport" : s.transport_status === "WITHDRAWN" ? "Transport withdrawn" : "Not using transport"} /></span>}
            subtitle={`Class ${s.class_label} · Admission ${s.admission_number}`}
            extra={(canManage || canAssign) && (
              <>
                {canAssign && s.status === "ACTIVE" && <Button onClick={() => setAssigning(true)}>{s.transport ? "Change route / stop" : "Assign transport"}</Button>}
                {canManage && (
                  <Dropdown
                    menu={{
                      items: [
                        ...(s.transport_status === "ACTIVE" ? [{ key: "withdraw-transport", label: "Withdraw from transport", danger: true }] : []),
                        ...(s.status === "ACTIVE" ? [{ key: "transfer", label: "Mark as transferred", danger: true }] : []),
                        ...(s.status !== "ACTIVE" || s.transport_status === "WITHDRAWN" ? [{ key: "reactivate", label: "Reactivate" }] : []),
                      ],
                      onClick: ({ key }) => (key === "reactivate" ? statusChange.mutate({ kind: "reactivate" }) : setReason(key as "transfer" | "withdraw-transport")),
                    }}
                  >
                    <Button>Status <DownOutlined /></Button>
                  </Dropdown>
                )}
                {canManage && <Button type="primary" onClick={() => setEditing(true)}>Edit profile</Button>}
              </>
            )}
          />
          <Row gutter={[16, 16]}>
            <Col xs={24} lg={12}>
              <Card size="small" title="Profile">
                <KeyValue items={[
                  { label: "Date of birth", value: fmtDate(s.date_of_birth) },
                  { label: "Gender", value: s.gender || "-" },
                  { label: "Blood group", value: s.blood_group || "-" },
                  { label: "Pickup address", value: s.pickup_address || "-" },
                  { label: "Emergency contact", value: s.emergency_contact_name ? `${s.emergency_contact_name} · ${s.emergency_contact_phone}` : "-" },
                  { label: "Medical notes", value: s.medical_notes || "-" },
                  { label: "Status reason", value: s.status_reason || "-" },
                  { label: "Notes", value: s.notes || "-" },
                ]} />
              </Card>
            </Col>
            <Col xs={24} lg={12}>
              <Card size="small" title="Transport">
                {s.transport ? (
                  <KeyValue items={[
                    { label: "Route", value: <Link to={`/school/routes/${s.transport.route_id}`}>{s.transport.route_code} {s.transport.route_name}</Link> },
                    { label: "Vehicle", value: s.transport.vehicle_registration ?? "-" },
                    { label: "Pickup stop", value: s.transport.pickup_stop_name ?? "-" },
                    { label: "Drop-off stop", value: s.transport.dropoff_stop_name ?? "-" },
                    { label: "Since", value: fmtDate(s.transport.start_date) },
                  ]} />
                ) : (
                  <Typography.Text type="secondary">No active route assignment.</Typography.Text>
                )}
                <Typography.Text strong style={{ display: "block", margin: "16px 0 8px" }}>Assignment history</Typography.Text>
                <QueryState query={history} rows={2} isEmpty={(d) => d.length === 0} emptyTitle="No assignments yet">
                  {(rows) => <Table rowKey="id" size="small" columns={historyColumns} dataSource={rows} pagination={false} />}
                </QueryState>
              </Card>
            </Col>
            <Col xs={24}>
              <Card size="small" title="Guardians" extra={canManage && <Button size="small" icon={<PlusOutlined />} onClick={() => setLinking(true)}>Link parent</Button>}>
                <Table rowKey="id" size="small" columns={guardianColumns} dataSource={s.guardians} pagination={false} locale={{ emptyText: "No guardians linked. Link a parent so they can track the bus and receive alerts." }} />
              </Card>
            </Col>
            {canBilling && (
              <Col xs={24} lg={12}>
                <Card size="small" title="Fees" extra={canBillingManage && <Button size="small" onClick={() => setFeeOpen(true)}>{s.fee_plan ? "Change fee plan" : "Assign fee plan"}</Button>}>
                  <Typography.Paragraph style={{ marginBottom: 12 }}>{s.fee_plan ? <span>Plan: <strong>{s.fee_plan.name}</strong> · {fmtMoney(s.fee_plan.amount)}</span> : <Typography.Text type="secondary">No fee plan assigned; invoices will not be generated for this student.</Typography.Text>}</Typography.Paragraph>
                  <QueryState query={invoices} rows={2} isEmpty={(d) => d.count === 0} emptyTitle="No invoices yet">
                    {(d) => <Table rowKey="id" size="small" columns={invoiceColumns} dataSource={d.results} pagination={false} />}
                  </QueryState>
                </Card>
              </Col>
            )}
            <Col xs={24} lg={canBilling ? 12 : 24}>
              <Card size="small" title="Recent boarding events">
                <QueryState query={events} rows={2} isEmpty={(d) => d.count === 0} emptyTitle="No boarding events recorded">
                  {(d) => <Table rowKey="id" size="small" columns={eventColumns} dataSource={d.results} pagination={false} />}
                </QueryState>
              </Card>
            </Col>
            <Col xs={24} lg={12}>
              <Card size="small" title="Absence requests" extra={<Link to="/school/requests">All requests</Link>}>
                <QueryState query={absences} rows={2} isEmpty={(d) => d.count === 0} emptyTitle="No absence requests">
                  {(d) => <List size="small" dataSource={d.results} renderItem={(a) => <List.Item><List.Item.Meta title={<span>{fmtDate(a.date_from)}{a.date_to !== a.date_from ? ` - ${fmtDate(a.date_to)}` : ""} · {titleCase(a.direction)} <StatusBadge status={a.status} /></span>} description={a.reason || "No reason given"} /></List.Item>} />}
                </QueryState>
              </Card>
            </Col>
            <Col xs={24} lg={12}>
              <Card size="small" title="Pickup change requests" extra={<Link to="/school/requests?tab=pickup">All requests</Link>}>
                <QueryState query={pickupReqs} rows={2} isEmpty={(d) => d.count === 0} emptyTitle="No pickup change requests">
                  {(d) => <List size="small" dataSource={d.results} renderItem={(r) => <List.Item><List.Item.Meta title={<span>{titleCase(r.change_type)} from {fmtDate(r.effective_date)} <StatusBadge status={r.status} /></span>} description={`${r.requested_route_name ? `${r.requested_route_name} · ` : ""}${r.requested_pickup_stop_name ?? ""} ${r.details}`.trim()} /></List.Item>} />}
                </QueryState>
              </Card>
            </Col>
          </Row>
          <StudentFormDrawer open={editing} student={s} onClose={() => setEditing(false)} />
          <AssignTransportDrawer open={assigning} student={s} onClose={() => setAssigning(false)} />
          <LinkParentDrawer student={s} open={linking} onClose={() => setLinking(false)} />
          {canBilling && <FeeAssignDrawer student={s} open={feeOpen} onClose={() => setFeeOpen(false)} />}
          <ReasonModal
            open={!!reason}
            title={reason === "transfer" ? `Mark ${s.full_name} as transferred?` : `Withdraw ${s.full_name} from transport?`}
            description={reason === "transfer" ? "The student becomes inactive and any active transport assignment is ended." : "The active route assignment is ended and the student stops appearing on trips."}
            okText={reason === "transfer" ? "Mark transferred" : "Withdraw"}
            danger
            required={false}
            loading={statusChange.isPending}
            onCancel={() => setReason(null)}
            onSubmit={(text) => reason && statusChange.mutate({ kind: reason, reasonText: text })}
          />
        </div>
      )}
    </QueryState>
  );
}
