import { useEffect, useState } from "react";
import { Button, Space, Tag, Typography, message } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { errorMessage, fieldErrors } from "@/api/client";
import { useAuth } from "@/app/auth";
import { SelectField, SwitchField, TextAreaField, TextField, applyServerErrors, useZodForm } from "@/components/forms/fields";
import { confirmAction } from "@/components/ui/ConfirmDialog";
import { DataTable } from "@/components/ui/DataTable";
import { FilterSelect } from "@/components/ui/FilterSelect";
import { PageHeader } from "@/components/ui/PageHeader";
import { useTableParams } from "@/hooks/usePagedQuery";
import { dayjs, fmtDateTime, titleCase } from "@/lib/format";
import { invalidate, patch, post } from "../api";
import { DateTimeField } from "../components/ExtraFields";
import { FormDrawer } from "../components/FormDrawer";
import { ANNOUNCEMENT_AUDIENCE } from "../constants";
import { routeLabel, useRouteOptions } from "../hooks";
import type { Announcement } from "../types";

const schema = z.object({
  title: z.string().trim().min(3, "Title is required"),
  body: z.string().trim().min(5, "Write the announcement"),
  audience: z.enum(["ALL", "PARENTS", "STAFF", "ROUTE"]),
  route: z.string().nullable().optional(),
  is_pinned: z.boolean(),
  publish_at: z.string({ invalid_type_error: "Publish time is required" }).min(1, "Publish time is required"),
  expires_at: z.string().nullable().optional(),
  send_notification: z.boolean(),
}).superRefine((d, ctx) => {
  if (d.audience === "ROUTE" && !d.route) ctx.addIssue({ code: "custom", path: ["route"], message: "Select the route" });
  if (d.expires_at && d.expires_at <= d.publish_at) ctx.addIssue({ code: "custom", path: ["expires_at"], message: "Expiry must be after the publish time" });
});
type Input = z.input<typeof schema>;
const toDefaults = (a: Announcement | null): Input => ({ title: a?.title ?? "", body: a?.body ?? "", audience: a?.audience ?? "PARENTS", route: a?.route ?? null, is_pinned: a?.is_pinned ?? false, publish_at: a?.publish_at ?? dayjs().toISOString(), expires_at: a?.expires_at ?? null, send_notification: true });

function AnnouncementDrawer({ open, announcement, onClose }: { open: boolean; announcement: Announcement | null; onClose: () => void }) {
  const qc = useQueryClient();
  const routes = useRouteOptions();
  const form = useZodForm(schema, { defaultValues: toDefaults(announcement) });
  useEffect(() => {
    if (open) form.reset(toDefaults(announcement));
  }, [open, announcement, form]);
  const audience = form.watch("audience");
  const save = useMutation({
    mutationFn: (d: Input) => {
      const body = { ...d, route: d.audience === "ROUTE" ? d.route : null };
      return announcement ? patch<Announcement>(`/engagement/announcements/${announcement.id}/`, body) : post<Announcement>("/engagement/announcements/", body);
    },
    onSuccess: () => { invalidate(qc, "announcements", "dashboard", "notifications-history"); message.success(announcement ? "Announcement updated" : "Announcement published"); onClose(); },
    onError: (e) => applyServerErrors(form.setError, fieldErrors(e)),
  });
  return (
    <FormDrawer open={open} title={announcement ? "Edit announcement" : "New announcement"} onClose={onClose} onSubmit={form.handleSubmit((d) => save.mutate(d))} submitting={save.isPending} error={save.isError ? save.error : undefined} submitLabel={announcement ? "Save changes" : "Publish"}>
      <TextField control={form.control} name="title" label="Title" required />
      <TextAreaField control={form.control} name="body" label="Message" required rows={5} />
      <SelectField control={form.control} name="audience" label="Audience" required options={ANNOUNCEMENT_AUDIENCE} allowClear={false} />
      {audience === "ROUTE" && <SelectField control={form.control} name="route" label="Route" required loading={routes.isLoading} options={(routes.data ?? []).map((r) => ({ value: r.id, label: routeLabel(r) }))} />}
      <DateTimeField control={form.control} name="publish_at" label="Publish at" required help="Future times schedule the announcement." />
      <DateTimeField control={form.control} name="expires_at" label="Expires at" help="Optional; hidden from the parent app afterwards." />
      <SwitchField control={form.control} name="is_pinned" label="Pin to the top" />
      {!announcement && <SwitchField control={form.control} name="send_notification" label="Send a push / in-app notification" help="Only when the announcement is live at publish time." />}
    </FormDrawer>
  );
}

