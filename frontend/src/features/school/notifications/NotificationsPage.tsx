import { useEffect, useState } from "react";
import { Button, Space, Tabs, Tag, Tooltip, Typography, message } from "antd";
import { CheckOutlined, SendOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { z } from "zod";
import { errorMessage, fieldErrors } from "@/api/client";
import { useAuth } from "@/app/auth";
import { SelectField, TextAreaField, TextField, applyServerErrors, useZodForm } from "@/components/forms/fields";
import { DataTable } from "@/components/ui/DataTable";
import { FilterSelect } from "@/components/ui/FilterSelect";
import { PageHeader } from "@/components/ui/PageHeader";
import { useTableParams } from "@/hooks/usePagedQuery";
import { fmtDateTime, titleCase } from "@/lib/format";
import type { Notification } from "@/types";
import { invalidate, post } from "../api";
import { FormDrawer } from "../components/FormDrawer";
import { RemoteSelect } from "../components/RemoteSelect";
import { NOTIFICATION_CATEGORY, SEND_AUDIENCE, SEND_CATEGORY } from "../constants";
import { routeLabel, useRouteOptions } from "../hooks";
import type { Student } from "../types";

const DELIVERY_COLOUR: Record<string, string> = { SENT: "green", PENDING: "gold", FAILED: "red", SKIPPED: "default" };

function Deliveries({ n }: { n: Notification }) {
  if (!n.deliveries?.length) return <span className="sbp-muted">-</span>;
  return (
    <Space size={4} wrap>
      {n.deliveries.map((d) => (
        <Tooltip key={d.channel} title={`${titleCase(d.channel)}: ${titleCase(d.status).toLowerCase()}${d.sent_at ? ` at ${fmtDateTime(d.sent_at)}` : ""}${d.attempts ? ` · ${d.attempts} attempt${d.attempts === 1 ? "" : "s"}` : ""}${d.last_error ? ` · ${d.last_error}` : ""}`}>
          <Tag color={DELIVERY_COLOUR[d.status] ?? "default"} style={{ fontSize: 11, marginInlineEnd: 0 }}>{d.channel === "IN_APP" ? "In-app" : titleCase(d.channel)}</Tag>
        </Tooltip>
      ))}
    </Space>
  );
}

function MineTab() {
  const qc = useQueryClient();
  const state = useTableParams();
  const refresh = () => invalidate(qc, "my-notifications", "unread", "notifications");
  const markRead = useMutation({ mutationFn: (n: Notification) => post(`/notifications/mine/${n.id}/read/`), onSuccess: refresh, onError: (e) => message.error(errorMessage(e)) });
  const readAll = useMutation({ mutationFn: () => post<{ updated: number }>("/notifications/mine/read-all/"), onSuccess: (r) => { refresh(); message.success(`${r.updated} notification${r.updated === 1 ? "" : "s"} marked as read`); }, onError: (e) => message.error(errorMessage(e)) });
  const columns: ColumnsType<Notification> = [
    { title: "Notification", key: "title", render: (_, n) => <span style={{ fontWeight: n.is_read ? 400 : 600 }}>{n.title}<Typography.Paragraph type="secondary" style={{ marginBottom: 0, fontSize: 12 }}>{n.body}</Typography.Paragraph></span> },
    { title: "Category", dataIndex: "category", width: 160, render: (v: string) => <Tag>{titleCase(v)}</Tag> },
    { title: "Related", key: "related", width: 160, render: (_, n) => <Space size={4}>{n.trip && <Link to={`/school/trips/${n.trip}`}>Trip</Link>}{n.student && <Link to={`/school/students/${n.student}`}>{n.student_name ?? "Student"}</Link>}</Space> },
    { title: "When", dataIndex: "created_at", width: 160, render: (v: string) => fmtDateTime(v) },
    { title: "", key: "actions", width: 120, render: (_, n) => (n.is_read ? <span className="sbp-muted" style={{ fontSize: 12 }}>Read</span> : <Button size="small" icon={<CheckOutlined />} onClick={() => markRead.mutate(n)}>Mark read</Button>) },
  ];
  return (
    <DataTable<Notification>
      queryKey="my-notifications"
      path="/notifications/mine/"
      columns={columns}
      tableState={state}
      searchPlaceholder="Search"
      emptyTitle="No notifications"
      emptyDescription="Alerts about trips, incidents, fees and complaints arrive here."
      scrollX={900}
      filters={
        <>
          <FilterSelect value={state.params.is_read} onChange={(v) => state.setFilter("is_read", v)} options={[{ value: "false", label: "Unread" }, { value: "true", label: "Read" }]} placeholder="Read state" width={130} />
          <FilterSelect value={state.params.category} onChange={(v) => state.setFilter("category", v)} options={NOTIFICATION_CATEGORY} placeholder="Category" width={190} />
        </>
      }
      toolbar={<Button onClick={() => readAll.mutate()} loading={readAll.isPending}>Mark all as read</Button>}
    />
  );
}

const sendSchema = z.object({
  audience: z.enum(["ALL_PARENTS", "ROUTE", "STUDENTS", "STAFF"]),
  route: z.string().nullable().optional(),
  title: z.string().trim().min(3, "Title is required").max(160),
  body: z.string().trim().min(5, "Write the message"),
  category: z.enum(["ANNOUNCEMENT", "SYSTEM", "TRIP_DELAY", "FEE_DUE"]),
}).superRefine((d, ctx) => {
  if (d.audience === "ROUTE" && !d.route) ctx.addIssue({ code: "custom", path: ["route"], message: "Select the route" });
});

function SendDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const routes = useRouteOptions();
  const [students, setStudents] = useState<string[]>([]);
  const form = useZodForm(sendSchema, { defaultValues: { audience: "ALL_PARENTS", route: null, title: "", body: "", category: "ANNOUNCEMENT" } });
  useEffect(() => {
    if (open) { form.reset({ audience: "ALL_PARENTS", route: null, title: "", body: "", category: "ANNOUNCEMENT" }); setStudents([]); }
  }, [open, form]);
  const audience = form.watch("audience");
  const send = useMutation({
    mutationFn: (d: z.input<typeof sendSchema>) => post<{ sent: number }>("/notifications/history/send/", { ...d, route: d.audience === "ROUTE" ? d.route : null, students: d.audience === "STUDENTS" ? students : [] }),
    onSuccess: (r) => { invalidate(qc, "notifications-history", "my-notifications", "unread"); message.success(`Sent to ${r.sent} recipient${r.sent === 1 ? "" : "s"}`); onClose(); },
    onError: (e) => applyServerErrors(form.setError, fieldErrors(e)),
  });
  return (
    <FormDrawer open={open} title="Send notification" onClose={onClose} onSubmit={form.handleSubmit((d) => { if (d.audience === "STUDENTS" && students.length === 0) { form.setError("audience", { message: "Pick at least one student" }); return; } send.mutate(d); })} submitting={send.isPending} error={send.isError ? send.error : undefined} submitLabel="Send">
      <SelectField control={form.control} name="audience" label="Audience" required options={SEND_AUDIENCE} allowClear={false} />
      {audience === "ROUTE" && <SelectField control={form.control} name="route" label="Route" required loading={routes.isLoading} options={(routes.data ?? []).map((r) => ({ value: r.id, label: routeLabel(r) }))} />}
      {audience === "STUDENTS" && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ marginBottom: 6, fontWeight: 500 }}>Students</div>
          <RemoteSelect<Student> path="/people/students/" queryKey="students" params={{ status: "ACTIVE" }} toOption={(s) => ({ value: s.id, label: `${s.full_name} · ${s.class_label}` })} mode="multiple" values={students} onChangeMany={setStudents} onChange={() => undefined} placeholder="Search students" />
        </div>
      )}
      <SelectField control={form.control} name="category" label="Category" required options={SEND_CATEGORY} allowClear={false} help="Parents can mute categories except incidents and cancellations." />
      <TextField control={form.control} name="title" label="Title" required />
      <TextAreaField control={form.control} name="body" label="Message" required rows={5} />
    </FormDrawer>
  );
}

