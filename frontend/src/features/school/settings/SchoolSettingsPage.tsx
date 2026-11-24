import { useEffect, useState } from "react";
import { Alert, Button, Card, Col, Row, Space, Table, Tabs, Tag, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { z } from "zod";
import { errorMessage, fieldErrors } from "@/api/client";
import { useAuth } from "@/app/auth";
import { DateField, NumberField, SelectField, SwitchField, TextAreaField, TextField, TimeField, applyServerErrors, useZodForm } from "@/components/forms/fields";
import { BusMap } from "@/components/map/BusMap";
import { confirmAction } from "@/components/ui/ConfirmDialog";
import { DataTable } from "@/components/ui/DataTable";
import { FilterSelect } from "@/components/ui/FilterSelect";
import { PageHeader } from "@/components/ui/PageHeader";
import { QueryState } from "@/components/ui/States";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useTableParams } from "@/hooks/usePagedQuery";
import { fmtDate, fmtDateTime, titleCase } from "@/lib/format";
import { del, get, invalidate, patch, post } from "../api";
import { CheckboxGroupField, WeekdaysField } from "../components/ExtraFields";
import { FormDrawer } from "../components/FormDrawer";
import { BILLING_CYCLE, INVITATION_STATUS, MEMBER_ROLE, PAYMENT_METHOD, TIMEZONES } from "../constants";
import { useSchoolProfile } from "../hooks";
import type { Invitation, Member, NotificationTemplate, SchoolProfile } from "../types";

function useProfileSave(onSuccess?: () => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => patch<SchoolProfile>("/school/profile/", body),
    onSuccess: () => { invalidate(qc, "school-profile", "onboarding", "dashboard"); message.success("Settings saved"); onSuccess?.(); },
  });
}

const profileSchema = z.object({
  name: z.string().trim().min(2, "School name is required"),
  email: z.string().email("Enter a valid email").optional().or(z.literal("")),
  phone: z.string().optional(),
  website: z.string().url("Enter a valid URL").optional().or(z.literal("")),
  address_line1: z.string().optional(),
  address_line2: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  postal_code: z.string().optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  timezone: z.string().min(1, "Timezone is required"),
  academic_year_label: z.string().optional(),
  academic_year_start: z.string().nullable().optional(),
  academic_year_end: z.string().nullable().optional(),
  operating_weekdays: z.array(z.number()).min(1, "Pick at least one operating day"),
});

