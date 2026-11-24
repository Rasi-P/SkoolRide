import { ProtectedImage } from "@/components/ui/ProtectedMedia";
import { useState } from "react";
import { Alert, App, Button, Card, Divider } from "antd";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeftOutlined, PrinterOutlined } from "@ant-design/icons";
import { openHtml } from "@/api/client";
import { KeyValue } from "@/components/ui/Misc";
import { QueryState } from "@/components/ui/States";
import { SimulatedTag, StatusBadge } from "@/components/ui/StatusBadge";
import { fmtDateTime, fmtMoney, titleCase } from "@/lib/format";
import { parentApi, qk } from "../api";

export default function ParentReceiptPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [printing, setPrinting] = useState(false);
  const receipt = useQuery({ queryKey: qk.receipt(id), queryFn: () => parentApi.receipt(id), enabled: !!id });

  const print = async () => {
    setPrinting(true);
    try {
      await openHtml(`/parent/receipts/${id}/?print=1`);
    } catch {
      message.info("The server's printable version is unavailable; printing this page instead.");
      window.print();
    } finally {
      setPrinting(false);
    }
  };

  return (
    <div className="sbp-stack">
      <style>{`@media print { .sbp-mobile-header, .sbp-bottom-nav, .sbp-no-print { display: none !important; } .sbp-mobile-content { padding: 0 !important; } }`}</style>
      <div className="sbp-between sbp-no-print">
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate("/parent/fees")}>
          Fees
        </Button>
        <Button type="primary" icon={<PrinterOutlined />} onClick={print} loading={printing}>
          Print
        </Button>
      </div>
      <QueryState query={receipt} rows={8}>
        {(r) => (
          <Card>
            {r.is_void && <Alert type="error" showIcon message="This receipt has been voided." style={{ marginBottom: 12 }} />}
            <div className="sbp-between" style={{ alignItems: "flex-start" }}>
              <div className="sbp-row" style={{ alignItems: "flex-start" }}>
                {r.school.logo && <ProtectedImage src={r.school.logo} alt="" width={40} height={40} style={{ borderRadius: 8 }} />}
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{r.school.name}</div>
                  <div className="sbp-muted" style={{ fontSize: 12 }}>
                    {r.school.address}
                  </div>
                  <div className="sbp-muted" style={{ fontSize: 12 }}>
                    {[r.school.phone, r.school.email].filter(Boolean).join(" · ")}
                  </div>
                </div>
              </div>
              <SimulatedTag show={r.payment.is_simulated} />
            </div>
            <Divider />
            <div className="sbp-between">
              <div>
                <div className="sbp-kicker">Receipt</div>
                <div className="sbp-mono" style={{ fontSize: 22, fontWeight: 700 }}>
                  {r.receipt_number}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div className="sbp-kicker">Issued</div>
                <div>{fmtDateTime(r.issued_at)}</div>
                {r.issued_by_name && (
                  <div className="sbp-muted" style={{ fontSize: 12 }}>
                    by {r.issued_by_name}
                  </div>
                )}
              </div>
            </div>
            <Divider />
            <KeyValue
              items={[
                { label: "Student", value: `${r.student.name} · ${r.student.admission_number} · ${r.student.class_label}` },
                { label: "Paid by", value: r.payment.paid_by_name ?? "-" },
                { label: "Payment", value: r.payment.payment_number },
                { label: "Method", value: titleCase(r.payment.method) },
                { label: "Paid at", value: fmtDateTime(r.payment.paid_at) },
                { label: "Reference", value: r.payment.transaction_reference || "-" },
                { label: "Status", value: <StatusBadge status={r.payment.status} /> },
              ]}
            />
            <Divider />
            <div className="sbp-kicker">Applied to</div>
            {r.payment.allocations.length === 0 ? (
              <div className="sbp-muted" style={{ fontSize: 13 }}>
                Unallocated credit
              </div>
            ) : (
              r.payment.allocations.map((a) => (
                <div key={a.invoice_id} className="sbp-between" style={{ padding: "6px 0", fontSize: 13 }}>
                  <span>
                    {a.invoice_number} · {a.period_label}
                  </span>
                  <span className="sbp-mono">{fmtMoney(a.amount, r.payment.currency)}</span>
                </div>
              ))
            )}
            <Divider />
            <div className="sbp-between">
              <span style={{ fontWeight: 600 }}>Amount received</span>
              <span className="sbp-big-number" style={{ fontSize: 24 }}>
                {fmtMoney(r.payment.amount, r.payment.currency)}
              </span>
            </div>
            {r.payment.is_simulated && <Alert type="warning" showIcon style={{ marginTop: 12 }} message="Simulated payment: no money was collected. This receipt was generated by the demo gateway." />}
          </Card>
        )}
      </QueryState>
    </div>
  );
}
