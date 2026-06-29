import { MUTATION_ERRORS, mutationErrorData } from "@spend-circle/domain";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConvexError } from "convex/values";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SnackbarProvider } from "~/lib/snackbar.js";
import { analyticsMock } from "~/test/analytics-mock.js";
import { configureConvex, convexReactMock, makeCurrentUserView } from "~/test/convex-react.js";

vi.mock("convex/react", async () => (await import("~/test/convex-react.js")).convexReactMock);
vi.mock(
  "~/lib/analytics.js",
  async () => (await import("~/test/analytics-mock.js")).analyticsModuleMock,
);

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

describe("Settings privacy opt-out", () => {
  it("reflects analyticsOptOut false as switch off", async () => {
    configureConvex({
      currentUser: makeCurrentUserView({ analyticsOptOut: false }),
      setAnalyticsOptOut: vi.fn(),
    });
    renderSettings();

    expect(
      await screen.findByRole("switch", { name: /opt out of product analytics/i }),
    ).toHaveAttribute("aria-checked", "false");
  });

  it("reflects analyticsOptOut true as switch on", async () => {
    configureConvex({
      currentUser: makeCurrentUserView({ analyticsOptOut: true }),
      setAnalyticsOptOut: vi.fn(),
    });
    renderSettings();

    expect(
      await screen.findByRole("switch", { name: /opt out of product analytics/i }),
    ).toHaveAttribute("aria-checked", "true");
  });

  it("calls setAnalyticsOptOut and shows confirmation when toggled", async () => {
    const setAnalyticsOptOut = vi.fn().mockResolvedValue(undefined);
    configureConvex({
      currentUser: makeCurrentUserView({ analyticsOptOut: false }),
      setAnalyticsOptOut,
    });
    const user = userEvent.setup();
    renderSettings();

    await user.click(await screen.findByRole("switch", { name: /opt out of product analytics/i }));

    await waitFor(() => {
      expect(setAnalyticsOptOut).toHaveBeenCalledWith({ optOut: true });
    });
    expect(screen.getByText("Privacy preference updated.")).toBeInTheDocument();
  });

  it("shows an error when setAnalyticsOptOut fails", async () => {
    const setAnalyticsOptOut = vi.fn().mockRejectedValue(new Error("network"));
    configureConvex({
      currentUser: makeCurrentUserView({ analyticsOptOut: false }),
      setAnalyticsOptOut,
    });
    const user = userEvent.setup();
    renderSettings();

    await user.click(await screen.findByRole("switch", { name: /opt out of product analytics/i }));

    expect(
      await screen.findByText("Couldn't update your privacy preference. Please try again."),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("switch", { name: /opt out of product analytics/i }),
    ).toHaveAttribute("aria-checked", "false");
  });
});

describe("Settings app version", () => {
  it("renders the build-injected app version", async () => {
    configureConvex({
      currentUser: makeCurrentUserView(),
      setAnalyticsOptOut: vi.fn(),
    });
    renderSettings();

    expect(await screen.findByText(`App version ${__APP_VERSION__}`)).toBeInTheDocument();
  });
});

describe("Settings feedback form", () => {
  it("renders support context with user email, name, and app version", async () => {
    configureConvex({
      currentUser: makeCurrentUserView({
        email: "ada@example.com",
        displayName: "Ada Lovelace",
      }),
      submitFeedback: vi.fn(),
    });
    renderSettings();

    expect(await screen.findByText(/Ada Lovelace/)).toBeInTheDocument();
    expect(screen.getByText(/ada@example.com/)).toBeInTheDocument();
    expect(screen.getAllByText(__APP_VERSION__, { exact: false }).length).toBeGreaterThan(0);
    expect(screen.getByText(/Circle context:/)).toBeInTheDocument();
  });

  it("blocks submit when the message is empty", async () => {
    configureConvex({
      currentUser: makeCurrentUserView(),
      submitFeedback: vi.fn(),
    });
    renderSettings();

    expect(await screen.findByRole("button", { name: "Send feedback" })).toBeDisabled();
  });

  it("submits trimmed feedback, disables while pending, and clears on success", async () => {
    let resolveSubmit: (() => void) | undefined;
    const submitFeedback = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSubmit = resolve;
        }),
    );
    configureConvex({
      currentUser: makeCurrentUserView(),
      submitFeedback,
    });
    const user = userEvent.setup();
    renderSettings();

    const message = await screen.findByLabelText("Message");
    await user.type(message, "  Please add dark mode  ");
    const submit = screen.getByRole("button", { name: "Send feedback" });
    await user.click(submit);

    expect(submit).toBeDisabled();
    expect(submitFeedback).toHaveBeenCalledWith({
      type: "bug",
      message: "Please add dark mode",
      appVersion: __APP_VERSION__,
    });

    resolveSubmit?.();
    await waitFor(() => {
      expect(screen.getByText("Thanks — your feedback was sent.")).toBeInTheDocument();
    });
    expect(analyticsMock.track).toHaveBeenCalledWith("feedback_submitted", { type: "bug" });
    expect(message).toHaveValue("");
    expect(screen.getByRole("button", { name: "Send feedback" })).toBeDisabled();
  });

  it("does not call submitFeedback when validation fails on submit", async () => {
    const submitFeedback = vi.fn();
    configureConvex({
      currentUser: makeCurrentUserView(),
      submitFeedback,
    });
    renderSettings();

    const message = await screen.findByLabelText("Message");
    const form = message.closest("form");
    if (!form) throw new Error("feedback form missing");
    fireEvent.submit(form);

    expect(screen.getByText("Message is required")).toBeInTheDocument();
    expect(submitFeedback).not.toHaveBeenCalled();
  });

  it("shows the coded daily-cap user message", async () => {
    const submitFeedback = vi
      .fn()
      .mockRejectedValue(
        new ConvexError(mutationErrorData(MUTATION_ERRORS.feedbackDailyCapReached)),
      );
    configureConvex({
      currentUser: makeCurrentUserView(),
      submitFeedback,
    });
    const user = userEvent.setup();
    renderSettings();

    await user.type(await screen.findByLabelText("Message"), "Another one");
    await user.click(screen.getByRole("button", { name: "Send feedback" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You've sent too much feedback today. Try again tomorrow.",
    );
  });

  it("shows a fallback alert for unexpected failures", async () => {
    const submitFeedback = vi.fn().mockRejectedValue(new Error("network"));
    configureConvex({
      currentUser: makeCurrentUserView(),
      submitFeedback,
    });
    const user = userEvent.setup();
    renderSettings();

    await user.type(await screen.findByLabelText("Message"), "Broken");
    await user.click(screen.getByRole("button", { name: "Send feedback" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn't send your feedback. Please try again.",
    );
  });

  it("does not import PostHog directly", async () => {
    const { readFileSync } = await import("node:fs");
    const { dirname, join } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const dir = dirname(fileURLToPath(import.meta.url));
    const moduleText = readFileSync(join(dir, "settings.tsx"), "utf8");
    expect(moduleText).not.toMatch(/from\s+["'][^"']*posthog/i);
    expect(moduleText).not.toMatch(/import\s*\(\s*["'][^"']*posthog/i);
    expect(moduleText).toMatch(/from\s+["']~\/lib\/analytics\.js["']/);
  });
});
