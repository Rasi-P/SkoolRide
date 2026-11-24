import { expect, test } from "@playwright/test";
import { ACCOUNTS, login } from "./helpers";

test("production PWA installs its worker, excludes private data from caches and falls back offline", async ({ page, context, request }) => {
  test.skip(process.env.E2E_PRODUCTION !== "1", "Requires the built PWA served by npm run preview");
  const manifest = await request.get("/manifest.webmanifest");
  expect(manifest.ok()).toBeTruthy();
  const metadata = await manifest.json();
  expect(metadata.name).toBe("SchoolBus Pro");
  expect(metadata.display).toBe("standalone");
  for (const icon of metadata.icons) {
    const response = await request.get(icon.src);
    expect(response.ok()).toBeTruthy();
    expect(response.headers()["content-type"]).toContain("image/png");
  }
  await login(page, ACCOUNTS.parent, /\/parent$/);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await expect(page.getByRole("region", { name: "Welcome" })).toBeVisible();
  const privateEntries = await page.evaluate(async () => {
    const entries = await Promise.all((await caches.keys()).map(async (name) => (await (await caches.open(name)).keys()).map((r) => r.url)));
    return entries.flat().filter((url) => /\/(api|media|ws|invite)\//.test(new URL(url).pathname) || new URL(url).searchParams.has("token"));
  });
  expect(privateEntries).toEqual([]);
  await context.setOffline(true);
  await page.goto("/offline-verification");
  await expect(page.getByRole("heading", { name: "You're offline" })).toBeVisible();
  await expect(page.getByText(/needs a connection for live tracking/)).toBeVisible();
});
