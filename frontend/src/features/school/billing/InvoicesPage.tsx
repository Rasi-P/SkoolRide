import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Col, Input, Modal, Row, message } from "antd";
import { FileAddOutlined, PlusOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";
import { buildQuery, fieldErrors } from "@/api/client";
import { useAuth } from "@/app/auth";
import { DateField, NumberField, SelectField, TextAreaField, TextField, applyServerErrors, useZodForm } from "@/components/forms/fields";
import { DataTable } from "@/components/ui/DataTable";
import { FilterSelect } from "@/components/ui/FilterSelect";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { InlineError } from "@/components/ui/States";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useTableParams } from "@/hooks/usePagedQuery";
import { dayjs, fmtDate, fmtMoney } from "@/lib/format";
import { get, invalidate, listAll, post } from "../api";
import { DateRangeFilter, type DateRange } from "../components/DateRangeFilter";
import { FormDrawer } from "../components/FormDrawer";
import { RemoteSelect, RemoteSelectField } from "../components/RemoteSelect";
import { INVOICE_STATUS } from "../constants";
import type { BillingSummary, FeePlan, Invoice, InvoiceDetail, Student } from "../types";

const generateSchema = z.object({ anchor_date: z.string({ invalid_type_error: "Pick the billing period date" }).min(1, "Pick the billing period date"), due_date: z.string().nullable().optional() });
const createSchema = z.object({
  student: z.string({ invalid_type_error: "Select a student" }).min(1, "Select a student"),
  fee_plan: z.string({ invalid_type_error: "Select a fee plan" }).min(1, "Select a fee plan"),
  period_label: z.string().trim().min(2, "Period label is required"),
  period_start: z.string({ invalid_type_error: "Required" }).min(1, "Required"),
  period_end: z.string({ invalid_type_error: "Required" }).min(1, "Required"),
  due_date: z.string({ invalid_type_error: "Required" }).min(1, "Required"),
  amount: z.number().min(0).nullable().optional(),
  discount: z.number().min(0).nullable().optional(),
  description: z.string().optional(),
}).refine((d) => d.period_end >= d.period_start, { path: ["period_end"], message: "Period end must be after start" });

function CreateInvoiceDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const plans = useQuery({ queryKey: ["opts-fee-plans-all"], queryFn: () => listAll<FeePlan>("/billing/fee-plans/"), enabled: open });
  const form = useZodForm(createSchema, { defaultValues: { student: "", fee_plan: "", period_label: dayjs().format("MMMM YYYY"), period_start: dayjs().startOf("month").format("YYYY-MM-DD"), period_end: dayjs().endOf("month").format("YYYY-MM-DD"), due_date: dayjs().add(10, "day").format("YYYY-MM-DD"), amount: null, discount: 0, description: "" } });
  useEffect(() => {
    if (open) form.reset({ student: "", fee_plan: "", period_label: dayjs().format("MMMM YYYY"), period_start: dayjs().startOf("month").format("YYYY-MM-DD"), period_end: dayjs().endOf("month").format("YYYY-MM-DD"), due_date: dayjs().add(10, "day").format("YYYY-MM-DD"), amount: null, discount: 0, description: "" });
  }, [open, form]);
  const create = useMutation({
    mutationFn: (d: z.input<typeof createSchema>) => post<InvoiceDetail>("/billing/invoices/", { ...d, amount: d.amount ?? undefined, discount: d.discount ?? 0 }),
    onSuccess: (inv) => { invalidate(qc, "invoices", "billing-summary", "student-invoices", "dashboard"); message.success(`Invoice ${inv.invoice_number} created`); onClose(); navigate(`/school/invoices/${inv.id}`); },
    onError: (e) => applyServerErrors(form.setError, fieldErrors(e)),
  });
  return (
    <FormDrawer open={open} title="Create invoice" onClose={onClose} onSubmit={form.handleSubmit((d) => create.mutate(d))} submitting={create.isPending} error={create.isError ? create.error : undefined} submitLabel="Create invoice">
      <RemoteSelectField<z.input<typeof createSchema>, Student> control={form.control} name="student" label="Student" required path="/people/students/" queryKey="students" toOption={(s) => ({ value: s.id, label: `${s.full_name} · ${s.class_label} · ${s.admission_number}` })} placeholder="Search by name or admission number" onSelect={(s) => { if (s?.fee_plan) form.setValue("fee_plan", s.fee_plan.id, { shouldValidate: true }); }} />
      <SelectField control={form.control} name="fee_plan" label="Fee plan" required loading={plans.isLoading} options={(plans.data ?? []).map((p) => ({ value: p.id, label: `${p.name} · ${fmtMoney(p.amount, p.currency)}` }))} />
      <TextField control={form.control} name="period_label" label="Period label" required placeholder="October 2026" />
      <Row gutter={16}>
        <Col span={8}><DateField control={form.control} name="period_start" label="Period start" required /></Col>
        <Col span={8}><DateField control={form.control} name="period_end" label="Period end" required /></Col>
        <Col span={8}><DateField control={form.control} name="due_date" label="Due date" required /></Col>
        <Col span={12}><NumberField control={form.control} name="amount" label="Amount override" min={0} help="Leave empty to use the plan amount" /></Col>
        <Col span={12}><NumberField control={form.control} name="discount" label="Discount" min={0} /></Col>
      </Row>
      <TextAreaField control={form.control} name="description" label="Line description" rows={2} />
    </FormDrawer>
  );
}