function ProfileTab({ p, readOnly }: { p: SchoolProfile; readOnly: boolean }) {
  const form = useZodForm(profileSchema, { values: { name: p.name, email: p.email, phone: p.phone, website: p.website, address_line1: p.address_line1, address_line2: p.address_line2, city: p.city, state: p.state, country: p.country, postal_code: p.postal_code, latitude: p.latitude ? Number(p.latitude) : null, longitude: p.longitude ? Number(p.longitude) : null, timezone: p.timezone, academic_year_label: p.academic_year_label, academic_year_start: p.academic_year_start, academic_year_end: p.academic_year_end, operating_weekdays: p.operating_weekdays } });
  const save = useProfileSave();
  const lat = form.watch("latitude");
  const lng = form.watch("longitude");
  const tzOptions = TIMEZONES.some((t) => t.value === p.timezone) ? TIMEZONES : [{ value: p.timezone, label: p.timezone }, ...TIMEZONES];
  const c = form.control;
  return (
    <form noValidate onSubmit={form.handleSubmit((d) => save.mutate(d, { onError: (e) => applyServerErrors(form.setError, fieldErrors(e)) }))}>
      {save.isError && <Alert type="error" showIcon message={errorMessage(save.error)} style={{ marginBottom: 12 }} />}
      <Row gutter={[16, 0]}>
        <Col xs={24} lg={12}>
          <Card size="small" title="School" style={{ marginBottom: 16 }}>
            <TextField control={c} name="name" label="School name" required disabled={readOnly} />
            <Row gutter={16}>
              <Col span={12}><TextField control={c} name="email" label="Email" type="email" disabled={readOnly} /></Col>
              <Col span={12}><TextField control={c} name="phone" label="Phone" disabled={readOnly} /></Col>
              <Col span={24}><TextField control={c} name="website" label="Website" placeholder="https://" disabled={readOnly} /></Col>
              <Col span={24}><TextField control={c} name="address_line1" label="Address line 1" disabled={readOnly} /></Col>
              <Col span={24}><TextField control={c} name="address_line2" label="Address line 2" disabled={readOnly} /></Col>
              <Col span={8}><TextField control={c} name="city" label="City" disabled={readOnly} /></Col>
              <Col span={8}><TextField control={c} name="state" label="State" disabled={readOnly} /></Col>
              <Col span={8}><TextField control={c} name="postal_code" label="Postal code" disabled={readOnly} /></Col>
              <Col span={12}><TextField control={c} name="country" label="Country" disabled={readOnly} /></Col>
              <Col span={12}><SelectField control={c} name="timezone" label="Timezone" required options={tzOptions} allowClear={false} disabled={readOnly} /></Col>
            </Row>
          </Card>
          <Card size="small" title="Academic year" style={{ marginBottom: 16 }}>
            <Row gutter={16}>
              <Col span={8}><TextField control={c} name="academic_year_label" label="Label" placeholder="2026-27" disabled={readOnly} /></Col>
              <Col span={8}><DateField control={c} name="academic_year_start" label="Starts" disabled={readOnly} /></Col>
              <Col span={8}><DateField control={c} name="academic_year_end" label="Ends" disabled={readOnly} /></Col>
              <Col span={24}><WeekdaysField control={c} name="operating_weekdays" label="Operating days" required disabled={readOnly} help="Trips are only generated on these days." /></Col>
            </Row>
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card size="small" title="Location" style={{ marginBottom: 16 }}>
            <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>{readOnly ? "The school pin is used as the end of pickup routes and the start of drop-off routes." : "Click the map (or drag the pin) to set where the school is. It is used as the end of pickup routes and the start of drop-off routes."}</Typography.Paragraph>
            <Row gutter={16}>
              <Col span={12}><NumberField control={c} name="latitude" label="Latitude" step={0.0001} disabled={readOnly} /></Col>
              <Col span={12}><NumberField control={c} name="longitude" label="Longitude" step={0.0001} disabled={readOnly} /></Col>
            </Row>
            <BusMap
              height={340}
              zoom={14}
              center={lat != null && lng != null ? [lat, lng] : undefined}
              stops={lat != null && lng != null ? [{ id: "school", name: p.name, latitude: lat, longitude: lng, is_school_stop: true }] : []}
              fitKey={`school-${p.id}`}
              onMapClick={readOnly ? undefined : (la, ln) => { form.setValue("latitude", Number(la.toFixed(6)), { shouldDirty: true }); form.setValue("longitude", Number(ln.toFixed(6)), { shouldDirty: true }); }}
              draggableStops={!readOnly}
              onStopDrag={(_, la, ln) => { form.setValue("latitude", Number(la.toFixed(6)), { shouldDirty: true }); form.setValue("longitude", Number(ln.toFixed(6)), { shouldDirty: true }); }}
            />
          </Card>
        </Col>
      </Row>
      {!readOnly && <Button type="primary" htmlType="submit" loading={save.isPending}>Save profile</Button>}
    </form>
  );
}

const rulesSchema = z.object({
  morning_pickup_window_start: z.string().nullable().optional(),
  afternoon_dropoff_window_start: z.string().nullable().optional(),
  pickup_change_cutoff_hours: z.number().int().min(0).max(168),
  absence_report_cutoff_minutes: z.number().int().min(0).max(1440),
  boarding_grace_minutes: z.number().int().min(0).max(60),
  arrival_alert_minutes: z.number().int().min(1).max(60),
  delay_alert_minutes: z.number().int().min(1).max(120),
  gps_stale_seconds: z.number().int().min(30).max(3600),
  show_driver_phone_to_parents: z.boolean(),
});

