import { useState } from "react";
import { App, Button, Card } from "antd";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { CreditCardOutlined, ExclamationCircleOutlined, FileTextOutlined, PrinterOutlined, WalletOutlined } from "@ant-design/icons";
import { errorMessage, openHtml } from "@/api/client";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { EmptyState, LoadingSkeleton, QueryState } from "@/components/ui/States";
import { SimulatedTag, StatusBadge } from "@/components/ui/StatusBadge";
import { fmtDate, fmtDateTime, fmtMoney, titleCase } from "@/lib/format";
import { parentApi, qk } from "../api";
import { PayModal } from "../components/PayModal";
import { useParent } from "../context";
import { sum } from "../lib";
import { OPEN_INVOICE_STATUSES, type ParentInvoice, type ParentPayment } from "../types";

export default function ParentFeesPage() {
  const { selectedId, selected, children, childrenQuery } = useParent();
  const [payInvoice, setPayInvoice] = useState<ParentInvoice | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const navigate = useNavigate();
  const { message } = App.useApp();
  const invoices = useQuery({ queryKey: qk.invoices(selectedId), queryFn: () => parentApi.invoices(selectedId), enabled: !!selectedId });
  const payments = useQuery({ queryKey: qk.payments, queryFn: parentApi.payments, enabled: !!selectedId });

  if (childrenQuery.isLoading) return <LoadingSkeleton rows={8} />;
  if (children.length === 0) return <EmptyState title="No children linked" description="Fees appear here once the school links your child to this account." />;

  const printReceipt = (receiptId: string) => openHtml(`/parent/receipts/${receiptId}/?print=1`).catch((e) => message.error(errorMessage(e, "Printable receipt unavailable")));

  return (
    <div className="sbp-stack">
      <PageHeader compact title="Fees" subtitle={selected ? `${selected.name} · ${selected.class_label}` : undefined} />
      <QueryState query={invoices} rows={6}>
        {(list) => {
          const open = list.filter((i) => OPEN_INVOICE_STATUSES.includes(i.status));
          const outstanding = sum(open.map((i) => i.balance));
          const overdue = open.filter((i) => i.status === "OVERDUE" || i.is_overdue);
          const currency = list[0]?.currency ?? "INR";
          const nextDue = open
            .map((i) => i.due_date)
            .sort()
            .at(0);
          return (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
                <StatCard title="Outstanding" value={fmtMoney(outstanding.toFixed(2), currency)} tone={overdue.length ? "danger" : outstanding > 0 ? "warning" : "success"} icon={<WalletOutlined />} hint={nextDue ? `Next due ${fmtDate(nextDue)}` : "Nothing due"} />
                <StatCard title="Overdue" value={overdue.length} tone={overdue.length ? "danger" : "neutral"} icon={<ExclamationCircleOutlined />} hint={`${open.length} open invoice${open.length === 1 ? "" : "s"}`} />
              </div>
              <h2 className="sbp-section-title" style={{ margin: "4px 0 0" }}>
                Invoices
              </h2>
              {list.length === 0 ? (
                <EmptyState title="No invoices yet" description="Invoices issued by the school appear here." />
              ) : (
                list.map((inv) => <InvoiceCard key={inv.id} invoice={inv} expanded={expanded === inv.id} onToggle={() => setExpanded(expanded === inv.id ? null : inv.id)} onPay={() => setPayInvoice(inv)} />)
              )}
            </>
          );
        }}
      </QueryState>

      <h2 className="sbp-section-title" style={{ margin: "4px 0 0" }}>
        Payments
      </h2>
      <QueryState query={payments} rows={4}>
        {(list) => {
          const mine = list.filter((p) => p.student === selectedId);
          return mine.length === 0 ? (
            <EmptyState title="No payments yet" description="Payments made online or recorded at the transport office appear here." />
          ) : (
            <div className="sbp-stack" style={{ gap: 8 }}>
              {mine.map((p) => (
                <PaymentRow key={p.id} payment={p} onView={() => navigate(`/parent/fees/receipts/${p.receipt_id}`)} onPrint={() => p.receipt_id && printReceipt(p.receipt_id)} />
              ))}
            </div>
          );
        }}
      </QueryState>

      {payInvoice && <PayModal invoice={payInvoice} onClose={() => setPayInvoice(null)} />}
    </div>
  );
}

