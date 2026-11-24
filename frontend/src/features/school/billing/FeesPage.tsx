import { useEffect, useState } from "react";
import { Button, Col, Row, Space, Tabs, Tag, message } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { z } from "zod";
import { errorMessage, fieldErrors } from "@/api/client";
import { useAuth } from "@/app/auth";
import { NumberField, SelectField, SwitchField, TextAreaField, TextField, applyServerErrors, useZodForm } from "@/components/forms/fields";
import { confirmAction } from "@/components/ui/ConfirmDialog";
import { DataTable } from "@/components/ui/DataTable";
import { FilterSelect } from "@/components/ui/FilterSelect";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useTableParams } from "@/hooks/usePagedQuery";
import { fmtDate, fmtMoney, titleCase } from "@/lib/format";
import { del, invalidate, patch, post } from "../api";
import { FormDrawer } from "../components/FormDrawer";
import { BILLING_CYCLE, FEE_BASIS } from "../constants";
import { routeLabel, useRouteOptions } from "../hooks";
import type { FeeAssignment, FeePlan } from "../types";
import { FeeAssignDrawer } from "./FeeAssignDrawer";

const planSchema = z.object({
  name: z.string().trim().min(2, "Name is required"),
  code: z.string().trim().min(1, "Code is required").max(20),
  basis: z.enum(["ROUTE", "DISTANCE", "GRADE", "CUSTOM"]),
  billing_cycle: z.enum(["MONTHLY", "TERM", "ANNUAL"]),
  amount: z.number({ invalid_type_error: "Amount is required" }).min(0.01, "Amount must be positive"),
  route: z.string().nullable().optional(),
  distance_min_km: z.number().min(0).nullable().optional(),
  distance_max_km: z.number().min(0).nullable().optional(),
  grades: z.array(z.string()).optional(),
  description: z.string().optional(),
  is_active: z.boolean().optional(),
}).superRefine((d, ctx) => {
  if (d.basis === "ROUTE" && !d.route) ctx.addIssue({ code: "custom", path: ["route"], message: "Select the route this plan applies to" });
  if (d.basis === "DISTANCE" && (d.distance_min_km == null || d.distance_max_km == null)) ctx.addIssue({ code: "custom", path: ["distance_max_km"], message: "Enter the distance band" });
  if (d.basis === "DISTANCE" && d.distance_min_km != null && d.distance_max_km != null && d.distance_max_km <= d.distance_min_km) ctx.addIssue({ code: "custom", path: ["distance_max_km"], message: "Max must be greater than min" });
  if (d.basis === "GRADE" && (!d.grades || d.grades.length === 0)) ctx.addIssue({ code: "custom", path: ["grades"], message: "Add at least one grade" });
});
type PlanInput = z.input<typeof planSchema>;
const toDefaults = (p: FeePlan | null): PlanInput => ({ name: p?.name ?? "", code: p?.code ?? "", basis: p?.basis ?? "ROUTE", billing_cycle: p?.billing_cycle ?? "MONTHLY", amount: p ? Number(p.amount) : (null as unknown as number), route: p?.route ?? null, distance_min_km: p?.distance_min_km ? Number(p.distance_min_km) : null, distance_max_km: p?.distance_max_km ? Number(p.distance_max_km) : null, grades: p?.grades ?? [], description: p?.description ?? "", is_active: p?.is_active ?? true });

