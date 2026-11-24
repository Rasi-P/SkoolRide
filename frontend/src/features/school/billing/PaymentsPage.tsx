import { useMemo, useState } from "react";
import { Button, Popover, Space, Tabs, Tag, message } from "antd";
import { PlusOutlined, PrinterOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { buildQuery, errorMessage, openHtml } from "@/api/client";
import { useAuth } from "@/app/auth";
import { DataTable } from "@/components/ui/DataTable";
import { FilterSelect } from "@/components/ui/FilterSelect";
import { PageHeader } from "@/components/ui/PageHeader";
import { SimulatedTag, StatusBadge } from "@/components/ui/StatusBadge";
import { useTableParams } from "@/hooks/usePagedQuery";
import { fmtDateTime, fmtMoney, titleCase } from "@/lib/format";
import { invalidate, post } from "../api";
import { AuditChanges } from "../components/AuditChanges";
import { DateRangeFilter, type DateRange } from "../components/DateRangeFilter";
import { ReasonModal } from "../components/ReasonModal";
import { PAYMENT_METHOD, PAYMENT_STATUS } from "../constants";
import type { Payment, PaymentAdjustment } from "../types";
import { RecordPaymentDrawer } from "./RecordPaymentDrawer";

function PaymentsTab() {
  const { hasPerm } = useAuth();
  const canRecord = hasPerm("billing.record_payment");
  const canManage = hasPerm("billing.manage");
  const qc = useQueryClient();
  const state = useTableParams({ ordering: "-paid_at" });
  const [range, setRange] = useState<DateRange>(null);
  const [recording, setRecording] = useState(false);
  const [reversing, setReversing] = useState<Payment | null>(null);
  const extraParams = useMemo(() => ({ date_from: range?.[0], date_to: range?.[1] }), [range]);
  const reverse = useMutation({
    mutationFn: ({ p, reason }: { p: Payment; reason: string }) => post<Payment>(`/billing/payments/${p.id}/reverse/`, { reason }),
    onSuccess: () => { invalidate(qc, "payments", "invoices", "invoice", "billing-summary", "adjustments", "student-invoices", "parents", "dashboard"); message.success("Payment reversed; the invoice balance has been restored"); setReversing(null); },
    onError: (e) => message.error(errorMessage(e)),
  });
  const print = useMutation({ mutationFn: (receiptId: string) => openHtml(`/billing/receipts/${receiptId}/print/`), onError: (e) => message.error(errorMessage(e)) });
  const columns: ColumnsType<Payment> = [
    { title: "Payment", dataIndex: "payment_number", width: 170, render: (v: string, r) => <span style={{ fontWeight: 600 }}>{v} <SimulatedTag show={r.is_simulated} /></span> },
    { title: "Student", dataIndex: "student_name", render: (v: string, r) => <Link to={`/school/students/${r.student}`}>{v}</Link> },
    { title: "Paid at", dataIndex: "paid_at", sorter: true, width: 170, render: (v: string) => fmtDateTime(v) },
    { title: "Amount", dataIndex: "amount", sorter: true, width: 120, align: "right", render: (v: string, r) => fmtMoney(v, r.currency) },
    { title: "Method", dataIndex: "method", width: 130, render: (v: string, r) => <span>{titleCase(v)}{r.gateway ? <div className="sbp-muted" style={{ fontSize: 12 }}>{r.gateway}</div> : null}</span> },
    { title: "Status", dataIndex: "status", width: 120, render: (v: string) => <StatusBadge status={v} /> },
    { title: "Reference", dataIndex: "transaction_reference", render: (v: string, r) => v || r.gateway_payment_id || <span className="sbp-muted">-</span> },
    { title: "Invoices", key: "alloc", render: (_, r) => (r.allocations.length ? <Space size={4} wrap>{r.allocations.map((a) => <Link key={a.invoice_id} to={`/school/invoices/${a.invoice_id}`}><Tag>{a.invoice_number}</Tag></Link>)}</Space> : <span className="sbp-muted">Unallocated credit</span>) },
    { title: "Received by", dataIndex: "received_by_name", width: 150, render: (v: string | null, r) => v ?? r.paid_by_name ?? "-" },
    {
      title: "", key: "actions", width: 190,
      render: (_, r) => (
        <Space onClick={(e) => e.stopPropagation()}>
          {r.receipt_id && <Button size="small" icon={<PrinterOutlined />} onClick={() => print.mutate(r.receipt_id!)} aria-label={`Print receipt ${r.receipt_number ?? ""}`}>Receipt</Button>}
          {canManage && r.status === "VERIFIED" && <Button size="small" danger onClick={() => setReversing(r)}>Reverse</Button>}
        </Space>
      ),
    },
  ];
  return (
    <div>
      <DataTable<Payment>
        queryKey="payments"
        path="/billing/payments/"
        columns={columns}
        tableState={state}
        extraParams={extraParams}
        searchPlaceholder="Search payment no, reference, student"
        exportPath={`/billing/payments/export/${buildQuery({ ...extraParams, status: state.params.status, method: state.params.method, is_simulated: state.params.is_simulated, search: state.params.search })}`}
        exportFilename="payments.csv"
        initialOrdering="-paid_at"
        emptyTitle="No payments recorded"
        emptyDescription="Record cash, bank or UPI payments here. Online payments appear automatically."
        scrollX={1400}
        filters={
          <>
            <FilterSelect value={state.params.status} onChange={(v) => state.setFilter("status", v)} options={PAYMENT_STATUS} placeholder="Status" width={140} />
            <FilterSelect value={state.params.method} onChange={(v) => state.setFilter("method", v)} options={PAYMENT_METHOD} placeholder="Method" width={150} />
            <FilterSelect value={state.params.is_simulated} onChange={(v) => state.setFilter("is_simulated", v)} options={[{ value: "true", label: "Simulated only" }, { value: "false", label: "Real only" }]} placeholder="Simulated" width={140} />
            <DateRangeFilter value={range} onChange={setRange} />
          </>
        }
        toolbar={canRecord && <Button type="primary" icon={<PlusOutlined />} onClick={() => setRecording(true)}>Record payment</Button>}
      />
      <RecordPaymentDrawer open={recording} onClose={() => setRecording(false)} />
      <ReasonModal open={!!reversing} title={`Reverse ${reversing?.payment_number ?? ""}?`} description={`${reversing ? fmtMoney(reversing.amount, reversing.currency) : ""} will be removed from the allocated invoices and the receipt voided. This is recorded in the adjustments history.`} okText="Reverse payment" danger loading={reverse.isPending} onCancel={() => setReversing(null)} onSubmit={(reason) => reversing && reverse.mutate({ p: reversing, reason })} />
    </div>
  );
}

function AdjustmentsTab() {
  const state = useTableParams({ ordering: "-created_at" });
  const columns: ColumnsType<PaymentAdjustment> = [
    { title: "When", dataIndex: "created_at", width: 170, render: (v: string) => fmtDateTime(v) },
    { title: "Kind", dataIndex: "kind", width: 130, render: (v: string) => <StatusBadge status={v} label={titleCase(v)} /> },
    { title: "Amount", dataIndex: "amount", width: 120, align: "right", render: (v: string) => fmtMoney(v) },
    { title: "Payment", dataIndex: "payment_number", width: 160, render: (v: string | null) => v ?? "-" },
    { title: "Invoice", dataIndex: "invoice_number", width: 160, render: (v: string | null) => v ?? "-" },
    { title: "Reason", dataIndex: "reason" },
    { title: "By", dataIndex: "created_by_name", width: 160, render: (v: string | null) => v ?? "System" },
    { title: "Details", key: "details", width: 100, render: (_, r) => <Popover trigger="click" placement="left" title="Before / after" content={<div style={{ maxWidth: 520, maxHeight: 320, overflow: "auto" }}><AuditChanges changes={{ before: r.before, after: r.after }} /></div>}><Button size="small" aria-label={`View details of ${r.kind}`}>View</Button></Popover> },
  ];
  return (
    <DataTable<PaymentAdjustment>
      queryKey="adjustments"
      path="/billing/adjustments/"
      columns={columns}
      tableState={state}
      searchPlaceholder="Search reason"
      emptyTitle="No adjustments"
      emptyDescription="Reversals, late fees, waivers and corrections are listed here; the history is immutable."
      scrollX={1000}
      filters={<FilterSelect value={state.params.kind} onChange={(v) => state.setFilter("kind", v)} options={["REVERSAL", "CORRECTION", "REFUND", "LATE_FEE", "WAIVER"].map((k) => ({ value: k, label: titleCase(k) }))} placeholder="Kind" width={140} />}
    />
  );
}

export default function PaymentsPage() {
  const [params, setParams] = useSearchParams();
  return (
    <div>
      <PageHeader title="Payments" subtitle="Every payment received, with receipts, reversals and the adjustment ledger." />
      <Tabs activeKey={params.get("tab") || "payments"} onChange={(k) => setParams({ tab: k })} items={[{ key: "payments", label: "Payments", children: <PaymentsTab /> }, { key: "adjustments", label: "Adjustments", children: <AdjustmentsTab /> }]} />
    </div>
  );
}