function RulesTab({ p, readOnly }: { p: SchoolProfile; readOnly: boolean }) {
  const form = useZodForm(rulesSchema, { values: { morning_pickup_window_start: p.morning_pickup_window_start, afternoon_dropoff_window_start: p.afternoon_dropoff_window_start, pickup_change_cutoff_hours: p.pickup_change_cutoff_hours, absence_report_cutoff_minutes: p.absence_report_cutoff_minutes, boarding_grace_minutes: p.boarding_grace_minutes, arrival_alert_minutes: p.arrival_alert_minutes, delay_alert_minutes: p.delay_alert_minutes, gps_stale_seconds: p.gps_stale_seconds, show_driver_phone_to_parents: p.show_driver_phone_to_parents } });
  const save = useProfileSave();
  const c = form.control;
  return (
    <form noValidate onSubmit={form.handleSubmit((d) => save.mutate(d, { onError: (e) => applyServerErrors(form.setError, fieldErrors(e)) }))}>
      {save.isError && <Alert type="error" showIcon message={errorMessage(save.error)} style={{ marginBottom: 12 }} />}
      <Row gutter={[16, 0]}>
        <Col xs={24} lg={12}>
          <Card size="small" title="Pickup and drop-off" style={{ marginBottom: 16 }}>
            <Row gutter={16}>
              <Col span={12}><TimeField control={c} name="morning_pickup_window_start" label="Morning pickups start" disabled={readOnly} /></Col>
              <Col span={12}><TimeField control={c} name="afternoon_dropoff_window_start" label="Afternoon drop-offs start" disabled={readOnly} /></Col>
              <Col span={12}><NumberField control={c} name="pickup_change_cutoff_hours" label="Pickup-change cutoff (hours)" required min={0} disabled={readOnly} help="Parents must request stop changes this far ahead." /></Col>
              <Col span={12}><NumberField control={c} name="absence_report_cutoff_minutes" label="Absence cutoff (minutes before trip)" required min={0} disabled={readOnly} /></Col>
              <Col span={12}><NumberField control={c} name="boarding_grace_minutes" label="Boarding grace (minutes)" required min={0} disabled={readOnly} help="Wait time at a stop before marking a no-show." /></Col>
            </Row>
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card size="small" title="Alerts and tracking" style={{ marginBottom: 16 }}>
            <Row gutter={16}>
              <Col span={12}><NumberField control={c} name="arrival_alert_minutes" label="Arriving-soon alert (minutes)" required min={1} disabled={readOnly} help="Notify parents when the bus is this close." /></Col>
              <Col span={12}><NumberField control={c} name="delay_alert_minutes" label="Delay alert threshold (minutes)" required min={1} disabled={readOnly} /></Col>
              <Col span={12}><NumberField control={c} name="gps_stale_seconds" label="GPS stale after (seconds)" required min={30} disabled={readOnly} help="Flag a bus when no position arrives for this long." /></Col>
              <Col span={24}><SwitchField control={c} name="show_driver_phone_to_parents" label="Show the driver's phone number to parents" disabled={readOnly} /></Col>
            </Row>
          </Card>
        </Col>
      </Row>
      {!readOnly && <Button type="primary" htmlType="submit" loading={save.isPending}>Save rules</Button>}
    </form>
  );
}

const channelsSchema = z.object({ in_app: z.boolean(), push: z.boolean(), email: z.boolean(), sms: z.boolean() });
const templateSchema = z.object({ subject: z.string().trim().min(1, "Subject is required").max(160), body: z.string().trim().min(1, "Body is required"), is_active: z.boolean() });

