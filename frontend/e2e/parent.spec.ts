import { expect, test } from "@playwright/test";
import { ACCOUNTS, apiSession, login } from "./helpers";

/** Parent PWA against the seeded demo backend. */
test.describe("Parent PWA", () => {
  test("home shows today's transport, fees and the child selector", async ({ page }) => {
    await login(page, ACCOUNTS.parent, /\/parent$/);
    await expect(page.getByRole("region", { name: "Welcome" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("region", { name: "Welcome" })).toContainText("Priya");
    await expect(page.getByLabel("Fees").first()).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Primary" })).toContainText("Track");
  });

  test("live tracking page explains the bus state and never shows other students", async ({ page }) => {
    await login(page, ACCOUNTS.parent, /\/parent$/);
    await page.goto("/parent/track");
    await expect(page.getByText(/Bus is|No trip|not started|Trip|scheduled/i).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("region", { name: "Map" })).toBeVisible();
    await expect(page.getByText("Reyansh Rao")).toHaveCount(0); // sibling is only selectable, never listed as a passenger
  });

  test("pays an open invoice through the clearly labelled simulated gateway", async ({ page, request }) => {
    const parentAuth = await apiSession(request, ACCOUNTS.parent);
    const children = await (await request.get("/api/parent/children/", parentAuth)).json();
    const adminAuth = await apiSession(request);
    const planResponse = await request.post("/api/billing/fee-plans/", { ...adminAuth, data: {
      name: "Browser test transport", code: `E2E${Date.now()}`, amount: "100.00", billing_cycle: "MONTHLY",
    } });
    expect(planResponse.ok(), await planResponse.text()).toBeTruthy();
    const plan = await planResponse.json();
    const invoice = await request.post("/api/billing/invoices/", { ...adminAuth, data: {
      student: children[0].id, fee_plan: plan.id,
      period_label: `Browser test ${Date.now()}`, period_start: "2026-01-01", period_end: "2026-01-31",
      due_date: "2026-02-01", amount: "100.00",
    } });
    expect(invoice.ok(), await invoice.text()).toBeTruthy();
    await login(page, ACCOUNTS.parent, /\/parent$/);
    await page.goto("/parent/fees");
    await expect(page.getByRole("heading", { name: "Fees" })).toBeVisible({ timeout: 20_000 });
    const pay = page.getByRole("button", { name: "Pay now" }).first();
    await expect(pay).toBeVisible();
    await pay.click();
    const modal = page.getByRole("dialog");
    await expect(modal.getByText("Simulated payment (demo gateway) - no money is collected")).toBeVisible({ timeout: 15_000 });
    await modal.getByRole("button", { name: /^Pay / }).click();
    await expect(modal.getByText("Payment verified")).toBeVisible({ timeout: 20_000 });
    await expect(modal.getByText(/Receipt/)).toBeVisible();
    await expect(modal.getByText("SIMULATED")).toBeVisible();
  });

  test("notification centre lists alerts and marks them read", async ({ page }) => {
    await login(page, ACCOUNTS.parent, /\/parent$/);
    await page.goto("/parent/notifications");
    await expect(page.getByRole("button", { name: "Mark all read" })).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "Mark all read" }).click();
    await expect(page.getByLabel(/^Unread: /)).toHaveCount(0, { timeout: 15_000 });
  });

  test("validates required dates before reporting a child's absence", async ({ page }) => {
    await login(page, ACCOUNTS.parent, /\/parent$/);
    await page.goto("/parent/more/requests?tab=absence&new=1");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 20_000 });
    await dialog.getByRole("button", { name: /submit|report/i }).click();
    // validation keeps the dialog open with an error until dates are chosen
    await expect(dialog).toBeVisible();
  });
});
