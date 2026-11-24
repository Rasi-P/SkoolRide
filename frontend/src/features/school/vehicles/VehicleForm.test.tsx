import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/utils";
import { VehicleFormDrawer } from "./VehicleForm";

describe("VehicleFormDrawer", () => {
  it("shows validation errors and does not submit when required fields are missing", async () => {
    const onClose = vi.fn();
    renderWithProviders(<VehicleFormDrawer open vehicle={null} onClose={onClose} />, { withAuth: false });
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Add vehicle" }));
    expect(await screen.findByText("Registration number is required")).toBeInTheDocument();
    expect(screen.getByText("Capacity is required")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText("Registration number"), "KA9");
    await user.click(screen.getByRole("button", { name: "Add vehicle" }));
    expect(await screen.findByText("Registration number is required")).toBeInTheDocument();
  });
});
