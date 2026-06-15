import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccountMenu } from "~/components/account-menu.js";
import { renderRoutes } from "~/test/convex-react.js";

const signOutMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock("~/lib/auth-client.js", () => ({
  signOut: signOutMock,
}));

afterEach(() => {
  vi.clearAllMocks();
});

function openAccountMenu() {
  const trigger = screen.getByRole("button", { name: "Account menu" });
  fireEvent.mouseDown(trigger);
}

describe("AccountMenu", () => {
  const user = {
    id: "u1",
    email: "alex@example.com",
    displayName: "Alex Tester",
    image: undefined,
  };

  it("opens the menu and navigates to Settings", async () => {
    const u = userEvent.setup();
    const view = renderRoutes(
      <>
        <Route path="/" element={<AccountMenu user={user} showSignOut />} />
        <Route path="/settings" element={<div>settings-screen</div>} />
      </>,
      { initialEntries: ["/"] },
    );
    openAccountMenu();
    await u.click(await screen.findByRole("menuitem", { name: "Settings" }));
    expect(view.location()).toBe("/settings");
    expect(await screen.findByText("settings-screen")).toBeInTheDocument();
  });

  it("shows Sign out and invokes signOut when chosen", async () => {
    const u = userEvent.setup();
    renderRoutes(<Route path="/" element={<AccountMenu user={user} showSignOut />} />, {
      initialEntries: ["/"],
    });
    openAccountMenu();
    await u.click(await screen.findByRole("menuitem", { name: "Sign out" }));
    expect(signOutMock).toHaveBeenCalledTimes(1);
  });

  it("omits Sign out when showSignOut is false", async () => {
    renderRoutes(<Route path="/" element={<AccountMenu user={user} showSignOut={false} />} />, {
      initialEntries: ["/"],
    });
    openAccountMenu();
    expect(screen.queryByRole("menuitem", { name: "Sign out" })).not.toBeInTheDocument();
  });
});