function NotificationsTab({ p, readOnly }: { p: SchoolProfile; readOnly: boolean }) {
  const { hasPerm } = useAuth();
  const canTemplates = hasPerm("notifications.manage");
  const qc = useQueryClient();
  const chForm = useZodForm(channelsSchema, { values: { in_app: p.notification_channels.in_app ?? true, push: p.notification_channels.push ?? true, email: p.notification_channels.email ?? true, sms: p.notification_channels.sms ?? false } });
  const save = useProfileSave();
  const templates = useQuery({ queryKey: ["templates-effective"], queryFn: () => get<NotificationTemplate[]>("/school/notification-templates/effective/") });
  const [editing, setEditing] = useState<NotificationTemplate | null>(null);
  const tForm = useZodForm(templateSchema, { defaultValues: { subject: "", body: "", is_active: true } });
  useEffect(() => {
    if (editing) tForm.reset({ subject: editing.subject, body: editing.body, is_active: editing.is_active });
  }, [editing, tForm]);
  const saveTemplate = useMutation({
    mutationFn: (d: z.input<typeof templateSchema>) => (editing?.school ? patch<NotificationTemplate>(`/school/notification-templates/${editing.id}/`, d) : post<NotificationTemplate>("/school/notification-templates/", { ...d, category: editing?.category, channel: editing?.channel })),
    onSuccess: () => { invalidate(qc, "templates-effective"); message.success("Template saved"); setEditing(null); },
    onError: (e) => applyServerErrors(tForm.setError, fieldErrors(e)),
  });
  const resetTemplate = useMutation({ mutationFn: (t: NotificationTemplate) => del(`/school/notification-templates/${t.id}/`), onSuccess: () => { invalidate(qc, "templates-effective"); message.success("Reverted to the platform default"); }, onError: (e) => message.error(errorMessage(e)) });
  const columns: ColumnsType<NotificationTemplate> = [
    { title: "Category", dataIndex: "category", width: 170, render: (v: string) => titleCase(v) },
    { title: "Channel", dataIndex: "channel", width: 90, render: (v: string) => (v === "IN_APP" ? "In-app" : titleCase(v)) },
    { title: "Subject", dataIndex: "subject" },
    { title: "Body", dataIndex: "body", render: (v: string) => <Typography.Text type="secondary" ellipsis={{ tooltip: v }} style={{ maxWidth: 360, display: "inline-block" }}>{v}</Typography.Text> },
    { title: "Scope", key: "scope", width: 130, render: (_, t) => (t.school ? <Tag color="blue">School override</Tag> : <Tag>Platform default</Tag>) },
    { title: "Active", dataIndex: "is_active", width: 90, render: (v: boolean) => <StatusBadge status={v ? "ACTIVE" : "INACTIVE"} /> },
    ...(canTemplates ? [{ title: "", key: "actions", width: 150, render: (_: unknown, t: NotificationTemplate) => <Space><Button size="small" onClick={() => setEditing(t)}>Edit</Button>{t.school && <Button size="small" onClick={() => confirmAction({ title: "Revert to the platform default?", okText: "Revert", onOk: () => resetTemplate.mutateAsync(t) })}>Reset</Button>}</Space> }] : []),
  ];
  return (
    <div className="sbp-stack">
      <Card size="small" title="Channels">
        <form noValidate onSubmit={chForm.handleSubmit((d) => save.mutate({ notification_channels: d }, { onError: (e) => message.error(errorMessage(e)) }))}>
          <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>Channels the school uses. Parents can still mute categories individually.</Typography.Paragraph>
          <Row gutter={16}>
            <Col xs={12} md={6}><SwitchField control={chForm.control} name="in_app" label="In-app" disabled={readOnly} /></Col>
            <Col xs={12} md={6}><SwitchField control={chForm.control} name="push" label="Web push" disabled={readOnly} /></Col>
            <Col xs={12} md={6}><SwitchField control={chForm.control} name="email" label="Email" disabled={readOnly} /></Col>
            <Col xs={12} md={6}><SwitchField control={chForm.control} name="sms" label="SMS" disabled={readOnly} help="Requires an SMS provider on the platform." /></Col>
          </Row>
          {!readOnly && <Button type="primary" htmlType="submit" loading={save.isPending}>Save channels</Button>}
        </form>
      </Card>
      <Card size="small" title="Message templates" extra={<span className="sbp-muted" style={{ fontSize: 12 }}>Placeholders: {"{student_name} {student_first_name} {school_name} {minutes} {stop_name} {vehicle}"}</span>}>
        <QueryState query={templates} isEmpty={(d) => d.length === 0} emptyTitle="No templates configured">
          {(rows) => <Table rowKey="id" size="small" columns={columns} dataSource={rows} pagination={false} scroll={{ x: 900 }} />}
        </QueryState>
      </Card>
      <FormDrawer open={!!editing} title={editing ? `${titleCase(editing.category)} · ${editing.channel === "IN_APP" ? "In-app" : titleCase(editing.channel)}` : ""} onClose={() => setEditing(null)} onSubmit={tForm.handleSubmit((d) => saveTemplate.mutate(d))} submitting={saveTemplate.isPending} error={saveTemplate.isError ? saveTemplate.error : undefined} submitLabel={editing?.school ? "Save override" : "Create school override"}>
        {editing && !editing.school && <Alert type="info" showIcon style={{ marginBottom: 16 }} message="Editing creates a school-specific override; the platform default is kept and can be restored later." />}
        <TextField control={tForm.control} name="subject" label="Subject / title" required />
        <TextAreaField control={tForm.control} name="body" label="Body" required rows={5} />
        <SwitchField control={tForm.control} name="is_active" label="Active" help="Inactive templates suppress this notification on this channel." />
      </FormDrawer>
    </div>
  );
}

