import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "@/test/server";
import { renderWithProviders } from "@/test/utils";
import { ParentProvider } from "../context";
import { INVOICE, PENDING_PAYMENT, baseHandlers } from "../test/fixtures";
import ParentFeesPage from "./ParentFeesPage";

function mockPaymentFlow() {
  const calls: string[] = [];
  server.use(
    ...baseHandlers,
    http.get("/api/parent/invoices/", () => HttpResponse.json([INVOICE])),
    http.get("/api/parent/payments/", () => HttpResponse.json([])),
    http.post("/api/parent/invoices/:id/", () => {
      calls.push("initiate");
      return HttpResponse.json(
        {
          payment: PENDING_PAYMENT,
          order: {
            gateway: "mock",
            order_id: "mock_order_1",
            amount: "2400.00",
            currency: "INR",
            is_simulated: true,
            checkout: { type: "mock", message: "SIMULATED PAYMENT - no real money will be collected.", checkout_url: "/api/billing/mock-gateway/checkout/?order_id=mock_order_1&amount=2400.00" },
          },
        },
        { status: 201 },
      );
    }),
    http.post("/api/billing/mock-gateway/checkout/", async ({ request }) => {
      const body = (await request.json()) as { order_id: string; amount: string; outcome: string };
      calls.push(`checkout:${body.outcome}`);
      const ok = body.outcome === "success";
      return HttpResponse.json({ simulated: true, order_id: body.order_id, payment_id: "mock_pay_1", amount: body.amount, status: ok ? "success" : "failed", signature: ok ? "abc123" : "" });
    }),
    http.post("/api/parent/payments/verify/", async ({ request }) => {
      const body = (await request.json()) as { signature: string };
      calls.push("verify");
      if (!body.signature) return HttpResponse.json({ detail: "Payment verification failed: Invalid payment signature", code: "domain_error" }, { status: 400 });
      return HttpResponse.json({ ...PENDING_PAYMENT, status: "VERIFIED", gateway_payment_id: "mock_pay_1", receipt_id: "rc-1", receipt_number: "RCT-TEST-0001", is_simulated: true });
    }),
  );
  return calls;
}

function renderFees() {
  return renderWithProviders(
    <ParentProvider>
      <ParentFeesPage />
    </ParentProvider>,
    { route: "/parent/fees" },
  );
}

describe("ParentFeesPage pay flow", () => {
  it("shows the simulated gateway label and completes initiate -> checkout -> verify with a receipt", async () => {
    const calls = mockPaymentFlow();
    const user = userEvent.setup();
    renderFees();
    expect(await screen.findByText("October 2026")).toBeInTheDocument();
    expect(screen.getByText("1 open invoice")).toBeInTheDocument();
    expect(screen.getAllByText("Overdue").length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: /Pay now/ }));

    expect(await screen.findByText(/Simulated payment \(demo gateway\) - no money is collected/)).toBeInTheDocument();
    expect(screen.getByText("SIMULATED PAYMENT - no real money will be collected.")).toBeInTheDocument();
    expect(screen.getByText("mock_order_1")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Pay .*2,400/ }));
    expect(await screen.findByText("Payment verified")).toBeInTheDocument();
    expect(screen.getByText("RCT-TEST-0001")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View receipt" })).toBeInTheDocument();
    expect(calls).toEqual(["initiate", "checkout:success", "verify"]);
  });

  it("reports a declined simulated payment and records it with the server", async () => {
    const calls = mockPaymentFlow();
    const user = userEvent.setup();
    renderFees();
    await user.click(await screen.findByRole("button", { name: /Pay now/ }));
    await user.click(await screen.findByRole("button", { name: "Simulate a failed payment" }));
    expect(await screen.findByText("Payment not completed")).toBeInTheDocument();
    expect(screen.getByText(/The gateway declined the payment, so nothing was charged/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(calls).toEqual(["initiate", "checkout:failed", "verify"]);
  });
});
