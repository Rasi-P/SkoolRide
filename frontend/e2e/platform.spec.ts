import { expect, test } from "@playwright/test";
import { ACCOUNTS, login } from "./helpers";

/** Super Admin console against the seeded demo backend: approve an application and inspect the school. */
test.describe("Platform (Super Admin)", () => {
  test("dashboard shows platform stats and recent applications", async ({ page }) => {
    await login(page, ACCOUNTS.superadmin, /\/platform$/);
    await expect(page.getByRole("heading", { name: "Platform dashboard" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Schools onboarded per month")).toBeVisible();
    await expect(page.getByText("Recent applications")).toBeVisible();
  });

  test("approves a pending application and shows the admin invitation link", async ({ page }) => {
    // Submit a fresh application so the test does not depend on seeded state.
    const stamp = Date.now();
    await page.goto("/register");
    await page.getByLabel("School name").fill(`Approve Me ${stamp}`);
    await page.getByLabel("Contact person").fill("Approval Tester");
    await page.getByLabel("Email").fill(`approve${stamp}@example.test`);
    await page.getByLabel("Phone").fill("+91 90000 00001");
    await page.getByLabel("Address").fill("2 Approval Street");
    await page.getByLabel("City").fill("Mysuru");
    await page.getByRole("button", { name: "Submit application" }).click();
    await expect(page.getByText("Application submitted")).toBeVisible({ timeout: 15_000 });

    await login(page, ACCOUNTS.superadmin, /\/platform$/);
    await page.goto("/platform/applications?status=PENDING");
    const row = page.getByRole("button", { name: `View application from Approve Me ${stamp}` });
    await expect(row).toBeVisible({ timeout: 20_000 });
    await row.click();
    const drawer = page.getByRole("dialog").first();
    await drawer.getByRole("button", { name: /approve$/i }).click();
    const modal = page.getByRole("dialog").filter({ hasText: `Approve Approve Me ${stamp}` });
    await modal.getByRole("button", { name: "Confirm approval" }).click();
    await expect(page.getByText("Application approved", { exact: true }).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: "Copy invitation link" })).toBeVisible();
  });

  test("school directory opens school details and exposes the suspension control", async ({ page }) => {
    await login(page, ACCOUNTS.superadmin, /\/platform$/);
    await page.goto("/platform/schools");
    await expect(page.getByRole("heading", { name: "Schools" })).toBeVisible({ timeout: 20_000 });
    await page.getByRole("link", { name: "Open Sunrise Public School" }).click();
    await expect(page).toHaveURL(/\/platform\/schools\//);
    await expect(page.getByText("Sunrise Public School").first()).toBeVisible();
    await expect(page.getByRole("button", { name: /suspend/i })).toBeVisible();
  });

  test("audit logs list sensitive operations", async ({ page }) => {
    await login(page, ACCOUNTS.superadmin, /\/platform$/);
    await page.goto("/platform/audit-logs");
    await expect(page.getByRole("heading", { name: "Audit logs" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("row").nth(1)).toBeVisible();
  });
});
