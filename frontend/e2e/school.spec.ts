import { expect, test } from "@playwright/test";
import { ACCOUNTS, login } from "./helpers";

/** School console (admin + transport manager) against the seeded demo backend. */
test.describe("School console", () => {
  test("dashboard renders KPIs and links to the live map", async ({ page }) => {
    await login(page, ACCOUNTS.admin, /\/school$/);
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Students using transport")).toBeVisible();
    await expect(page.getByText("Buses available")).toBeVisible();
    await expect(page.getByText("Pending fees")).toBeVisible();
    await page.getByRole("button", { name: "Live map" }).click();
    await expect(page).toHaveURL(/\/school\/trips\/live/);
    await expect(page.getByRole("heading", { name: "Live map" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("region", { name: "Map" })).toBeVisible();
  });

  test("vehicles table searches, and a new vehicle can be added", async ({ page }) => {
    await login(page, ACCOUNTS.admin, /\/school$/);
    await page.goto("/school/vehicles");
    await expect(page.getByRole("heading", { name: "Vehicles" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("link", { name: "KA01AB1234" })).toBeVisible({ timeout: 20_000 });
    await page.getByRole("textbox", { name: /search/i }).fill("KA05");
    await expect(page.getByRole("link", { name: "KA01AB1234" })).toHaveCount(0, { timeout: 15_000 });
    await expect(page.getByRole("link", { name: "KA05EF3456" })).toBeVisible();

    const reg = `KA77E2E${String(Date.now()).slice(-4)}`;
    await page.getByRole("button", { name: "Add vehicle" }).click();
    const drawer = page.getByRole("dialog");
    await drawer.getByLabel(/registration/i).fill(reg);
    await drawer.getByLabel(/capacity/i).fill("30");
    await drawer.getByRole("button", { name: /save|create|add/i }).last().click();
    await page.getByRole("textbox", { name: /search/i }).fill(reg);
    await expect(page.getByRole("link", { name: reg })).toBeVisible({ timeout: 20_000 });
  });

  test("trips page lists today's trips and the route editor opens with stops", async ({ page }) => {
    await login(page, ACCOUNTS.admin, /\/school$/);
    await page.goto("/school/trips");
    await expect(page.getByRole("button", { name: "Create trip" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("row").nth(1)).toBeVisible({ timeout: 20_000 });
    await page.goto("/school/routes");
    await expect(page.getByRole("heading", { name: "Routes & stops" })).toBeVisible({ timeout: 20_000 });
    await page.getByRole("link", { name: /R1/ }).first().click();
    await expect(page).toHaveURL(/\/school\/routes\//);
    await page.goto(page.url().split("?")[0] + "?tab=stops");
    await expect(page.getByRole("button", { name: "Save stops" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("region", { name: "Map" })).toBeVisible();
  });

  test("transport manager cannot open audit logs or edit settings", async ({ page }) => {
    await login(page, ACCOUNTS.transport, /\/school$/);
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("navigation").getByText("Audit logs")).toHaveCount(0);
    await page.goto("/school/audit-logs");
    await expect(page).toHaveURL(/\/unauthorized/);
  });

  test("invoices and payments pages load with finance data", async ({ page }) => {
    await login(page, ACCOUNTS.admin, /\/school$/);
    await page.goto("/school/invoices");
    await expect(page.getByRole("heading", { name: "Invoices" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: "Generate invoices" })).toBeVisible();
    await expect(page.getByRole("row").nth(1)).toBeVisible({ timeout: 20_000 });
    await page.goto("/school/payments");
    await expect(page.getByRole("heading", { name: "Payments" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: "Record payment" }).first()).toBeVisible();
  });
});
