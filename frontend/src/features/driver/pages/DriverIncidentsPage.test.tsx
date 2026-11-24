import { describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "@/test/server";
import { renderWithProviders } from "@/test/utils";
import { GpsProvider } from "../gps/GpsContext";
import { home, incidents } from "../__fixtures__/driver";
import DriverIncidentsPage from "./DriverIncidentsPage";

describe("DriverIncidentsPage", () => {
  it("lists my incidents with status and severity badges", async () => {
    server.use(http.get("/api/driver/incidents/", () => HttpResponse.json(incidents)), http.get("/api/driver/home/", () => HttpResponse.json(home)));
    renderWithProviders(
      <GpsProvider>
        <DriverIncidentsPage />
      </GpsProvider>,
      { route: "/driver/incidents" },
    );
    const row = await screen.findByRole("article", { name: "Emergency on R1" });
    expect(within(row).getByText("Open")).toBeInTheDocument();
    expect(within(row).getByText("Critical")).toBeInTheDocument();
    expect(within(row).getByText("EMERGENCY")).toBeInTheDocument();
  });

  it("validates the report form before posting", async () => {
    let posted = false;
    server.use(
      http.get("/api/driver/incidents/", () => HttpResponse.json([])),
      http.get("/api/driver/home/", () => HttpResponse.json(home)),
      http.post("/api/driver/incidents/", () => {
        posted = true;
        return HttpResponse.json(incidents[0], { status: 201 });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(
      <GpsProvider>
        <DriverIncidentsPage />
      </GpsProvider>,
      { route: "/driver/incidents?new=1" },
    );
    const form = await screen.findByRole("form", { name: "Report incident" });
    await user.click(within(form).getByRole("button", { name: "Send report" }));
    expect(await within(form).findByText("Choose a category")).toBeInTheDocument();
    expect(within(form).getByText("Give the incident a short title")).toBeInTheDocument();
    expect(within(form).getByText(/Describe what happened/)).toBeInTheDocument();
    expect(posted).toBe(false);
  });
});
