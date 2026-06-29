import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FORBIDDEN_ANALYTICS_PROP_KEYS, sanitizeAnalyticsProps } from "./analytics-events.js";

const posthogSdk = vi.hoisted(() => ({
  init: vi.fn(),
  capture: vi.fn(),
  opt_out_capturing: vi.fn(),
  opt_in_capturing: vi.fn(),
  stopSessionRecording: vi.fn(),
}));

vi.mock("posthog-js", () => ({
  default: posthogSdk,
}));

const env = vi.hoisted(() => ({
  POSTHOG_KEY: undefined as string | undefined,
  POSTHOG_HOST: "https://us.i.posthog.com",
}));

vi.mock("./env.js", () => env);

import {
  buildPostHogInitOptions,
  initAnalytics,
  resetAnalyticsStateForTests,
  setAnalyticsOptOut,
  track,
} from "./analytics.js";

const readyUser = {
  id: "user-1",
  email: "ada@example.com",
  displayName: "Ada",
  onboardingComplete: true,
  analyticsOptOut: false,
};

afterEach(() => {
  vi.clearAllMocks();
  env.POSTHOG_KEY = undefined;
  resetAnalyticsStateForTests();
});

describe("buildPostHogInitOptions", () => {
  it("disables session recording and page autocapture", () => {
    expect(buildPostHogInitOptions()).toEqual({
      api_host: "https://us.i.posthog.com",
      disable_session_recording: true,
      autocapture: false,
      capture_pageview: false,
      capture_pageleave: false,
      persistence: "localStorage",
    });
  });
});

describe("initAnalytics", () => {
  it("no-ops when the PostHog key is missing", () => {
    env.POSTHOG_KEY = undefined;
    initAnalytics(readyUser);
    expect(posthogSdk.init).not.toHaveBeenCalled();
  });

  it("does not initialize when analyticsOptOut is true", () => {
    env.POSTHOG_KEY = "phc_test";
    initAnalytics({ ...readyUser, analyticsOptOut: true });
    expect(posthogSdk.init).not.toHaveBeenCalled();
  });

  it("initializes once with session recording disabled", () => {
    env.POSTHOG_KEY = "phc_test";
    initAnalytics(readyUser);
    initAnalytics(readyUser);

    expect(posthogSdk.init).toHaveBeenCalledOnce();
    expect(posthogSdk.init).toHaveBeenCalledWith("phc_test", buildPostHogInitOptions());
    expect(posthogSdk.stopSessionRecording).toHaveBeenCalled();
  });
});

describe("setAnalyticsOptOut", () => {
  it("opts out and stops capture after init", () => {
    env.POSTHOG_KEY = "phc_test";
    initAnalytics(readyUser);

    setAnalyticsOptOut(true);
    track("feedback_submitted", { type: "bug" });

    expect(posthogSdk.opt_out_capturing).toHaveBeenCalled();
    expect(posthogSdk.stopSessionRecording).toHaveBeenCalled();
    expect(posthogSdk.capture).not.toHaveBeenCalled();
  });

  it("opts back in without requiring a reload", () => {
    env.POSTHOG_KEY = "phc_test";
    initAnalytics(readyUser);
    setAnalyticsOptOut(true);

    setAnalyticsOptOut(false);
    track("feedback_submitted", { type: "feature" });

    expect(posthogSdk.opt_in_capturing).toHaveBeenCalled();
    expect(posthogSdk.capture).toHaveBeenCalledWith("feedback_submitted", { type: "feature" });
  });
});

describe("track", () => {
  it("no-ops before init", () => {
    env.POSTHOG_KEY = "phc_test";
    track("circle_created", { currency: "USD" });
    expect(posthogSdk.capture).not.toHaveBeenCalled();
  });

  it("drops unknown events", () => {
    env.POSTHOG_KEY = "phc_test";
    initAnalytics(readyUser);
    track("not_a_real_event" as "circle_created", { currency: "USD" });
    expect(posthogSdk.capture).not.toHaveBeenCalled();
  });

  it("strips unknown prop keys but still captures allowed props", () => {
    env.POSTHOG_KEY = "phc_test";
    initAnalytics(readyUser);
    track("circle_created", { currency: "USD", title: "secret" } as { currency: string });
    expect(posthogSdk.capture).toHaveBeenCalledWith("circle_created", { currency: "USD" });
  });

  it("never forwards forbidden keys", () => {
    env.POSTHOG_KEY = "phc_test";
    initAnalytics(readyUser);

    for (const forbidden of FORBIDDEN_ANALYTICS_PROP_KEYS) {
      const props = sanitizeAnalyticsProps("transaction_search_submitted", {
        type: "all",
        status: "all",
        hasQuery: true,
        hasDateRange: false,
        hasAmountRange: false,
        categoryCount: 1,
        recordedByCount: 0,
        paidByCount: 0,
        [forbidden]: "leak",
      } as never);
      expect(props).toEqual({
        type: "all",
        status: "all",
        hasQuery: true,
        hasDateRange: false,
        hasAmountRange: false,
        categoryCount: 1,
        recordedByCount: 0,
        paidByCount: 0,
      });
    }

    track("transaction_search_submitted", {
      type: "all",
      status: "all",
      hasQuery: true,
      hasDateRange: false,
      hasAmountRange: false,
      categoryCount: 1,
      recordedByCount: 0,
      paidByCount: 0,
      query: "rent",
    } as never);
    expect(posthogSdk.capture).toHaveBeenLastCalledWith("transaction_search_submitted", {
      type: "all",
      status: "all",
      hasQuery: true,
      hasDateRange: false,
      hasAmountRange: false,
      categoryCount: 1,
      recordedByCount: 0,
      paidByCount: 0,
    });
  });

  it("captures whitelisted circle_created props", () => {
    env.POSTHOG_KEY = "phc_test";
    initAnalytics(readyUser);
    track("circle_created", { currency: "EUR" });
    expect(posthogSdk.capture).toHaveBeenCalledWith("circle_created", { currency: "EUR" });
  });
});

describe("analytics independence", () => {
  it("never reads analyticsOptOut in sentry wiring", () => {
    const sentrySource = readFileSync(join(import.meta.dirname, "sentry.ts"), "utf8");
    const reportErrorSource = readFileSync(join(import.meta.dirname, "report-error.ts"), "utf8");

    expect(sentrySource).not.toMatch(/analyticsOptOut/);
    expect(reportErrorSource).not.toMatch(/analyticsOptOut/);
    expect(sentrySource).not.toMatch(/posthog/i);
    expect(reportErrorSource).not.toMatch(/posthog/i);
  });
});
