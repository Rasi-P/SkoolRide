import { expect, test } from "@playwright/test";
import { ACCOUNTS, PASSWORD, apiSession, login } from "./helpers";

/**
 * Creates its own vehicle, driver and trip so repeated runs do not consume seeded trips.
 * Geolocation is granted so GPS sharing starts.
 */
test.use({ geolocation: { latitude: 13.012, longitude: 77.77 }, permissions: ["geolocation"] });

test.describe("Driver workflow", () => {
  test("driver starts a trip, boards a student, handles a stop and ends the trip", async ({ page, request }) => {
    const session = await apiSession(request);
    const create = async (path: string, data: Record<string, unknown>) => {
      const response = await request.post(`/api/${path}`, { ...session, data });
      expect(response.ok(), await response.text()).toBeTruthy();
      return response.json();
    };
    const stamp = Date.now();
    const vehicle = await create("fleet/vehicles/", { registration_number: `E2E${stamp}`, capacity: 40 });
    const email = `driver${stamp}@e2e.test`;
    const driver = await create("people/staff/", { staff_type: "DRIVER", employee_id: `E2E${stamp}`, first_name: "Test", last_name: "Driver", email, phone: "9000000000" });
    const invitation = await create(`people/staff/${driver.id}/invite/`, {});
    await create("auth/invitations/accept/", { token: invitation.accept_url.split("/").pop(), password: PASSWORD });
    const routes = await (await request.get("/api/routing/routes/?search=R1", session)).json();
    const today = (await (await request.get("/api/school/dashboard/", session)).json()).date;
    const trip = await create("trips/trips/", { route: routes.results[0].id, vehicle: vehicle.id, driver: driver.id, direction: "PICKUP", scheduled_date: today, scheduled_start_time: "07:00:00" });
    await login(page, email, /\/driver$/);
    await expect(page.getByRole("heading", { name: "Today's trips" })).toBeVisible({ timeout: 20_000 });

    await page.goto(`/driver/trips/${trip.id}`);
    await expect(page).toHaveURL(/\/driver\/trips\//);

    await page.getByRole("button", { name: "Start trip" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("button", { name: "Yes, start trip" })).toBeVisible();
    await dialog.getByRole("button", { name: "Yes, start trip" }).click();
    await expect(page.getByRole("button", { name: "End trip" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: "Emergency" })).toBeVisible();

    // Board the first expected student.
    const board = page.getByRole("button", { name: /^Board / }).first();
    await expect(board).toBeVisible();
    const label = (await board.getAttribute("aria-label")) || "";
    await board.click();
    await expect(page.getByRole("button", { name: label })).toHaveCount(0, { timeout: 15_000 });

    // Arrive at and depart the current stop.
    await page.getByRole("button", { name: /^Arrived at / }).first().click();
    await expect(page.getByRole("button", { name: /^Departed / }).first()).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: /^Departed / }).first().click();
    if (trip.students.filter((student: { trip_stop: string }) => student.trip_stop === trip.stops[0].id).length > 1) {
      await page.getByRole("dialog").getByRole("button", { name: "Yes, depart" }).click();
    }
    await expect(page.getByRole("button", { name: /^Arrived at / }).first()).toBeVisible();

    // Emergency needs two confirmations: cancel at step one.
    await page.getByRole("button", { name: "Emergency" }).click();
    await expect(page.getByRole("dialog").getByText("Send emergency alert?")).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // End the trip.
    await page.getByRole("button", { name: "End trip" }).click();
    const endDialog = page.getByRole("dialog");
    await expect(endDialog).toBeVisible();
    await endDialog.getByRole("button", { name: /end|yes/i }).last().click();
    await expect(page.getByText("Completed").first()).toBeVisible({ timeout: 20_000 });

    // History lists the completed trip.
    await page.goto("/driver/history");
    await expect(page.getByText("Completed").first()).toBeVisible({ timeout: 20_000 });
  });

  test("attendant sees the driver home but no vehicle management", async ({ page }) => {
    await login(page, ACCOUNTS.attendant, /\/driver$/);
    await expect(page.getByRole("heading", { name: "Today's trips" })).toBeVisible({ timeout: 20_000 });
    await page.goto("/school/vehicles");
    await expect(page).toHaveURL(/\/unauthorized/);
  });
});
