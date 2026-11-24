import { useState } from "react";
import { App, Button, Drawer, Modal, Typography } from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { PlusOutlined, RightOutlined, SendOutlined } from "@ant-design/icons";
import { useAuth } from "@/app/auth";
import { fieldErrors } from "@/api/client";
import { SelectField, TextAreaField, TextField, applyServerErrors, useZodForm } from "@/components/forms/fields";
import { PageHeader } from "@/components/ui/PageHeader";
import { InlineError, QueryState } from "@/components/ui/States";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { fmtDateTime, fromNow } from "@/lib/format";
import { parentApi, qk } from "../api";
import { useParent } from "../context";
import { COMPLAINT_CATEGORY_LABELS, COMPLAINT_PRIORITY_LABELS } from "../labels";
import { complaintSchema, replySchema, type ComplaintFormValues, type ReplyFormValues } from "../schemas";
import type { Complaint, ComplaintCategory, ComplaintInput, ComplaintPriority } from "../types";

export default function ParentComplaintsPage() {
  const [params, setParams] = useSearchParams();
  const openNew = params.get("new") === "1";
  const openId = params.get("id");
  const [formOpen, setFormOpen] = useState(openNew);
  const list = useQuery({ queryKey: qk.complaints, queryFn: parentApi.complaints });
  const active = (list.data ?? []).find((c) => c.id === openId) ?? null;
  const closeForm = () => {
    setFormOpen(false);
    if (openNew) setParams({});
  };
  return (
    <div className="sbp-stack">
      <PageHeader
        compact
        title="Complaints"
        subtitle="Raise an issue and follow the school's replies"
        crumbs={[{ label: "More", to: "/parent/more" }, { label: "Complaints" }]}
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormOpen(true)}>
            New complaint
          </Button>
        }
      />
      <QueryState query={list} rows={5} isEmpty={(d) => d.length === 0} emptyTitle="No complaints raised" emptyDescription="Report delays, safety concerns, vehicle condition or billing problems. The transport office replies here.">
        {(rows) => (
          <div className="sbp-stack" style={{ gap: 8 }}>
            {rows.map((c) => (
              <ComplaintRow key={c.id} c={c} onOpen={() => setParams({ id: c.id })} />
            ))}
          </div>
        )}
      </QueryState>
      <ComplaintThread complaint={active} onClose={() => setParams({})} />
      {formOpen && <ComplaintFormModal onClose={closeForm} onCreated={(c) => setParams({ id: c.id })} />}
    </div>
  );
}