function InvoiceCard({ invoice, expanded, onToggle, onPay }: { invoice: ParentInvoice; expanded: boolean; onToggle: () => void; onPay: () => void }) {
  const payable = OPEN_INVOICE_STATUSES.includes(invoice.status) && Number(invoice.balance) > 0;
  const balanceColour = Number(invoice.balance) > 0 ? (invoice.is_overdue || invoice.status === "OVERDUE" ? "var(--sbp-danger)" : "var(--sbp-warning)") : "var(--sbp-success)";
  return (
    <Card size="small">
      <div className="sbp-between" style={{ alignItems: "flex-start" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600 }}>{invoice.period_label}</div>
          <div className="sbp-muted" style={{ fontSize: 12 }}>
            {invoice.invoice_number}
            {invoice.fee_plan_name ? ` · ${invoice.fee_plan_name}` : ""}
          </div>
        </div>
        <StatusBadge status={invoice.status} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8, marginTop: 12, fontSize: 13 }}>
        <div>
          <div className="sbp-muted" style={{ fontSize: 11 }}>
            Total
          </div>
          <div className="sbp-mono" style={{ fontWeight: 600 }}>
            {fmtMoney(invoice.total, invoice.currency)}
          </div>
        </div>
        <div>
          <div className="sbp-muted" style={{ fontSize: 11 }}>
            Paid
          </div>
          <div className="sbp-mono">{fmtMoney(invoice.amount_paid, invoice.currency)}</div>
        </div>
        <div>
          <div className="sbp-muted" style={{ fontSize: 11 }}>
            Balance
          </div>
          <div className="sbp-mono" style={{ fontWeight: 700, color: balanceColour }}>
            {fmtMoney(invoice.balance, invoice.currency)}
          </div>
        </div>
      </div>
      <div className="sbp-muted" style={{ fontSize: 12, marginTop: 8 }}>
        Due {fmtDate(invoice.due_date)}
        {invoice.is_overdue && <span style={{ color: "var(--sbp-danger)", fontWeight: 600 }}> · overdue</span>}
      </div>
      <div className="sbp-row" style={{ marginTop: 12 }}>
        {payable && (
          <Button type="primary" size="large" className="sbp-touch-btn" style={{ flex: 1 }} icon={<CreditCardOutlined />} onClick={onPay}>
            Pay now
          </Button>
        )}
        <Button size="large" style={{ flex: payable ? undefined : 1 }} onClick={onToggle} aria-expanded={expanded}>
          {expanded ? "Hide details" : "Details"}
        </Button>
      </div>
      {expanded && (
        <div className="sbp-stack" style={{ marginTop: 12, borderTop: "1px solid var(--sbp-border)", paddingTop: 12 }}>
          <div>
            <div className="sbp-kicker">Line items</div>
            {invoice.line_items.map((li) => (
              <div key={li.id} className="sbp-between" style={{ fontSize: 13, padding: "4px 0" }}>
                <span>
                  {li.description}
                  {Number(li.quantity) !== 1 ? ` × ${li.quantity}` : ""}
                </span>
                <span className="sbp-mono">{fmtMoney(li.amount, invoice.currency)}</span>
              </div>
            ))}
            {Number(invoice.discount) > 0 && (
              <div className="sbp-between" style={{ fontSize: 13, padding: "4px 0" }}>
                <span>Discount</span>
                <span className="sbp-mono">- {fmtMoney(invoice.discount, invoice.currency)}</span>
              </div>
            )}
            {Number(invoice.late_fee) > 0 && (
              <div className="sbp-between" style={{ fontSize: 13, padding: "4px 0" }}>
                <span>Late fee</span>
                <span className="sbp-mono">{fmtMoney(invoice.late_fee, invoice.currency)}</span>
              </div>
            )}
          </div>
          <div>
            <div className="sbp-kicker">Payments</div>
            {invoice.payments.length === 0 ? (
              <div className="sbp-muted" style={{ fontSize: 13 }}>
                No payments yet.
              </div>
            ) : (
              invoice.payments.map((p) => (
                <div key={p.payment_id} className="sbp-between" style={{ fontSize: 13, padding: "4px 0" }}>
                  <span className="sbp-row" style={{ flexWrap: "wrap" }}>
                    {p.payment_number} · {titleCase(p.method)} · {fmtDate(p.paid_at)} <SimulatedTag show={p.is_simulated} />
                  </span>
                  <span className="sbp-row">
                    <StatusBadge status={p.status} />
                    <span className="sbp-mono">{fmtMoney(p.amount, invoice.currency)}</span>
                  </span>
                </div>
              ))
            )}
          </div>
          {invoice.notes && (
            <div className="sbp-muted" style={{ fontSize: 12 }}>
              {invoice.notes}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function PaymentRow({ payment, onView, onPrint }: { payment: ParentPayment; onView: () => void; onPrint: () => void }) {
  return (
    <div className="sbp-list-card" style={{ alignItems: "flex-start", margin: 0 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="sbp-row" style={{ flexWrap: "wrap" }}>
          <strong className="sbp-mono">{fmtMoney(payment.amount, payment.currency)}</strong>
          <StatusBadge status={payment.status} />
          <SimulatedTag show={payment.is_simulated} />
        </div>
        <div className="sbp-muted" style={{ fontSize: 12, marginTop: 4 }}>
          {payment.payment_number} · {titleCase(payment.method)} · {fmtDateTime(payment.paid_at)}
        </div>
        {payment.allocations.length > 0 && (
          <div className="sbp-muted" style={{ fontSize: 12 }}>
            For {payment.allocations.map((a) => a.invoice_number).join(", ")}
          </div>
        )}
        {payment.receipt_number && <div style={{ fontSize: 12, marginTop: 4 }}>Receipt {payment.receipt_number}</div>}
        {payment.status === "REVERSED" && payment.reversal_reason && (
          <div className="sbp-muted" style={{ fontSize: 12 }}>
            Reversed: {payment.reversal_reason}
          </div>
        )}
      </div>
      {payment.receipt_id && (
        <div className="sbp-stack" style={{ gap: 6 }}>
          <Button size="small" icon={<FileTextOutlined />} onClick={onView}>
            Receipt
          </Button>
          <Button size="small" type="text" icon={<PrinterOutlined />} onClick={onPrint}>
            Print
          </Button>
        </div>
      )}
    </div>
  );
}
