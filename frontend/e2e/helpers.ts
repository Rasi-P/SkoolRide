import { expect, type Page } from "@playwright/test";

export const PASSWORD = "Demo@12345";
export const ACCOUNTS = {
  superadmin: "superadmin@schoolbuspro.demo",
  admin: "admin@greenfield.demo",
  transport: "transport@greenfield.demo",
  driver: "driver1@greenfield.demo",
  attendant: "attendant1@greenfield.demo",
  parent: "parent@greenfield.demo",
  suspended: "admin@riverside.demo",
};

/** Sign in through the real login form and wait for the role home to load. */
export async function login(page: Page, email: string, expectedPath: RegExp) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(expectedPath, { timeout: 15_000 });
}

/** Authenticated API context for creating independent browser-test fixtures. */
export async function apiSession(request: import("@playwright/test").APIRequestContext, email = ACCOUNTS.admin) {
  const csrf = await request.get("/api/auth/csrf/");
  expect(csrf.ok()).toBeTruthy();
  const csrfToken = (await csrf.json()).csrfToken as string;
  const response = await request.post("/api/auth/login/", { data: { email, password: PASSWORD }, headers: { "X-CSRFToken": csrfToken } });
  expect(response.ok(), await response.text()).toBeTruthy();
  return { headers: { Authorization: `Bearer ${(await response.json()).access}`, "X-CSRFToken": csrfToken } };
}