export default function InvoicesPage() {
  const { hasPerm } = useAuth();
  const canManage = hasPerm("billing.manage");
  const navigate = useNavigate();
  const qc = useQueryClient();
  const state = useTableParams({ ordering: "-issue_date" });
  const [range, setRange] = useState<DateRange>(null);
  const [overdue, setOverdue] = useState(false);
  const [creating, setCreating] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genStudents, setGenStudents] = useState<string[]>([]);
  const extraParams = useMemo(() => ({ date_from: range?.[0], date_to: range?.[1], overdue: overdue ? "true" : undefined }), [range, overdue]);
  const summary = useQuery({ queryKey: ["billing-summary", range], queryFn: () => get<BillingSummary>("/billing/summary/", { date_from: range?.[0], date_to: range?.[1] }) });
  const genForm = useZodForm(generateSchema, { defaultValues: { anchor_date: dayjs().format("YYYY-MM-DD"), due_date: null } });
  const generate = useMutation({
    mutationFn: (d: z.input<typeof generateSchema>) => post<{ created: number; skipped: number; invoices: Invoice[] }>("/billing/invoices/generate/", { anchor_date: d.anchor_date, due_date: d.due_date || undefined, students: genStudents.length ? genStudents : undefined }),
    onSuccess: (r) => { invalidate(qc, "invoices", "billing-summary", "student-invoices", "dashboard"); message.success(`${r.created} invoice${r.created === 1 ? "" : "s"} generated, ${r.skipped} skipped (already billed or no fee plan)`); setGenerating(false); setGenStudents([]); },
    onError: (e) => applyServerErrors(genForm.setError, fieldErrors(e)),
  });
  const columns: ColumnsType<Invoice> = [
    { title: "Invoice", dataIndex: "invoice_number", width: 160, render: (v: string, r) => <Link to={`/school/invoices/${r.id}`} onClick={(e) => e.stopPropagation()} style={{ fontWeight: 600 }}>{v}</Link> },
    { title: "Student", dataIndex: "student_name", render: (v: string, r) => <span>{v}<div className="sbp-muted" style={{ fontSize: 12 }}>{r.student_class} · {r.admission_number}</div></span> },
    { title: "Period", dataIndex: "period_label", width: 150 },
    { title: "Issued", dataIndex: "issue_date", sorter: true, width: 120, render: (v: string) => fmtDate(v) },
    { title: "Due", dataIndex: "due_date", sorter: true, width: 120, render: (v: string, r) => <span style={{ color: r.is_overdue ? "var(--sbp-danger)" : undefined }}>{fmtDate(v)}</span> },
    { title: "Total", dataIndex: "total", sorter: true, width: 120, align: "right", render: (v: string, r) => fmtMoney(v, r.currency) },
    { title: "Paid", dataIndex: "amount_paid", width: 120, align: "right", render: (v: string, r) => fmtMoney(v, r.currency) },
    { title: "Balance", dataIndex: "balance", width: 120, align: "right", render: (v: string, r) => <span style={{ fontWeight: 600 }}>{fmtMoney(v, r.currency)}</span> },
    { title: "Status", dataIndex: "status", sorter: true, width: 130, render: (v: string) => <StatusBadge status={v} /> },
  ];
  const s = summary.data;
  return (
    <div>
      <PageHeader title="Invoices" subtitle="Transport fee invoices per student and billing period." extra={canManage && (<><Button icon={<FileAddOutlined />} onClick={() => setGenerating(true)}>Generate invoices</Button><Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>Create invoice</Button></>)} />
      <div className="sbp-grid sbp-grid-4" style={{ marginBottom: 16 }}>
        <StatCard title="Billed" value={fmtMoney(s?.billed ?? 0, s?.currency)} hint={`${s?.invoice_count ?? 0} invoices${range ? " in range" : ""}`} loading={summary.isLoading} />
        <StatCard title="Collected" value={fmtMoney(s?.collected ?? 0, s?.currency)} hint={`${s?.payment_count ?? 0} verified payments`} loading={summary.isLoading} tone="success" />
        <StatCard title="Outstanding" value={fmtMoney(s?.outstanding ?? 0, s?.currency)} loading={summary.isLoading} tone="warning" />
        <StatCard title="Overdue" value={fmtMoney(s?.overdue ?? 0, s?.currency)} hint={`${s?.overdue_count ?? 0} invoices past due`} loading={summary.isLoading} tone={s && s.overdue_count > 0 ? "danger" : "neutral"} onClick={() => setOverdue(true)} />
      </div>
      <DataTable<Invoice>
        queryKey="invoices"
        path="/billing/invoices/"
        columns={columns}
        tableState={state}
        extraParams={extraParams}
        searchPlaceholder="Search invoice no, student"
        exportPath={`/billing/invoices/export/${buildQuery({ ...extraParams, status: state.params.status, student__grade: state.params.student__grade, search: state.params.search })}`}
        exportFilename="invoices.csv"
        initialOrdering="-issue_date"
        emptyTitle="No invoices yet"
        emptyDescription="Assign fee plans to students, then generate invoices for a billing period."
        scrollX={1200}
        filters={
          <>
            <FilterSelect value={state.params.status} onChange={(v) => state.setFilter("status", v)} options={INVOICE_STATUS} placeholder="Status" width={150} />
            <Input allowClear placeholder="Grade" aria-label="Grade" style={{ width: 90 }} onChange={(e) => { const v = e.target.value.trim(); window.setTimeout(() => state.setFilter("student__grade", v || undefined), 300); }} />
            <FilterSelect value={overdue ? "true" : undefined} onChange={(v) => setOverdue(v === "true")} options={[{ value: "true", label: "Overdue only" }]} placeholder="Overdue" width={140} />
            <DateRangeFilter value={range} onChange={setRange} />
          </>
        }
        onRow={(r) => ({ onClick: () => navigate(`/school/invoices/${r.id}`), style: { cursor: "pointer" } })}
      />
      <CreateInvoiceDrawer open={creating} onClose={() => setCreating(false)} />
      <Modal open={generating} title="Generate invoices" okText="Generate" confirmLoading={generate.isPending} onCancel={() => setGenerating(false)} onOk={genForm.handleSubmit((d) => generate.mutate(d))} centered destroyOnHidden>
        <Alert type="info" showIcon style={{ marginBottom: 12 }} message="One invoice per student with an active fee plan for the billing period containing the anchor date. Students already billed for that period are skipped." />
        <form noValidate onSubmit={genForm.handleSubmit((d) => generate.mutate(d))}>
          <InlineError error={generate.isError ? generate.error : undefined} />
          <Row gutter={16}>
            <Col span={12}><DateField control={genForm.control} name="anchor_date" label="Billing period date" required /></Col>
            <Col span={12}><DateField control={genForm.control} name="due_date" label="Due date" help="Defaults to the school's due day" /></Col>
          </Row>
          <div style={{ marginBottom: 8, fontWeight: 500 }}>Limit to students (optional)</div>
          <RemoteSelect<Student> path="/people/students/" queryKey="students" params={{ status: "ACTIVE" }} toOption={(st) => ({ value: st.id, label: `${st.full_name} · ${st.class_label}` })} mode="multiple" values={genStudents} onChangeMany={setGenStudents} onChange={() => undefined} placeholder="All students with a fee plan" />
        </form>
      </Modal>
    </div>
  );
}
