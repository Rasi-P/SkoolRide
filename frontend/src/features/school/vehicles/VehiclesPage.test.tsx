import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test/utils";
import VehiclesPage from "./VehiclesPage";

describe("VehiclesPage", () => {
  it("lists vehicles and filters them with the search box", async () => {
    renderWithProviders(<VehiclesPage />, { route: "/school/vehicles" });
    expect(await screen.findByText("KA01AB1234")).toBeInTheDocument();
    expect(screen.getByText("KA01AB5678")).toBeInTheDocument();
    expect(screen.getByText("Ravi Kumar")).toBeInTheDocument();
    expect(screen.getByText("Maintenance")).toBeInTheDocument();

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Search registration, fleet no, make"), "5678");
    await waitFor(() => expect(screen.queryByText("KA01AB1234")).not.toBeInTheDocument(), { timeout: 3000 });
    expect(screen.getByText("KA01AB5678")).toBeInTheDocument();
  });
});