function PlanDrawer({ open, plan, onClose }: { open: boolean; plan: FeePlan | null; onClose: () => void }) {
  const qc = useQueryClient();
  const routes = useRouteOptions(false);
  const form = useZodForm(planSchema, { defaultValues: toDefaults(plan) });
  useEffect(() => {
    if (open) form.reset(toDefaults(plan));
  }, [open, plan, form]);
  const basis = form.watch("basis");
  const save = useMutation({
    mutationFn: (d: PlanInput) => {
      const body = { ...d, route: d.basis === "ROUTE" ? d.route : null, distance_min_km: d.basis === "DISTANCE" ? d.distance_min_km : null, distance_max_km: d.basis === "DISTANCE" ? d.distance_max_km : null, grades: d.basis === "GRADE" ? d.grades ?? [] : [] };
      return plan ? patch<FeePlan>(`/billing/fee-plans/${plan.id}/`, body) : post<FeePlan>("/billing/fee-plans/", body);
    },
    onSuccess: () => { invalidate(qc, "fee-plans", "opts-fee-plans"); message.success(plan ? "Fee plan updated" : "Fee plan created"); onClose(); },
    onError: (e) => applyServerErrors(form.setError, fieldErrors(e)),
  });
  const c = form.control;
  return (
    <FormDrawer open={open} title={plan ? `Edit ${plan.name}` : "New fee plan"} onClose={onClose} onSubmit={form.handleSubmit((d) => save.mutate(d))} submitting={save.isPending} error={save.isError ? save.error : undefined} submitLabel={plan ? "Save changes" : "Create plan"}>
      <Row gutter={16}>
        <Col span={16}><TextField control={c} name="name" label="Name" required /></Col>
        <Col span={8}><TextField control={c} name="code" label="Code" required placeholder="ZONE-A" /></Col>
        <Col span={12}><SelectField control={c} name="basis" label="Basis" required options={FEE_BASIS} allowClear={false} /></Col>
        <Col span={12}><SelectField control={c} name="billing_cycle" label="Billing cycle" required options={BILLING_CYCLE} allowClear={false} /></Col>
        <Col span={12}><NumberField control={c} name="amount" label="Amount per cycle" required min={0} /></Col>
        {basis === "ROUTE" && <Col span={24}><SelectField control={c} name="route" label="Route" required loading={routes.isLoading} options={(routes.data ?? []).map((r) => ({ value: r.id, label: routeLabel(r) }))} /></Col>}
        {basis === "DISTANCE" && <><Col span={12}><NumberField control={c} name="distance_min_km" label="Distance from (km)" required min={0} step={0.5} /></Col><Col span={12}><NumberField control={c} name="distance_max_km" label="Distance to (km)" required min={0} step={0.5} /></Col></>}
        {basis === "GRADE" && <Col span={24}><SelectField control={c} name="grades" label="Grades" required mode="tags" options={["Nursery", "LKG", "UKG", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"].map((g) => ({ value: g, label: g }))} help="Type a grade and press Enter to add it." /></Col>}
        <Col span={24}><TextAreaField control={c} name="description" label="Description" rows={2} /></Col>
        {plan && <Col span={24}><SwitchField control={c} name="is_active" label="Active" help="Inactive plans cannot be assigned to new students." /></Col>}
      </Row>
    </FormDrawer>
  );
}

function PlansTab({ canManage }: { canManage: boolean }) {
  const qc = useQueryClient();
  const state = useTableParams({ ordering: "name" });
  const [editing, setEditing] = useState<FeePlan | "new" | null>(null);
  const deactivate = useMutation({ mutationFn: (p: FeePlan) => del(`/billing/fee-plans/${p.id}/`), onSuccess: () => { invalidate(qc, "fee-plans", "opts-fee-plans"); message.success("Plan deactivated"); }, onError: (e) => message.error(errorMessage(e)) });
  const columns: ColumnsType<FeePlan> = [
    { title: "Plan", dataIndex: "name", sorter: true, render: (v: string, r) => <span><span style={{ fontWeight: 600 }}>{v}</span><div className="sbp-muted" style={{ fontSize: 12 }}>{r.code}</div></span> },
    { title: "Basis", dataIndex: "basis", width: 130, render: (v: string) => titleCase(v) },
    { title: "Applies to", key: "applies", render: (_, r) => (r.basis === "ROUTE" ? r.route_name ?? "-" : r.basis === "DISTANCE" ? `${r.distance_min_km ?? "?"} - ${r.distance_max_km ?? "?"} km` : r.basis === "GRADE" ? <Space size={4} wrap>{r.grades.map((g) => <Tag key={g}>{g}</Tag>)}</Space> : r.description || "Custom") },
    { title: "Cycle", dataIndex: "billing_cycle", width: 110, render: (v: string) => titleCase(v) },
    { title: "Amount", dataIndex: "amount", width: 130, align: "right", render: (v: string, r) => fmtMoney(v, r.currency) },
    { title: "Students", dataIndex: "assigned_students", width: 100, align: "right", render: (v: number | null) => v ?? "-" },
    { title: "Status", dataIndex: "is_active", width: 100, render: (v: boolean) => <StatusBadge status={v ? "ACTIVE" : "INACTIVE"} /> },
    ...(canManage ? [{ title: "", key: "actions", width: 170, render: (_: unknown, r: FeePlan) => <Space><Button size="small" onClick={() => setEditing(r)}>Edit</Button>{r.is_active && <Button size="small" danger onClick={() => confirmAction({ title: `Deactivate ${r.name}?`, content: "Existing assignments keep billing; the plan just cannot be assigned to new students.", okText: "Deactivate", danger: true, onOk: () => deactivate.mutateAsync(r) })}>Deactivate</Button>}</Space> }] : []),
  ];
  return (
    <div>
      <DataTable<FeePlan>
        queryKey="fee-plans"
        path="/billing/fee-plans/"
        columns={columns}
        tableState={state}
        searchPlaceholder="Search plan name or code"
        emptyTitle="No fee plans yet"
        emptyDescription="Create a plan per route, distance band or grade, then assign it to students."
        scrollX={1000}
        filters={
          <>
            <FilterSelect value={state.params.basis} onChange={(v) => state.setFilter("basis", v)} options={FEE_BASIS} placeholder="Basis" width={150} />
            <FilterSelect value={state.params.billing_cycle} onChange={(v) => state.setFilter("billing_cycle", v)} options={BILLING_CYCLE} placeholder="Cycle" width={130} />
            <FilterSelect value={state.params.is_active} onChange={(v) => state.setFilter("is_active", v)} options={[{ value: "true", label: "Active" }, { value: "false", label: "Inactive" }]} placeholder="Status" width={120} />
          </>
        }
        toolbar={canManage && <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing("new")}>New plan</Button>}
      />
      <PlanDrawer open={editing !== null} plan={editing === "new" ? null : editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function AssignmentsTab({ canManage }: { canManage: boolean }) {
  const state = useTableParams({ is_active: "true" });
  const [assigning, setAssigning] = useState(false);
  const columns: ColumnsType<FeeAssignment> = [
    { title: "Student", dataIndex: "student_name", render: (v: string, r) => <span><Link to={`/school/students/${r.student}`} style={{ fontWeight: 600 }}>{v}</Link><div className="sbp-muted" style={{ fontSize: 12 }}>{r.student_class} · {r.admission_number}</div></span> },
    { title: "Plan", dataIndex: "fee_plan_name" },
    { title: "Amount", dataIndex: "fee_plan_amount", width: 120, align: "right", render: (v: string) => fmtMoney(v) },
    { title: "Cycle", dataIndex: "billing_cycle", width: 100, render: (v: string) => titleCase(v) },
    { title: "Discount", dataIndex: "discount_amount", width: 140, render: (v: string, r) => (Number(v) > 0 ? <span>{fmtMoney(v)}<div className="sbp-muted" style={{ fontSize: 12 }}>{r.discount_reason}</div></span> : "-") },
    { title: "From", dataIndex: "start_date", width: 120, render: (v: string) => fmtDate(v) },
    { title: "To", dataIndex: "end_date", width: 120, render: (v: string | null) => fmtDate(v) },
    { title: "Status", dataIndex: "is_active", width: 100, render: (v: boolean) => <StatusBadge status={v ? "ACTIVE" : "INACTIVE"} label={v ? "Active" : "Ended"} /> },
  ];
  return (
    <div>
      <DataTable<FeeAssignment>
        queryKey="fee-assignments"
        path="/billing/fee-assignments/"
        columns={columns}
        tableState={state}
        searchPlaceholder="Search student"
        emptyTitle="No fee assignments yet"
        emptyDescription="Assign a plan to each student using transport so invoices can be generated."
        scrollX={1000}
        filters={<FilterSelect value={state.params.is_active} onChange={(v) => state.setFilter("is_active", v)} options={[{ value: "true", label: "Active" }, { value: "false", label: "Ended" }]} placeholder="Status" width={120} />}
        toolbar={canManage && <Button type="primary" icon={<PlusOutlined />} onClick={() => setAssigning(true)}>Assign plan</Button>}
      />
      <FeeAssignDrawer open={assigning} onClose={() => setAssigning(false)} />
    </div>
  );
}

export default function FeesPage() {
  const { hasPerm } = useAuth();
  const canManage = hasPerm("billing.manage");
  const [params, setParams] = useSearchParams();
  return (
    <div>
      <PageHeader title="Fees & plans" subtitle="Transport fee plans and which students they apply to." />
      <Tabs activeKey={params.get("tab") || "plans"} onChange={(k) => setParams({ tab: k })} items={[{ key: "plans", label: "Fee plans", children: <PlansTab canManage={canManage} /> }, { key: "assignments", label: "Fee assignments", children: <AssignmentsTab canManage={canManage} /> }]} />
    </div>
  );
}
