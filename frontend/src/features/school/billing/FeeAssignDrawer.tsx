import { useEffect } from "react";
import { Col, Row, message } from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { fieldErrors } from "@/api/client";
import { DateField, NumberField, SelectField, TextAreaField, TextField, applyServerErrors, useZodForm } from "@/components/forms/fields";
import { fmtMoney, titleCase } from "@/lib/format";
import { invalidate, listAll, post } from "../api";
import { FormDrawer } from "../components/FormDrawer";
import { RemoteSelectField } from "../components/RemoteSelect";
import type { FeeAssignment, FeePlan, Student } from "../types";

const schema = z.object({
  student: z.string({ invalid_type_error: "Select a student" }).min(1, "Select a student"),
  fee_plan: z.string({ invalid_type_error: "Select a fee plan" }).min(1, "Select a fee plan"),
  start_date: z.string().nullable().optional(),
  discount_amount: z.number().min(0).nullable().optional(),
  discount_reason: z.string().optional(),
  notes: z.string().optional(),
});
type Input = z.input<typeof schema>;

interface Props {
  open: boolean;
  onClose: () => void;
  /** Preselect a student (student detail page). */
  student?: Pick<Student, "id" | "full_name" | "fee_plan"> | null;
}

/** Assign a fee plan to a student (replaces the current active assignment). */
export function FeeAssignDrawer({ open, onClose, student }: Props) {
  const qc = useQueryClient();
  const plans = useQuery({ queryKey: ["opts-fee-plans"], queryFn: () => listAll<FeePlan>("/billing/fee-plans/", { is_active: true }), enabled: open });
  const form = useZodForm(schema, { defaultValues: { student: student?.id ?? "", fee_plan: student?.fee_plan?.id ?? "", start_date: null, discount_amount: 0, discount_reason: "", notes: "" } });
  useEffect(() => {
    if (open) form.reset({ student: student?.id ?? "", fee_plan: student?.fee_plan?.id ?? "", start_date: null, discount_amount: 0, discount_reason: "", notes: "" });
  }, [open, student, form]);
  const assign = useMutation({
    mutationFn: (d: Input) => post<FeeAssignment>("/billing/fee-assignments/", { ...d, discount_amount: d.discount_amount ?? 0 }),
    onSuccess: () => {
      invalidate(qc, "student", "students", "fee-assignments", "fee-plans", "opts-fee-plans");
      message.success("Fee plan assigned");
      onClose();
    },
    onError: (e) => applyServerErrors(form.setError, fieldErrors(e)),
  });
  return (
    <FormDrawer open={open} title={student ? `Fee plan for ${student.full_name}` : "Assign fee plan"} onClose={onClose} onSubmit={form.handleSubmit((d) => assign.mutate(d))} submitting={assign.isPending} error={assign.isError ? assign.error : undefined} submitLabel="Assign plan">
      {!student && <RemoteSelectField<Input, Student> control={form.control} name="student" label="Student" required path="/people/students/" queryKey="students" params={{ status: "ACTIVE" }} toOption={(s) => ({ value: s.id, label: `${s.full_name} · ${s.class_label} · ${s.admission_number}${s.fee_plan ? ` · on ${s.fee_plan.name}` : ""}` })} placeholder="Search by name or admission number" />}
      <SelectField control={form.control} name="fee_plan" label="Fee plan" required loading={plans.isLoading} options={(plans.data ?? []).map((p) => ({ value: p.id, label: `${p.name} · ${fmtMoney(p.amount, p.currency)} / ${titleCase(p.billing_cycle).toLowerCase()}` }))} help={student?.fee_plan ? `Replaces the current plan (${student.fee_plan.name}).` : "Replaces any current plan; history is kept."} />
      <DateField control={form.control} name="start_date" label="Start date" help="Defaults to today" />
      <Row gutter={16}>
        <Col span={10}><NumberField control={form.control} name="discount_amount" label="Discount per invoice" min={0} /></Col>
        <Col span={14}><TextField control={form.control} name="discount_reason" label="Discount reason" /></Col>
      </Row>
      <TextAreaField control={form.control} name="notes" label="Notes" rows={2} />
    </FormDrawer>
  );
}
