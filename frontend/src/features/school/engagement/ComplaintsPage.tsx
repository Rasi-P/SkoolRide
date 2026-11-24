import { useEffect, useState } from "react";
import { Button, Card, Col, Drawer, Input, List, Row, Select, Space, Switch, Tag, Typography, message } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { z } from "zod";
import { errorMessage, fieldErrors } from "@/api/client";
import { useAuth } from "@/app/auth";
import { SelectField, TextAreaField, TextField, applyServerErrors, useZodForm } from "@/components/forms/fields";
import { DataTable } from "@/components/ui/DataTable";
import { FilterSelect } from "@/components/ui/FilterSelect";
import { KeyValue } from "@/components/ui/Misc";
import { PageHeader } from "@/components/ui/PageHeader";
import { QueryState } from "@/components/ui/States";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useTableParams } from "@/hooks/usePagedQuery";
import { fmtDateTime, titleCase } from "@/lib/format";
import { get, invalidate, listAll, patch, post } from "../api";
import { FormDrawer } from "../components/FormDrawer";
import { RemoteSelectField } from "../components/RemoteSelect";
import { COMPLAINT_CATEGORY, COMPLAINT_PRIORITY, COMPLAINT_STATUS } from "../constants";
import type { Complaint, Member, Student } from "../types";

const createSchema = z.object({
  subject: z.string().trim().min(3, "Subject is required"),
  description: z.string().trim().min(5, "Describe the complaint"),
  category: z.string().min(1, "Select a category"),
  priority: z.enum(["LOW", "NORMAL", "HIGH"]),
  student: z.string().nullable().optional(),
});

function useManagers() {
  return useQuery({ queryKey: ["members", "managers"], queryFn: () => listAll<Member>("/school/members/", { is_active: true }), select: (rows) => rows.filter((m) => m.role === "SCHOOL_ADMIN" || m.role === "TRANSPORT_MANAGER") });
}