function HistoryTab() {
  const { hasPerm } = useAuth();
  const canSend = hasPerm("engagement.manage");
  const state = useTableParams();
  const [sending, setSending] = useState(false);
  const columns: ColumnsType<Notification> = [
    { title: "When", dataIndex: "created_at", width: 160, render: (v: string) => fmtDateTime(v) },
    { title: "Recipient", key: "recipient", width: 220, render: (_, n) => <span>{n.recipient_name ?? "-"}<div className="sbp-muted" style={{ fontSize: 12 }}>{n.recipient_email}</div></span> },
    { title: "Category", dataIndex: "category", width: 150, render: (v: string) => <Tag>{titleCase(v)}</Tag> },
    { title: "Message", key: "message", render: (_, n) => <span><span style={{ fontWeight: 600 }}>{n.title}</span><Typography.Paragraph type="secondary" ellipsis={{ rows: 2 }} style={{ marginBottom: 0, fontSize: 12 }}>{n.body}</Typography.Paragraph></span> },
    { title: "Delivery", key: "delivery", width: 230, render: (_, n) => <Deliveries n={n} /> },
    { title: "Read", dataIndex: "is_read", width: 80, render: (v: boolean) => (v ? <Tag color="green">Read</Tag> : <Tag>Unread</Tag>) },
  ];
  return (
    <div>
      <DataTable<Notification>
        queryKey="notifications-history"
        path="/notifications/history/"
        columns={columns}
        tableState={state}
        searchPlaceholder="Search title, text, recipient"
        emptyTitle="Nothing sent yet"
        emptyDescription="Every notification the school sends, automatic or manual, is listed here with per-channel delivery status."
        scrollX={1200}
        filters={<FilterSelect value={state.params.category} onChange={(v) => state.setFilter("category", v)} options={NOTIFICATION_CATEGORY} placeholder="Category" width={190} />}
        toolbar={canSend && <Button type="primary" icon={<SendOutlined />} onClick={() => setSending(true)}>Send notification</Button>}
      />
      <SendDrawer open={sending} onClose={() => setSending(false)} />
    </div>
  );
}

export default function NotificationsPage() {
  const { hasPerm } = useAuth();
  const [params, setParams] = useSearchParams();
  return (
    <div>
      <PageHeader title="Notifications" subtitle="Your own alerts, and everything the school has sent to parents and staff." />
      <Tabs activeKey={params.get("tab") || "mine"} onChange={(k) => setParams({ tab: k })} items={[{ key: "mine", label: "Mine", children: <MineTab /> }, ...(hasPerm("engagement.view") ? [{ key: "history", label: "Sent history", children: <HistoryTab /> }] : [])]} />
    </div>
  );
}
