import { screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "@/test/server";
import { renderWithProviders } from "@/test/utils";
import TripsPage from "./TripsPage";

const empty = { count: 0, next: null, previous: null, results: [] };

describe("TripsPage", () => {
  it("shows the empty state when no trips exist for the period", async () => {
    server.use(
      http.get("/api/trips/trips/", () => HttpResponse.json(empty)),
      http.get("/api/routing/routes/", () => HttpResponse.json(empty)),
    );
    renderWithProviders(<TripsPage />, { route: "/school/trips" });
    expect(await screen.findByText("No trips scheduled")).toBeInTheDocument();
    expect(screen.getByText("Generate trips for a date from the route schedules, or create one manually.")).toBeInTheDocument();
    expect(screen.getByText("Trips & schedules")).toBeInTheDocument();
  });

  it("uses the history copy on the history view", async () => {
    server.use(
      http.get("/api/trips/trips/", () => HttpResponse.json(empty)),
      http.get("/api/routing/routes/", () => HttpResponse.json(empty)),
    );
    renderWithProviders(<TripsPage history />, { route: "/school/trips/history" });
    expect(await screen.findByText("No trips in this period")).toBeInTheDocument();
    expect(screen.getByText("Trip history")).toBeInTheDocument();
  });
});