const feesSchema = z.object({ fee_billing_cycle: z.enum(["MONTHLY", "TERM", "ANNUAL"]), fee_due_day: z.number().int().min(1).max(28), fee_late_fee_amount: z.number().min(0), accepted_payment_methods: z.array(z.string()).min(1, "Accept at least one method") });

function FeesTab({ p, readOnly }: { p: SchoolProfile; readOnly: boolean }) {
  const form = useZodForm(feesSchema, { values: { fee_billing_cycle: p.fee_billing_cycle, fee_due_day: p.fee_due_day, fee_late_fee_amount: Number(p.fee_late_fee_amount), accepted_payment_methods: p.accepted_payment_methods } });
  const save = useProfileSave();
  const c = form.control;
  return (
    <form noValidate onSubmit={form.handleSubmit((d) => save.mutate(d, { onError: (e) => applyServerErrors(form.setError, fieldErrors(e)) }))}>
      {save.isError && <Alert type="error" showIcon message={errorMessage(save.error)} style={{ marginBottom: 12 }} />}
      <Card size="small" title="Transport fees" style={{ marginBottom: 16, maxWidth: 720 }}>
        <Row gutter={16}>
          <Col span={8}><SelectField control={c} name="fee_billing_cycle" label="Default billing cycle" required options={BILLING_CYCLE} allowClear={false} disabled={readOnly} /></Col>
          <Col span={8}><NumberField control={c} name="fee_due_day" label="Due day of month" required min={1} max={28} disabled={readOnly} /></Col>
          <Col span={8}><NumberField control={c} name="fee_late_fee_amount" label="Late fee amount" required min={0} disabled={readOnly} help={`In ${p.currency}`} /></Col>
          <Col span={24}><CheckboxGroupField control={c} name="accepted_payment_methods" label="Accepted payment methods" required options={PAYMENT_METHOD} disabled={readOnly} /></Col>
        </Row>
      </Card>
      {!readOnly && <Button type="primary" htmlType="submit" loading={save.isPending}>Save fee settings</Button>}
    </form>
  );
}

const contactSchema = z.object({ transport_office_phone: z.string().optional(), transport_office_email: z.string().email("Enter a valid email").optional().or(z.literal("")), emergency_contact_phone: z.string().optional(), parent_help_text: z.string().optional() });