export default function AnnouncementsPage() {
  const { hasPerm } = useAuth();
  const canManage = hasPerm("announcements.manage");
  const qc = useQueryClient();
  const state = useTableParams();
  const [editing, setEditing] = useState<Announcement | "new" | null>(null);
  const publish = useMutation({
    mutationFn: (a: Announcement) => post<{ sent: number }>(`/engagement/announcements/${a.id}/publish/`),
    onSuccess: (r) => { invalidate(qc, "announcements", "notifications-history", "dashboard"); message.success(`Notification sent to ${r.sent} recipient${r.sent === 1 ? "" : "s"}`); },
    onError: (e) => message.error(errorMessage(e)),
  });
  const columns: ColumnsType<Announcement> = [
    { title: "Announcement", dataIndex: "title", render: (v: string, r) => <span><span style={{ fontWeight: 600 }}>{v}</span> {r.is_pinned && <Tag color="blue" style={{ fontSize: 11 }}>Pinned</Tag>}<Typography.Paragraph type="secondary" ellipsis={{ rows: 2 }} style={{ marginBottom: 0, fontSize: 12 }}>{r.body}</Typography.Paragraph></span> },
    { title: "Audience", key: "audience", width: 190, render: (_, r) => <span>{titleCase(r.audience)}{r.route_name ? <div className="sbp-muted" style={{ fontSize: 12 }}>{r.route_name}</div> : null}</span> },
    { title: "Publish", dataIndex: "publish_at", width: 160, render: (v: string) => fmtDateTime(v) },
    { title: "Expires", dataIndex: "expires_at", width: 160, render: (v: string | null) => fmtDateTime(v) },
    { title: "State", key: "state", width: 110, render: (_, r) => (r.is_live ? <Tag color="green">Live</Tag> : dayjs(r.publish_at).isAfter(dayjs()) ? <Tag color="blue">Scheduled</Tag> : <Tag>Expired</Tag>) },
    { title: "Notified", dataIndex: "notification_sent_at", width: 160, render: (v: string | null) => (v ? fmtDateTime(v) : <span className="sbp-muted">Not sent</span>) },
    { title: "By", dataIndex: "created_by_name", width: 140, render: (v: string | null) => v ?? "-" },
    ...(canManage ? [{ title: "", key: "actions", width: 190, render: (_: unknown, r: Announcement) => <Space><Button size="small" onClick={() => setEditing(r)}>Edit</Button><Button size="small" disabled={!r.is_live} loading={publish.isPending && publish.variables?.id === r.id} onClick={() => confirmAction({ title: r.notification_sent_at ? "Resend this announcement as a notification?" : "Send this announcement as a notification?", content: `Recipients: ${titleCase(r.audience)}${r.route_name ? ` on ${r.route_name}` : ""}.`, okText: "Send", onOk: () => publish.mutateAsync(r) })}>{r.notification_sent_at ? "Resend" : "Notify"}</Button></Space> }] : []),
  ];
  return (
    <div>
      <PageHeader title="Announcements" subtitle="Notices shown in the parent and staff apps, optionally pushed as notifications." extra={canManage && <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing("new")}>New announcement</Button>} />
      <DataTable<Announcement>
        queryKey="announcements"
        path="/engagement/announcements/"
        columns={columns}
        tableState={state}
        searchPlaceholder="Search title or text"
        emptyTitle="No announcements yet"
        emptyDescription="Publish holiday notices, fee reminders or route changes for parents and staff."
        scrollX={1200}
        filters={<FilterSelect value={state.params.audience} onChange={(v) => state.setFilter("audience", v)} options={ANNOUNCEMENT_AUDIENCE} placeholder="Audience" width={180} />}
      />
      <AnnouncementDrawer open={editing !== null} announcement={editing === "new" ? null : editing} onClose={() => setEditing(null)} />
    </div>
  );
}
