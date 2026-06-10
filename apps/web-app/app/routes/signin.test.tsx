import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithRouter } from "~/test/convex-react.js";

const auth = vi.hoisted(() => ({
  social: vi.fn(),
}));

vi.mock("@convex-dev/better-auth/client/plugins", () => ({
  convexClient: vi.fn(),
  crossDomainClient: vi.fn(),
}));

vi.mock("better-auth/react", () => ({
  createAuthClient: vi.fn(() => ({
    signIn: {
      social: auth.social,
    },
  })),
}));

import SignIn from "./signin.js";

afterEach(() => {
  vi.clearAllMocks();
});

describe("SignIn", () => {
  it("shows loading feedback while Google sign-in starts", async () => {
    const user = userEvent.setup();
    let resolveSignIn = () => {};
    auth.social.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveSignIn = resolve;
      }),
    );

    renderWithRouter(<SignIn />);

    const button = screen.getByRole("button", { name: "Continue with Google" });
    await user.click(button);

    expect(auth.social).toHaveBeenCalledWith({
      provider: "google",
      callbackURL: "/",
    });
    expect(screen.getByRole("button", { name: "Signing in..." })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Signing in..." })).toHaveAttribute(
      "aria-busy",
      "true",
    );
    expect(
      screen.getByRole("button", { name: "Signing in..." }).querySelector(".animate-spin"),
    ).toBeInTheDocument();

    resolveSignIn();
  });

  it("prevents duplicate Google sign-in requests while pending", async () => {
    const user = userEvent.setup();
    auth.social.mockReturnValue(new Promise<void>(() => {}));

    renderWithRouter(<SignIn />);

    await user.dblClick(screen.getByRole("button", { name: "Continue with Google" }));

    expect(auth.social).toHaveBeenCalledOnce();
  });

  it("re-enables sign-in and shows an error if OAuth startup throws", async () => {
    const user = userEvent.setup();
    auth.social.mockRejectedValue(new Error("network"));

    renderWithRouter(<SignIn />);

    await user.click(screen.getByRole("button", { name: "Continue with Google" }));

    expect(await screen.findByText("Couldn't start Google sign-in. Try again.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeEnabled();
  });

  it("re-enables sign-in and shows an error if OAuth startup returns an auth error", async () => {
    const user = userEvent.setup();
    auth.social.mockResolvedValue({ data: null, error: { message: "Invalid origin" } });

    renderWithRouter(<SignIn />);

    await user.click(screen.getByRole("button", { name: "Continue with Google" }));

    expect(await screen.findByText("Couldn't start Google sign-in. Try again.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeEnabled();
  });
});
