/**
 * Online payment flow for one invoice:
 *   1. POST /parent/invoices/<id>/        -> server creates a PENDING payment and a gateway order
 *   2. hosted checkout                     -> the demo "mock" gateway is simulated in-app, clearly labelled, no money moves
 *   3. POST /parent/payments/verify/       -> server verifies the gateway signature and issues the receipt
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Button, Modal, Result, Spin } from "antd";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { errorMessage } from "@/api/client";
import { KeyValue } from "@/components/ui/Misc";
import { SimulatedTag } from "@/components/ui/StatusBadge";
import { fmtMoney } from "@/lib/format";
import { parentApi, qk } from "../api";
import type { ParentInvoice, ParentPayment, PaymentOrder } from "../types";

type Step =
  | { kind: "initiating" }
  | { kind: "checkout"; order: PaymentOrder }
  | { kind: "processing"; order: PaymentOrder; label: string }
  | { kind: "success"; payment: ParentPayment }
  | { kind: "failed"; order: PaymentOrder | null; error: string };

interface Props {
  invoice: ParentInvoice;
  onClose: () => void;
}

export function PayModal({ invoice, onClose }: Props) {
  const [step, setStep] = useState<Step>({ kind: "initiating" });
  const started = useRef(false);
  const qc = useQueryClient();
  const navigate = useNavigate();

  const start = useCallback(
    () =>
      parentApi
        .initiatePayment(invoice.id)
        .then((res) => setStep({ kind: "checkout", order: res.order }))
        .catch((e) => setStep({ kind: "failed", order: null, error: errorMessage(e, "Could not start the payment") })),
    [invoice.id],
  );

  useEffect(() => {
    if (started.current) return; // StrictMode double-invokes effects; never create two orders
    started.current = true;
    void start();
  }, [start]);

  const retry = () => {
    setStep({ kind: "initiating" });
    void start();
  };

  const pay = async (order: PaymentOrder, outcome: "success" | "failed") => {
    setStep({ kind: "processing", order, label: outcome === "success" ? "Contacting the demo gateway…" : "Simulating a declined payment…" });
    let result;
    try {
      result = await parentApi.mockCheckout({ order_id: order.order_id, amount: order.amount, outcome });
    } catch (e) {
      setStep({ kind: "failed", order, error: errorMessage(e, "The gateway rejected the order") });
      return;
    }
    setStep({ kind: "processing", order, label: "Verifying the payment with the school server…" });
    try {
      // Always report back to the server so a declined attempt is recorded as FAILED rather than left pending.
      const payment = await parentApi.verifyPayment({ order_id: result.order_id, payment_id: result.payment_id, amount: result.amount, signature: result.signature ?? "", currency: result.currency ?? order.currency, status: result.status });
      if (payment.status !== "VERIFIED") throw new Error("The payment was declined. No receipt was issued.");
      setStep({ kind: "success", payment });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["parent", "invoices"] }),
        qc.invalidateQueries({ queryKey: qk.payments }),
        qc.invalidateQueries({ queryKey: ["parent", "home"] }),
        qc.invalidateQueries({ queryKey: qk.unread }),
        qc.invalidateQueries({ queryKey: qk.notifications }),
      ]);
    } catch (e) {
      const prefix = result.status === "failed" ? "The gateway declined the payment, so nothing was charged. " : "";
      setStep({ kind: "failed", order, error: prefix + errorMessage(e, "Payment verification failed") });
    }
  };

  const busy = step.kind === "processing";
  return (
    <Modal open onCancel={onClose} footer={null} centered title={step.kind === "success" ? "Payment complete" : `Pay ${invoice.invoice_number}`} maskClosable={!busy} closable={!busy} keyboard={!busy}>
      {step.kind === "initiating" && (
        <div style={{ padding: 24, textAlign: "center" }} role="status" aria-live="polite">
          <Spin />
          <div style={{ marginTop: 12 }}>Creating your payment order…</div>
        </div>
      )}
      {step.kind === "checkout" &&
        (step.order.checkout.type === "mock" ? (
          <div className="sbp-stack">
            <Alert type="warning" showIcon message="Simulated payment (demo gateway) - no money is collected" description={step.order.checkout.message} />
            <KeyValue
              items={[
                { label: "Invoice", value: `${invoice.invoice_number} · ${invoice.period_label}` },
                { label: "Amount", value: <strong>{fmtMoney(step.order.amount, step.order.currency)}</strong> },
                { label: "Order", value: <code style={{ fontSize: 12 }}>{step.order.order_id}</code> },
                { label: "Gateway", value: `${step.order.gateway} (sandbox)` },
              ]}
            />
            <Button type="primary" size="large" block className="sbp-touch-btn" onClick={() => pay(step.order, "success")}>
              Pay {fmtMoney(step.order.amount, step.order.currency)}
            </Button>
            <Button size="large" block danger onClick={() => pay(step.order, "failed")}>
              Simulate a failed payment
            </Button>
            <Button type="text" block onClick={onClose}>
              Cancel
            </Button>
          </div>
        ) : (
          <div className="sbp-stack">
            <Alert type="info" showIcon message={`This school uses the ${step.order.gateway} payment gateway.`} description="Complete the payment on the gateway's checkout page. The school verifies it automatically once the gateway confirms it." />
            <Button type="primary" size="large" block href={step.order.checkout.checkout_url} target="_blank" rel="noopener">
              Continue to checkout · {fmtMoney(step.order.amount, step.order.currency)}
            </Button>
            <Button type="text" block onClick={onClose}>
              Close
            </Button>
          </div>
        ))}
      {step.kind === "processing" && (
        <div style={{ padding: 24, textAlign: "center" }} role="status" aria-live="polite">
          <Spin />
          <div style={{ marginTop: 12 }}>{step.label}</div>
        </div>
      )}
      {step.kind === "success" && (
        <Result
          status="success"
          title="Payment verified"
          subTitle={
            <div>
              <div>
                {fmtMoney(step.payment.amount, step.payment.currency)} received for {invoice.invoice_number}.
              </div>
              <div style={{ marginTop: 6 }}>
                Receipt <strong>{step.payment.receipt_number ?? "pending"}</strong> <SimulatedTag show={step.payment.is_simulated} />
              </div>
            </div>
          }
          extra={[
            step.payment.receipt_id ? (
              <Button
                key="receipt"
                type="primary"
                size="large"
                onClick={() => {
                  onClose();
                  navigate(`/parent/fees/receipts/${step.payment.receipt_id}`);
                }}
              >
                View receipt
              </Button>
            ) : null,
            <Button key="done" size="large" onClick={onClose}>
              Done
            </Button>,
          ]}
        />
      )}
      {step.kind === "failed" && (
        <Result
          status="error"
          title="Payment not completed"
          subTitle={step.error}
          extra={[
            <Button key="retry" type="primary" size="large" onClick={retry}>
              Try again
            </Button>,
            <Button key="close" size="large" onClick={onClose}>
              Close
            </Button>,
          ]}
        />
      )}
    </Modal>
  );
}
