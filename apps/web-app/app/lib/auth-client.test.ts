import { afterEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  social: vi.fn(),
  signOut: vi.fn(),
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
    signOut: auth.signOut,
  })),
}));

import { signInWithGoogle } from "./auth-client.js";

afterEach(() => {
  vi.clearAllMocks();
});

describe("signInWithGoogle", () => {
  it("starts Google sign-in with the callback URL", async () => {
    auth.social.mockResolvedValue({ data: { redirect: true }, error: null });

    await signInWithGoogle("/after-auth");

    expect(auth.social).toHaveBeenCalledWith({
      provider: "google",
      callbackURL: "/after-auth",
    });
  });

  it("throws if Better Auth resolves with an error object", async () => {
    const error = { message: "Invalid origin" };
    auth.social.mockResolvedValue({ data: null, error });

    await expect(signInWithGoogle("/")).rejects.toBe(error);
  });
});