function ComplaintDrawer({ id, onClose, canManage }: { id: string | null; onClose: () => void; canManage: boolean }) {
  const qc = useQueryClient();
  const complaint = useQuery({ queryKey: ["complaint", id], queryFn: () => get<Complaint>(`/engagement/complaints/${id}/`), enabled: !!id });
  const managers = useManagers();
  const [comment, setComment] = useState("");
  const [internal, setInternal] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [resolution, setResolution] = useState("");
  useEffect(() => {
    if (complaint.data) {
      setResolution(complaint.data.resolution_notes);
      setStatus(null);
    }
  }, [complaint.data]);
  const refresh = () => invalidate(qc, "complaint", "complaints", "dashboard");
  const addComment = useMutation({ mutationFn: () => post(`/engagement/complaints/${id}/comments/`, { body: comment.trim(), is_internal: internal }), onSuccess: () => { refresh(); setComment(""); message.success(internal ? "Internal note added" : "Reply sent to the parent"); }, onError: (e) => message.error(errorMessage(e)) });
  const setStatusM = useMutation({ mutationFn: (s: string) => post(`/engagement/complaints/${id}/set-status/`, { status: s, resolution_notes: resolution }), onSuccess: () => { refresh(); message.success("Status updated"); }, onError: (e) => message.error(errorMessage(e)) });
  const update = useMutation({ mutationFn: (body: Partial<Pick<Complaint, "assigned_to" | "priority" | "category">>) => patch(`/engagement/complaints/${id}/`, body), onSuccess: () => { refresh(); message.success("Complaint updated"); }, onError: (e) => message.error(errorMessage(e)) });
  return (
    <Drawer open={!!id} onClose={onClose} width={720} title={complaint.data ? `${complaint.data.ticket_number} · ${complaint.data.subject}` : "Complaint"} destroyOnHidden>
      <QueryState query={complaint}>
        {(c) => (
          <div className="sbp-stack">
            <Space wrap><StatusBadge status={c.status} /><StatusBadge status={c.priority} label={`${titleCase(c.priority)} priority`} /><Tag>{titleCase(c.category)}</Tag></Space>
            <KeyValue items={[
              { label: "Raised by", value: `${c.raised_by_name ?? "-"}${c.raised_by_email ? ` · ${c.raised_by_email}` : ""}` },
              { label: "Student", value: c.student ? <Link to={`/school/students/${c.student}`}>{c.student_name}</Link> : "-" },
              { label: "Trip", value: c.trip ? <Link to={`/school/trips/${c.trip}`}>Open trip</Link> : "-" },
              { label: "Assigned to", value: c.assigned_to_name ?? "Unassigned" },
              { label: "Opened", value: fmtDateTime(c.created_at) },
              { label: "Resolved", value: fmtDateTime(c.resolved_at) },
            ]} />
            <Card size="small" title="Description"><Typography.Paragraph style={{ whiteSpace: "pre-wrap", marginBottom: 0 }}>{c.description}</Typography.Paragraph></Card>
            {canManage && (
              <Card size="small" title="Triage">
                <Row gutter={[12, 12]}>
                  <Col xs={24} md={8}><div className="sbp-muted" style={{ fontSize: 12 }}>Assign to</div><Select aria-label="Assign to" style={{ width: "100%" }} allowClear placeholder="Unassigned" loading={managers.isLoading} value={c.assigned_to ?? undefined} options={(managers.data ?? []).map((m) => ({ value: m.user, label: `${m.full_name} (${titleCase(m.role)})` }))} onChange={(v) => update.mutate({ assigned_to: v ?? null })} /></Col>
                  <Col xs={24} md={8}><div className="sbp-muted" style={{ fontSize: 12 }}>Priority</div><Select aria-label="Priority" style={{ width: "100%" }} value={c.priority} options={COMPLAINT_PRIORITY} onChange={(v) => update.mutate({ priority: v as Complaint["priority"] })} /></Col>
                  <Col xs={24} md={8}><div className="sbp-muted" style={{ fontSize: 12 }}>Category</div><Select aria-label="Category" style={{ width: "100%" }} value={c.category} options={COMPLAINT_CATEGORY} onChange={(v) => update.mutate({ category: v })} /></Col>
                  <Col xs={24} md={8}><div className="sbp-muted" style={{ fontSize: 12 }}>Status</div><Select aria-label="Status" style={{ width: "100%" }} value={status ?? c.status} options={COMPLAINT_STATUS} onChange={(v) => setStatus(v)} /></Col>
                  <Col xs={24} md={16}><div className="sbp-muted" style={{ fontSize: 12 }}>Resolution notes (shared with the parent)</div><Input.TextArea aria-label="Resolution notes" rows={2} value={resolution} onChange={(e) => setResolution(e.target.value)} /></Col>
                  <Col xs={24}><Button type="primary" loading={setStatusM.isPending} disabled={(status ?? c.status) === c.status && resolution === c.resolution_notes} onClick={() => setStatusM.mutate(status ?? c.status)}>Update status</Button></Col>
                </Row>
              </Card>
            )}
            <Card size="small" title={`Conversation (${c.comments.length})`}>
              <List
                size="small"
                dataSource={c.comments}
                locale={{ emptyText: "No replies yet" }}
                renderItem={(m) => (
                  <List.Item style={{ background: m.is_internal ? "#fef3c7" : undefined, borderRadius: 8, padding: "8px 12px", marginBottom: 6 }}>
                    <List.Item.Meta title={<span style={{ fontSize: 13 }}>{m.author_name ?? "Unknown"} {m.is_internal && <Tag color="gold" style={{ fontSize: 11 }}>Internal</Tag>}<span className="sbp-muted" style={{ fontWeight: 400, marginLeft: 8, fontSize: 12 }}>{fmtDateTime(m.created_at)}</span></span>} description={<span style={{ whiteSpace: "pre-wrap", color: "var(--sbp-text)" }}>{m.body}</span>} />
                  </List.Item>
                )}
              />
              {canManage && (
                <div className="sbp-stack" style={{ marginTop: 8 }}>
                  <Input.TextArea aria-label="Reply" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder={internal ? "Internal note (not visible to the parent)" : "Reply to the parent"} />
                  <div className="sbp-between">
                    <label className="sbp-row"><Switch size="small" checked={internal} onChange={setInternal} /> Internal note</label>
                    <Button type="primary" disabled={comment.trim().length === 0} loading={addComment.isPending} onClick={() => addComment.mutate()}>{internal ? "Add note" : "Send reply"}</Button>
                  </div>
                </div>
              )}
            </Card>
          </div>
        )}
      </QueryState>
    </Drawer>
  );
}

function CreateComplaintDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const form = useZodForm(createSchema, { defaultValues: { subject: "", description: "", category: "OTHER", priority: "NORMAL", student: null } });
  const create = useMutation({
    mutationFn: (d: z.input<typeof createSchema>) => post<Complaint>("/engagement/complaints/", { ...d, student: d.student || null }),
    onSuccess: (c) => { invalidate(qc, "complaints", "dashboard"); message.success(`Complaint ${c.ticket_number} logged`); form.reset(); onClose(); },
    onError: (e) => applyServerErrors(form.setError, fieldErrors(e)),
  });
  return (
    <FormDrawer open={open} title="Log a complaint" onClose={onClose} onSubmit={form.handleSubmit((d) => create.mutate(d))} submitting={create.isPending} error={create.isError ? create.error : undefined} submitLabel="Log complaint">
      <TextField control={form.control} name="subject" label="Subject" required />
      <Row gutter={16}>
        <Col span={12}><SelectField control={form.control} name="category" label="Category" required options={COMPLAINT_CATEGORY} allowClear={false} /></Col>
        <Col span={12}><SelectField control={form.control} name="priority" label="Priority" required options={COMPLAINT_PRIORITY} allowClear={false} /></Col>
      </Row>
      <RemoteSelectField<z.input<typeof createSchema>, Student> control={form.control} name="student" label="Student (optional)" path="/people/students/" queryKey="students" toOption={(s) => ({ value: s.id, label: `${s.full_name} · ${s.class_label}` })} placeholder="Search students" />
      <TextAreaField control={form.control} name="description" label="Description" required rows={4} />
    </FormDrawer>
  );
}

export default function ComplaintsPage() {
  const { hasPerm } = useAuth();
  const canManage = hasPerm("engagement.manage");
  const [params, setParams] = useSearchParams();
  const openId = params.get("open");
  const state = useTableParams({ ordering: "-created_at" });
  const [creating, setCreating] = useState(false);
  const columns: ColumnsType<Complaint> = [
    { title: "Ticket", dataIndex: "ticket_number", width: 120, render: (v: string) => <span style={{ fontWeight: 600 }}>{v}</span> },
    { title: "Subject", dataIndex: "subject", render: (v: string, r) => <span>{v}{r.student_name && <div className="sbp-muted" style={{ fontSize: 12 }}>{r.student_name}</div>}</span> },
    { title: "Category", dataIndex: "category", width: 170, render: (v: string) => titleCase(v) },
    { title: "Priority", dataIndex: "priority", sorter: true, width: 100, render: (v: string) => <StatusBadge status={v} /> },
    { title: "Status", dataIndex: "status", sorter: true, width: 120, render: (v: string) => <StatusBadge status={v} /> },
    { title: "Assigned", dataIndex: "assigned_to_name", width: 150, render: (v: string | null) => v ?? <span className="sbp-muted">Unassigned</span> },
    { title: "Raised by", dataIndex: "raised_by_name", width: 150, render: (v: string | null) => v ?? "-" },
    { title: "Replies", key: "replies", width: 80, align: "right", render: (_, r) => r.comments.length },
    { title: "Opened", dataIndex: "created_at", sorter: true, width: 160, render: (v: string) => fmtDateTime(v) },
  ];
  return (
    <div>
      <PageHeader title="Complaints" subtitle="Parent complaints and their resolution threads." extra={canManage && <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>Log complaint</Button>} />
      <DataTable<Complaint>
        queryKey="complaints"
        path="/engagement/complaints/"
        columns={columns}
        tableState={state}
        searchPlaceholder="Search ticket, subject, student"
        exportPath="/engagement/complaints/export/"
        exportFilename="complaints.csv"
        initialOrdering="-created_at"
        emptyTitle="No complaints"
        emptyDescription="Complaints raised by parents in the app appear here."
        scrollX={1200}
        filters={
          <>
            <FilterSelect value={state.params.status} onChange={(v) => state.setFilter("status", v)} options={COMPLAINT_STATUS} placeholder="Status" width={140} />
            <FilterSelect value={state.params.category} onChange={(v) => state.setFilter("category", v)} options={COMPLAINT_CATEGORY} placeholder="Category" width={200} />
            <FilterSelect value={state.params.priority} onChange={(v) => state.setFilter("priority", v)} options={COMPLAINT_PRIORITY} placeholder="Priority" width={120} />
          </>
        }
        onRow={(r) => ({ onClick: () => setParams({ open: r.id }), style: { cursor: "pointer" } })}
      />
      <ComplaintDrawer id={openId} onClose={() => setParams({})} canManage={canManage} />
      <CreateComplaintDrawer open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}
