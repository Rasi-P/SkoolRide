import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "@/test/server";
import { renderWithProviders } from "@/test/utils";
import { ParentProvider } from "../context";
import { absenceSchema } from "../schemas";
import { baseHandlers } from "../test/fixtures";
import ParentRequestsPage from "./ParentRequestsPage";

describe("absence form validation", () => {
  it("rejects an end date before the start date", () => {
    const result = absenceSchema.safeParse({ student: "st-1", date_from: "2026-11-02", date_to: "2026-11-01", direction: "BOTH", reason: "Travel" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path.join(".") === "date_to");
      expect(issue?.message).toBe("End date must be on or after start date.");
    }
    expect(absenceSchema.safeParse({ student: "st-1", date_from: "2026-11-01", date_to: "2026-11-01", direction: "PICKUP", reason: "Unwell" }).success).toBe(true);
  });

  it("shows the validation message in the form and does not submit", async () => {
    let posted = false;
    server.use(
      ...baseHandlers,
      http.get("/api/parent/absence-requests/", () => HttpResponse.json([])),
      http.get("/api/parent/pickup-change-requests/", () => HttpResponse.json([])),
      http.post("/api/parent/absence-requests/", () => {
        posted = true;
        return HttpResponse.json({ detail: "should not be called" }, { status: 400 });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(
      <ParentProvider>
        <ParentRequestsPage />
      </ParentProvider>,
      { route: "/parent/more/requests?tab=absence&new=1" },
    );
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Report an absence")).toBeInTheDocument();
    expect(await screen.findByText(/Report absences at least 60 minutes/)).toBeInTheDocument();

    // Typing character by character into antd's DatePicker is slow in jsdom; a single change + Enter commits the date.
    for (const [label, value] of [
      ["From", "02 Nov 2026"],
      ["To", "01 Nov 2026"],
    ] as const) {
      const input = within(dialog).getByLabelText(label);
      fireEvent.change(input, { target: { value } });
      fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
    }
    await user.type(within(dialog).getByLabelText("Reason"), "Family travel");
    await user.click(within(dialog).getByRole("button", { name: "Submit absence" }));

    expect(await within(dialog).findByText("End date must be on or after start date.")).toBeInTheDocument();
    expect(posted).toBe(false);
  }, 15_000);
});
