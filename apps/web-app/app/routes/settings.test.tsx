import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SnackbarProvider } from "~/lib/snackbar.js";
import { configureConvex, convexReactMock, makeCurrentUserView } from "~/test/convex-react.js";

vi.mock("convex/react", async () => (await import("~/test/convex-react.js")).convexReactMock);

import Settings from "./settings.js";

function renderSettings() {
  return render(
    <SnackbarProvider>
      <MemoryRouter>
        <Settings />
      </MemoryRouter>
    </SnackbarProvider>,
  );
}

beforeEach(() => {
  convexReactMock.useConvexAuth.mockReturnValue({ isAuthenticated: true, isLoading: false });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("Settings profile form", () => {
  it("initializes display name when the session resolves after loading", async () => {
    configureConvex({ currentUser: undefined });
    const { rerender } = renderSettings();

    expect(screen.queryByLabelText("Display name")).not.toBeInTheDocument();

    configureConvex({
      currentUser: makeCurrentUserView({ displayName: "Ada Lovelace" }),
    });
    rerender(
      <SnackbarProvider>
        <MemoryRouter>
          <Settings />
        </MemoryRouter>
      </SnackbarProvider>,
    );

    expect(await screen.findByLabelText("Display name")).toHaveValue("Ada Lovelace");
  });

  it("blocks save when the display name is empty or whitespace-only", async () => {
    configureConvex({
      currentUser: makeCurrentUserView({ displayName: "Ada Lovelace" }),
      updateProfile: vi.fn(),
    });
    const user = userEvent.setup();
    renderSettings();

    const input = await screen.findByLabelText("Display name");
    const save = screen.getByRole("button", { name: "Save profile" });

    await user.clear(input);
    expect(save).toBeDisabled();

    await user.type(input, "   ");
    expect(save).toBeDisabled();
  });

  it("validates on submit and does not call updateProfile for an empty name", async () => {
    const updateProfile = vi.fn();
    configureConvex({
      currentUser: makeCurrentUserView({ displayName: "Ada Lovelace" }),
      updateProfile,
    });
    const user = userEvent.setup();
    renderSettings();

    const input = await screen.findByLabelText("Display name");
    await user.clear(input);

    const form = input.closest("form");
    if (!form) throw new Error("profile form missing");
    fireEvent.submit(form);

    expect(screen.getByText("Name is required")).toBeInTheDocument();
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it("saves a valid display name and shows confirmation", async () => {
    const updateProfile = vi.fn().mockResolvedValue(undefined);
    configureConvex({
      currentUser: makeCurrentUserView({ displayName: "Ada Lovelace" }),
      updateProfile,
    });
    const user = userEvent.setup();
    renderSettings();

    const input = await screen.findByLabelText("Display name");
    await user.clear(input);
    await user.type(input, "  Bob Builder  ");
    await user.click(screen.getByRole("button", { name: "Save profile" }));

    await waitFor(() => {
      expect(updateProfile).toHaveBeenCalledWith({ displayName: "Bob Builder" });
    });
    expect(screen.getByText("Profile updated.")).toBeInTheDocument();
  });
});