function ComplaintRow({ c, onOpen }: { c: Complaint; onOpen: () => void }) {
  return (
    <div role="button" tabIndex={0} onClick={onOpen} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onOpen()} className="sbp-list-card" style={{ cursor: "pointer", alignItems: "flex-start", margin: 0 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="sbp-between" style={{ gap: 8 }}>
          <span style={{ fontWeight: 600 }}>{c.subject}</span>
          <StatusBadge status={c.status} />
        </div>
        <div className="sbp-muted" style={{ fontSize: 12, marginTop: 4 }}>
          {c.ticket_number} · {COMPLAINT_CATEGORY_LABELS[c.category] ?? c.category} · {COMPLAINT_PRIORITY_LABELS[c.priority] ?? c.priority} priority
          {c.student_name ? ` · ${c.student_name}` : ""}
        </div>
        <div className="sbp-muted" style={{ fontSize: 12, marginTop: 4 }}>
          {c.comments.length} {c.comments.length === 1 ? "reply" : "replies"} · updated {fromNow(c.updated_at)}
        </div>
      </div>
      <RightOutlined aria-hidden style={{ color: "var(--sbp-text-muted)", marginTop: 4 }} />
    </div>
  );
}

function ComplaintThread({ complaint, onClose }: { complaint: Complaint | null; onClose: () => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { message } = App.useApp();
  const form = useZodForm(replySchema, { defaultValues: { body: "" } });
  const reply = useMutation({
    mutationFn: (d: ReplyFormValues) => parentApi.addComplaintComment(complaint!.id, d.body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.complaints });
      form.reset({ body: "" });
      message.success("Reply sent");
    },
    onError: (e) => applyServerErrors(form.setError, fieldErrors(e)),
  });
  return (
    <Drawer open={!!complaint} onClose={onClose} title={complaint ? `${complaint.ticket_number} · ${complaint.subject}` : ""} width="min(560px, 100vw)" styles={{ body: { display: "flex", flexDirection: "column", gap: 12 } }}>
      {complaint && (
        <>
          <div className="sbp-row" style={{ flexWrap: "wrap" }}>
            <StatusBadge status={complaint.status} />
            <StatusBadge status={complaint.priority} label={`${COMPLAINT_PRIORITY_LABELS[complaint.priority] ?? complaint.priority} priority`} />
            <span className="sbp-muted" style={{ fontSize: 12 }}>
              {COMPLAINT_CATEGORY_LABELS[complaint.category] ?? complaint.category}
              {complaint.student_name ? ` · ${complaint.student_name}` : ""}
            </span>
          </div>
          <div className="sbp-surface" style={{ padding: 12 }}>
            <div className="sbp-muted" style={{ fontSize: 12, marginBottom: 4 }}>
              You · {fmtDateTime(complaint.created_at)}
            </div>
            <Typography.Paragraph style={{ margin: 0, whiteSpace: "pre-line" }}>{complaint.description}</Typography.Paragraph>
          </div>
          {complaint.comments.map((cm) => {
            const mine = !!user && cm.author_name === user.full_name;
            return (
              <div key={cm.id} className="sbp-surface" style={{ padding: 12, marginLeft: mine ? 24 : 0, marginRight: mine ? 0 : 24, background: mine ? "var(--sbp-primary-soft)" : undefined }}>
                <div className="sbp-muted" style={{ fontSize: 12, marginBottom: 4 }}>
                  {mine ? "You" : cm.author_name ?? "School"} · {fmtDateTime(cm.created_at)}
                </div>
                <div style={{ whiteSpace: "pre-line" }}>{cm.body}</div>
              </div>
            );
          })}
          {complaint.resolution_notes && (
            <div className="sbp-surface" style={{ padding: 12, borderColor: "var(--sbp-success)" }}>
              <div className="sbp-kicker" style={{ color: "var(--sbp-success)" }}>
                Resolution
              </div>
              <div style={{ whiteSpace: "pre-line" }}>{complaint.resolution_notes}</div>
              {complaint.resolved_at && (
                <div className="sbp-muted" style={{ fontSize: 12, marginTop: 4 }}>
                  {fmtDateTime(complaint.resolved_at)}
                </div>
              )}
            </div>
          )}
          <form onSubmit={form.handleSubmit((d) => reply.mutate(d))} noValidate style={{ marginTop: "auto" }}>
            {reply.isError && <InlineError error={reply.error} />}
            <TextAreaField control={form.control} name="body" label="Reply" rows={3} placeholder="Add more details or ask for an update" />
            <Button type="primary" htmlType="submit" size="large" block icon={<SendOutlined />} loading={reply.isPending}>
              Send reply
            </Button>
          </form>
        </>
      )}
    </Drawer>
  );
}

function ComplaintFormModal({ onClose, onCreated }: { onClose: () => void; onCreated: (c: Complaint) => void }) {
  const { children, selectedId } = useParent();
  const qc = useQueryClient();
  const { message } = App.useApp();
  const form = useZodForm(complaintSchema, { defaultValues: { student: selectedId ?? null, category: "DELAY", priority: "NORMAL", subject: "", description: "" } });
  const create = useMutation({
    mutationFn: (d: ComplaintFormValues) => parentApi.createComplaint({ ...d, student: d.student || null } as ComplaintInput),
    onSuccess: (c) => {
      qc.invalidateQueries({ queryKey: qk.complaints });
      message.success(`Complaint ${c.ticket_number} submitted`);
      onClose();
      onCreated(c);
    },
    onError: (e) => applyServerErrors(form.setError, fieldErrors(e)),
  });
  return (
    <Modal open onCancel={onClose} footer={null} title="New complaint" centered>
      <form onSubmit={form.handleSubmit((d) => create.mutate(d))} noValidate>
        {create.isError && <InlineError error={create.error} />}
        <SelectField control={form.control} name="student" label="About which child" options={children.map((c) => ({ value: c.id, label: `${c.name} · ${c.class_label}` }))} placeholder="Not about a specific child" />
        <SelectField
          control={form.control}
          name="category"
          label="Category"
          required
          allowClear={false}
          options={(Object.keys(COMPLAINT_CATEGORY_LABELS) as ComplaintCategory[]).map((k) => ({ value: k, label: COMPLAINT_CATEGORY_LABELS[k] }))}
        />
        <SelectField
          control={form.control}
          name="priority"
          label="Priority"
          required
          allowClear={false}
          options={(Object.keys(COMPLAINT_PRIORITY_LABELS) as ComplaintPriority[]).map((k) => ({ value: k, label: COMPLAINT_PRIORITY_LABELS[k] }))}
        />
        <TextField control={form.control} name="subject" label="Subject" required placeholder="Short summary" />
        <TextAreaField control={form.control} name="description" label="What happened?" required rows={4} placeholder="Include the date, time, bus and anything that helps the school investigate" />
        <Button type="primary" htmlType="submit" size="large" block className="sbp-touch-btn" loading={create.isPending}>
          Submit complaint
        </Button>
      </form>
    </Modal>
  );
}