function ContactTab({ p, readOnly }: { p: SchoolProfile; readOnly: boolean }) {
  const form = useZodForm(contactSchema, { values: { transport_office_phone: p.transport_office_phone, transport_office_email: p.transport_office_email, emergency_contact_phone: p.emergency_contact_phone, parent_help_text: p.parent_help_text } });
  const save = useProfileSave();
  const c = form.control;
  return (
    <form noValidate onSubmit={form.handleSubmit((d) => save.mutate(d, { onError: (e) => applyServerErrors(form.setError, fieldErrors(e)) }))}>
      {save.isError && <Alert type="error" showIcon message={errorMessage(save.error)} style={{ marginBottom: 12 }} />}
      <Card size="small" title="What parents see" style={{ marginBottom: 16, maxWidth: 720 }}>
        <Row gutter={16}>
          <Col span={12}><TextField control={c} name="transport_office_phone" label="Transport office phone" disabled={readOnly} /></Col>
          <Col span={12}><TextField control={c} name="transport_office_email" label="Transport office email" type="email" disabled={readOnly} /></Col>
          <Col span={12}><TextField control={c} name="emergency_contact_phone" label="Emergency phone" disabled={readOnly} /></Col>
          <Col span={24}><TextAreaField control={c} name="parent_help_text" label="Help text shown in the parent app" rows={3} disabled={readOnly} /></Col>
        </Row>
      </Card>
      {!readOnly && <Button type="primary" htmlType="submit" loading={save.isPending}>Save contact details</Button>}
    </form>
  );
}

function MembersTab() {
  const { hasPerm, user } = useAuth();
  const canManage = hasPerm("staff.manage");
  const qc = useQueryClient();
  const members = useTableParams({ ordering: "-created_at" });
  const invites = useTableParams({ ordering: "-created_at" });
  const toggle = useMutation({
    mutationFn: ({ m, on }: { m: Member; on: boolean }) => post<Member>(`/school/members/${m.id}/${on ? "activate" : "deactivate"}/`),
    onSuccess: (_, { on }) => { invalidate(qc, "members", "staff", "parents"); message.success(on ? "Access activated" : "Access deactivated"); },
    onError: (e) => message.error(errorMessage(e)),
  });
  const inviteAction = useMutation({
    mutationFn: ({ inv, action }: { inv: Invitation; action: "revoke" | "resend" }) => post<Invitation>(`/school/invitations/${inv.id}/${action}/`),
    onSuccess: (_, { action }) => { invalidate(qc, "invitations"); message.success(action === "revoke" ? "Invitation revoked" : "Invitation re-sent"); },
    onError: (e) => message.error(errorMessage(e)),
  });
  const memberColumns: ColumnsType<Member> = [
    { title: "Name", dataIndex: "full_name", render: (v: string, m) => <span style={{ fontWeight: 600 }}>{v}{m.user === user?.id && <Tag style={{ marginLeft: 8, fontSize: 11 }}>You</Tag>}</span> },
    { title: "Email", dataIndex: "email" },
    { title: "Role", dataIndex: "role", width: 170, render: (v: string) => titleCase(v) },
    { title: "Phone", dataIndex: "phone", width: 150, render: (v: string) => v || "-" },
    { title: "Access", key: "access", width: 120, render: (_, m) => (m.is_active && m.user_is_active ? <Tag color="green">Active</Tag> : <Tag color="red">Deactivated</Tag>) },
    { title: "Last login", dataIndex: "last_login", width: 160, render: (v: string | null) => fmtDateTime(v) },
    ...(canManage ? [{ title: "", key: "actions", width: 130, render: (_: unknown, m: Member) => (m.user === user?.id ? null : m.is_active ? <Button size="small" danger onClick={() => confirmAction({ title: `Deactivate ${m.full_name}?`, content: "They will be signed out and lose access to this school.", okText: "Deactivate", danger: true, onOk: () => toggle.mutateAsync({ m, on: false }) })}>Deactivate</Button> : <Button size="small" onClick={() => toggle.mutate({ m, on: true })}>Activate</Button>) }] : []),
  ];
  const inviteColumns: ColumnsType<Invitation> = [
    { title: "Email", dataIndex: "email", render: (v: string, i) => <span>{v}<div className="sbp-muted" style={{ fontSize: 12 }}>{`${i.first_name} ${i.last_name}`.trim()}</div></span> },
    { title: "Role", dataIndex: "role", width: 170, render: (v: string) => titleCase(v) },
    { title: "Status", dataIndex: "status", width: 110, render: (v: string) => <StatusBadge status={v} /> },
    { title: "Expires", dataIndex: "expires_at", width: 160, render: (v: string) => fmtDateTime(v) },
    { title: "Invited by", dataIndex: "invited_by_name", width: 160 },
    { title: "Sent", dataIndex: "created_at", width: 120, render: (v: string) => fmtDate(v) },
    { title: "Link", dataIndex: "accept_url", width: 90, render: (v: string | null) => (v ? <Typography.Text copyable={{ text: v, tooltips: ["Copy accept link (demo mode)", "Copied"] }} /> : "-") },
    ...(canManage ? [{ title: "", key: "actions", width: 160, render: (_: unknown, i: Invitation) => <Space>{i.status === "PENDING" && <Button size="small" onClick={() => inviteAction.mutate({ inv: i, action: "resend" })}>Resend</Button>}{i.status === "PENDING" && <Button size="small" danger onClick={() => confirmAction({ title: `Revoke the invitation for ${i.email}?`, okText: "Revoke", danger: true, onOk: () => inviteAction.mutateAsync({ inv: i, action: "revoke" }) })}>Revoke</Button>}{i.status === "EXPIRED" && <Button size="small" onClick={() => inviteAction.mutate({ inv: i, action: "resend" })}>Send again</Button>}</Space> }] : []),
  ];
  return (
    <div className="sbp-stack">
      <Card size="small" title="Members" extra={<span className="sbp-muted" style={{ fontSize: 12 }}>Staff and parents are invited from their own pages.</span>}>
        <DataTable<Member> queryKey="members" path="/school/members/" columns={memberColumns} tableState={members} searchPlaceholder="Search name or email" emptyTitle="No members" scrollX={1000} size="small" filters={<><FilterSelect value={members.params.role} onChange={(v) => members.setFilter("role", v)} options={MEMBER_ROLE} placeholder="Role" width={170} /><FilterSelect value={members.params.is_active} onChange={(v) => members.setFilter("is_active", v)} options={[{ value: "true", label: "Active" }, { value: "false", label: "Deactivated" }]} placeholder="Access" width={130} /></>} />
      </Card>
      <Card size="small" title="Invitations">
        <DataTable<Invitation> queryKey="invitations" path="/school/invitations/" columns={inviteColumns} tableState={invites} searchPlaceholder="Search email or name" emptyTitle="No invitations sent" emptyDescription="Invite staff from the Staff page and parents from the Parents page." scrollX={1000} size="small" filters={<FilterSelect value={invites.params.status} onChange={(v) => invites.setFilter("status", v)} options={INVITATION_STATUS} placeholder="Status" width={130} />} />
      </Card>
    </div>
  );
}

