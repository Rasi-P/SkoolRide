import { useState } from "react";
import { Button, Card, Col, Modal, Row, Space, Table, Typography, message } from "antd";
import { PrinterOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { z } from "zod";
import { errorMessage, fieldErrors, openHtml } from "@/api/client";
import { useAuth } from "@/app/auth";
import { NumberField, TextField, applyServerErrors, useZodForm } from "@/components/forms/fields";
import { KeyValue } from "@/components/ui/Misc";
import { PageHeader } from "@/components/ui/PageHeader";
import { InlineError, QueryState } from "@/components/ui/States";
import { SimulatedTag, StatusBadge } from "@/components/ui/StatusBadge";
import { fmtDate, fmtDateTime, fmtMoney, titleCase } from "@/lib/format";
import type { Paginated } from "@/types";
import { get, invalidate, post } from "../api";
import { ReasonModal } from "../components/ReasonModal";
import type { InvoiceDetail } from "../types";
import { RecordPaymentDrawer } from "./RecordPaymentDrawer";

const lateFeeSchema = z.object({ amount: z.number({ invalid_type_error: "Amount is required" }).min(0.01, "Amount must be positive"), reason: z.string().trim().min(2, "Reason is required") });

/** Receipts are addressed by id; the invoice payload only carries the receipt number, so resolve it on demand. */
async function printReceiptByNumber(receiptNumber: string) {
  const r = await get<Paginated<{ id: string; receipt_number: string }>>("/billing/receipts/", { search: receiptNumber, page_size: 5 });
  const hit = r.results.find((x) => x.receipt_number === receiptNumber) ?? r.results[0];
  if (!hit) throw new Error("Receipt not found");
  await openHtml(`/billing/receipts/${hit.id}/print/`);
}

export default function InvoiceDetailPage() {
  const { id = "" } = useParams();
  const { hasPerm } = useAuth();
  const canManage = hasPerm("billing.manage");
  const canRecord = hasPerm("billing.record_payment");
  const qc = useQueryClient();
  const invoice = useQuery({ queryKey: ["invoice", id], queryFn: () => get<InvoiceDetail>(`/billing/invoices/${id}/`), enabled: !!id });
  const [paying, setPaying] = useState(false);
  const [lateFeeOpen, setLateFeeOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const lateForm = useZodForm(lateFeeSchema, { defaultValues: { amount: (null as unknown as number), reason: "Late payment" } });
  const refresh = () => invalidate(qc, "invoice", "invoices", "billing-summary", "student-invoices", "payments", "adjustments", "dashboard");
  const lateFee = useMutation({
    mutationFn: (d: z.input<typeof lateFeeSchema>) => post<InvoiceDetail>(`/billing/invoices/${id}/late-fee/`, d),
    onSuccess: () => { refresh(); message.success("Late fee applied"); setLateFeeOpen(false); lateForm.reset(); },
    onError: (e) => applyServerErrors(lateForm.setError, fieldErrors(e)),
  });
  const cancel = useMutation({
    mutationFn: (reason: string) => post<InvoiceDetail>(`/billing/invoices/${id}/cancel/`, { reason }),
    onSuccess: () => { refresh(); message.success("Invoice cancelled"); setCancelOpen(false); },
    onError: (e) => message.error(errorMessage(e)),
  });
  const print = useMutation({ mutationFn: (path: string) => openHtml(path), onError: (e) => message.error(errorMessage(e)) });
  const printReceipt = useMutation({ mutationFn: printReceiptByNumber, onError: (e) => message.error(errorMessage(e)) });

  type Line = InvoiceDetail["line_items"][number];
  type Pay = InvoiceDetail["payments"][number];
  const lineColumns: ColumnsType<Line> = [
    { title: "Description", dataIndex: "description" },
    { title: "Qty", dataIndex: "quantity", width: 80, align: "right" },
    { title: "Unit", dataIndex: "unit_amount", width: 130, align: "right", render: (v: string) => fmtMoney(v) },
    { title: "Amount", dataIndex: "amount", width: 130, align: "right", render: (v: string) => fmtMoney(v) },
  ];
  const payColumns: ColumnsType<Pay> = [
    { title: "Payment", dataIndex: "payment_number", render: (v: string, r) => <span>{v} <SimulatedTag show={r.is_simulated} /></span> },
    { title: "Paid at", dataIndex: "paid_at", width: 170, render: (v: string) => fmtDateTime(v) },
    { title: "Method", dataIndex: "method", width: 130, render: (v: string) => titleCase(v) },
    { title: "Status", dataIndex: "status", width: 110, render: (v: string) => <StatusBadge status={v} /> },
    { title: "Allocated", dataIndex: "amount", width: 130, align: "right", render: (v: string) => fmtMoney(v) },
    { title: "Receipt", dataIndex: "receipt_number", width: 180, render: (v: string | null) => (v ? <Button size="small" type="link" icon={<PrinterOutlined />} onClick={() => printReceipt.mutate(v)} loading={printReceipt.isPending && printReceipt.variables === v}>{v}</Button> : "-") },
  ];

  return (
    <QueryState query={invoice}>
      {(inv) => {
        const open = inv.status === "ISSUED" || inv.status === "PARTIALLY_PAID" || inv.status === "OVERDUE";
        return (
          <div>
            <PageHeader
              crumbs={[{ label: "Invoices", to: "/school/invoices" }, { label: inv.invoice_number }]}
              title={<span>{inv.invoice_number} <StatusBadge status={inv.status} /></span>}
              subtitle={`${inv.period_label} · issued ${fmtDate(inv.issue_date)} · due ${fmtDate(inv.due_date)}`}
              extra={
                <Space wrap>
                  <Button icon={<PrinterOutlined />} loading={print.isPending} onClick={() => print.mutate(`/billing/invoices/${inv.id}/print/`)}>Print</Button>
                  {canRecord && open && <Button type="primary" onClick={() => setPaying(true)}>Record payment</Button>}
                  {canManage && open && <Button onClick={() => setLateFeeOpen(true)}>Apply late fee</Button>}
                  {canManage && open && <Button danger onClick={() => setCancelOpen(true)}>Cancel invoice</Button>}
                </Space>
              }
            />
            <Row gutter={[16, 16]}>
              <Col xs={24} lg={10}>
                <Card size="small" title="Billing details">
                  <KeyValue items={[
                    { label: "Student", value: <Link to={`/school/students/${inv.student}`}>{inv.student_name}</Link> },
                    { label: "Class", value: `${inv.student_class} · ${inv.admission_number}` },
                    { label: "Billed to", value: inv.billed_to_name ?? "-" },
                    { label: "Fee plan", value: inv.fee_plan_name ?? "-" },
                    { label: "Period", value: `${fmtDate(inv.period_start)} - ${fmtDate(inv.period_end)}` },
                    { label: "Due date", value: <span style={{ color: inv.is_overdue ? "var(--sbp-danger)" : undefined }}>{fmtDate(inv.due_date)}{inv.is_overdue ? " (overdue)" : ""}</span> },
                    { label: "Notes", value: inv.notes || "-" },
                  ]} />
                </Card>
              </Col>
              <Col xs={24} lg={14}>
                <Card size="small" title="Line items">
                  <Table rowKey="id" size="small" columns={lineColumns} dataSource={inv.line_items} pagination={false} />
                  <div style={{ marginTop: 12, marginLeft: "auto", maxWidth: 320 }}>
                    <KeyValue items={[
                      { label: "Subtotal", value: fmtMoney(inv.subtotal, inv.currency) },
                      { label: "Discount", value: `- ${fmtMoney(inv.discount, inv.currency)}` },
                      { label: "Late fee", value: fmtMoney(inv.late_fee, inv.currency) },
                      { label: "Total", value: <strong>{fmtMoney(inv.total, inv.currency)}</strong> },
                      { label: "Paid", value: fmtMoney(inv.amount_paid, inv.currency) },
                      { label: "Balance due", value: <strong style={{ color: Number(inv.balance) > 0 ? "var(--sbp-warning)" : "var(--sbp-success)" }}>{fmtMoney(inv.balance, inv.currency)}</strong> },
                    ]} />
                  </div>
                </Card>
              </Col>
              <Col xs={24}>
                <Card size="small" title="Payments">
                  {inv.payments.length === 0 ? <Typography.Text type="secondary">No payments allocated to this invoice yet.</Typography.Text> : <Table rowKey="payment_id" size="small" columns={payColumns} dataSource={inv.payments} pagination={false} />}
                </Card>
              </Col>
            </Row>
            <RecordPaymentDrawer open={paying} onClose={() => setPaying(false)} prefill={{ student: inv.student, student_label: `${inv.student_name} · ${inv.student_class}`, invoice: inv.id, amount: Number(inv.balance) }} />
            <Modal open={lateFeeOpen} title="Apply late fee" okText="Apply" confirmLoading={lateFee.isPending} onCancel={() => setLateFeeOpen(false)} onOk={lateForm.handleSubmit((d) => lateFee.mutate(d))} centered destroyOnHidden>
              <form noValidate onSubmit={lateForm.handleSubmit((d) => lateFee.mutate(d))}>
                <InlineError error={lateFee.isError ? lateFee.error : undefined} />
                <NumberField control={lateForm.control} name="amount" label="Late fee amount" required min={0.01} />
                <TextField control={lateForm.control} name="reason" label="Reason" required />
              </form>
            </Modal>
            <ReasonModal open={cancelOpen} title={`Cancel invoice ${inv.invoice_number}?`} description="Cancelled invoices are kept for audit but no longer count as outstanding. Payments already allocated remain as credit." okText="Cancel invoice" danger loading={cancel.isPending} onCancel={() => setCancelOpen(false)} onSubmit={(reason) => cancel.mutate(reason)} />
          </div>
        );
      }}
    </QueryState>
  );
}
