import { useEffect, useMemo, useState } from "react";
import { Alert, Col, Row, message } from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { fieldErrors } from "@/api/client";
import { NumberField, SelectField, TextAreaField, TextField, applyServerErrors, useZodForm } from "@/components/forms/fields";
import { fmtDate, fmtMoney } from "@/lib/format";
import { invalidate, listAll, post } from "../api";
import { DateTimeField } from "../components/ExtraFields";
import { FormDrawer } from "../components/FormDrawer";
import { RemoteSelectField } from "../components/RemoteSelect";
import { OFFLINE_PAYMENT_METHOD } from "../constants";
import type { Invoice, Payment, Student } from "../types";

const schema = z.object({
  student: z.string({ invalid_type_error: "Select a student" }).min(1, "Select a student"),
  invoice: z.string().nullable().optional(),
  amount: z.number({ invalid_type_error: "Amount is required" }).min(0.01, "Amount must be positive"),
  method: z.enum(["CASH", "BANK_TRANSFER", "UPI", "CHEQUE"]),
  transaction_reference: z.string().optional(),
  paid_at: z.string().nullable().optional(),
  notes: z.string().optional(),
});
type Input = z.input<typeof schema>;

export interface PaymentPrefill {
  student: string;
  student_label: string;
  invoice?: string | null;
  amount?: number;
}

/** Record an offline (cash / bank / UPI / cheque) payment. Each opening uses a fresh Idempotency-Key. */
export function RecordPaymentDrawer({ open, onClose, prefill, onRecorded }: { open: boolean; onClose: () => void; prefill?: PaymentPrefill | null; onRecorded?: (p: Payment) => void }) {
  const qc = useQueryClient();
  const [idemKey, setIdemKey] = useState<string>("");
  useEffect(() => {
    if (open) setIdemKey(crypto.randomUUID());
  }, [open]);
  const form = useZodForm(schema, { defaultValues: { student: prefill?.student ?? "", invoice: prefill?.invoice ?? null, amount: prefill?.amount ?? (null as unknown as number), method: "CASH", transaction_reference: "", paid_at: null, notes: "" } });
  useEffect(() => {
    if (open) form.reset({ student: prefill?.student ?? "", invoice: prefill?.invoice ?? null, amount: prefill?.amount ?? (null as unknown as number), method: "CASH", transaction_reference: "", paid_at: null, notes: "" });
  }, [open, prefill, form]);
  const studentId = form.watch("student");
  const invoices = useQuery({ queryKey: ["open-invoices", studentId], queryFn: () => listAll<Invoice>("/billing/invoices/", { student: studentId, ordering: "due_date" }), enabled: open && !!studentId, select: (rows) => rows.filter((i) => i.status === "ISSUED" || i.status === "PARTIALLY_PAID" || i.status === "OVERDUE") });
  const invoiceOptions = useMemo(() => (invoices.data ?? []).map((i) => ({ value: i.id, label: `${i.invoice_number} · ${i.period_label} · due ${fmtDate(i.due_date)} · balance ${fmtMoney(i.balance, i.currency)}` })), [invoices.data]);
  const selectedInvoice = invoices.data?.find((i) => i.id === form.watch("invoice"));
  const record = useMutation({
    mutationFn: (d: Input) => post<Payment>("/billing/payments/record/", { ...d, invoice: d.invoice || null, paid_at: d.paid_at || undefined }, { headers: { "Idempotency-Key": idemKey } }),
    onSuccess: (p) => {
      invalidate(qc, "payments", "invoices", "invoice", "billing-summary", "student-invoices", "parents", "parent", "dashboard", "open-invoices", "adjustments");
      message.success(`Payment ${p.payment_number} recorded${p.receipt_number ? ` · receipt ${p.receipt_number}` : ""}`);
      onRecorded?.(p);
      onClose();
    },
    onError: (e) => applyServerErrors(form.setError, fieldErrors(e)),
  });
  return (
    <FormDrawer open={open} title="Record payment" onClose={onClose} onSubmit={form.handleSubmit((d) => record.mutate(d))} submitting={record.isPending} error={record.isError ? record.error : undefined} submitLabel="Record payment">
      {prefill ? (
        <div style={{ marginBottom: 16 }}><span className="sbp-muted">Student</span><div style={{ fontWeight: 600 }}>{prefill.student_label}</div></div>
      ) : (
        <RemoteSelectField<Input, Student> control={form.control} name="student" label="Student" required path="/people/students/" queryKey="students" toOption={(s) => ({ value: s.id, label: `${s.full_name} · ${s.class_label} · ${s.admission_number}` })} placeholder="Search by name or admission number" />
      )}
      <SelectField control={form.control} name="invoice" label="Apply to invoice" options={invoiceOptions} loading={invoices.isFetching} disabled={!studentId} placeholder={studentId ? (invoiceOptions.length ? "Select an open invoice (optional)" : "No open invoices; payment is kept as credit") : "Select a student first"} help="Leave empty to allocate to the oldest open invoices automatically." />
      {selectedInvoice && Number(selectedInvoice.balance) > 0 && <Alert type="info" showIcon style={{ marginBottom: 16 }} message={`Balance due on ${selectedInvoice.invoice_number}: ${fmtMoney(selectedInvoice.balance, selectedInvoice.currency)}`} action={<button type="button" className="ant-btn ant-btn-link ant-btn-sm" onClick={() => form.setValue("amount", Number(selectedInvoice.balance), { shouldValidate: true })}>Use balance</button>} />}
      <Row gutter={16}>
        <Col span={12}><NumberField control={form.control} name="amount" label="Amount" required min={0.01} step={50} /></Col>
        <Col span={12}><SelectField control={form.control} name="method" label="Method" required options={OFFLINE_PAYMENT_METHOD} allowClear={false} /></Col>
        <Col span={12}><TextField control={form.control} name="transaction_reference" label="Reference / cheque no" /></Col>
        <Col span={12}><DateTimeField control={form.control} name="paid_at" label="Paid at" help="Defaults to now" /></Col>
        <Col span={24}><TextAreaField control={form.control} name="notes" label="Notes" rows={2} /></Col>
      </Row>
    </FormDrawer>
  );
}