export default function SchoolSettingsPage() {
  const { hasPerm } = useAuth();
  const readOnly = !hasPerm("school.manage");
  const [params, setParams] = useSearchParams();
  const profile = useSchoolProfile();
  return (
    <div>
      <PageHeader title="Settings" subtitle="School profile, transport rules, notifications, fees and members." extra={profile.data?.subscription && <Tag color="geekblue">{profile.data.subscription.plan_name} plan · {titleCase(profile.data.subscription.status)}</Tag>} />
      {readOnly && <Alert type="info" showIcon style={{ marginBottom: 16 }} message="You can view these settings but only a School Admin can change them." />}
      <QueryState query={profile}>
        {(p) => (
          <Tabs
            activeKey={params.get("tab") || "profile"}
            onChange={(k) => setParams({ tab: k })}
            items={[
              { key: "profile", label: "Profile", children: <ProfileTab p={p} readOnly={readOnly} /> },
              { key: "rules", label: "Transport rules", children: <RulesTab p={p} readOnly={readOnly} /> },
              { key: "notifications", label: "Notifications", children: <NotificationsTab p={p} readOnly={readOnly} /> },
              { key: "fees", label: "Fees", children: <FeesTab p={p} readOnly={readOnly} /> },
              { key: "contact", label: "Parent contact", children: <ContactTab p={p} readOnly={readOnly} /> },
              ...(hasPerm("staff.view") ? [{ key: "members", label: "Members", children: <MembersTab /> }] : []),
            ]}
          />
        )}
      </QueryState>
    </div>
  );
}
