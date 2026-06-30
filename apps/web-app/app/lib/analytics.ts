import posthog from "posthog-js";

import {
  type AnalyticsEvent,
  type AnalyticsEventMap,
  isAnalyticsEvent,
  sanitizeAnalyticsProps,
} from "./analytics-events.js";
import { POSTHOG_HOST, POSTHOG_KEY } from "./env.js";
import type { SessionUser } from "./session.js";

const isBrowser = typeof window !== "undefined";

let clientInitialized = false;
let captureEnabled = false;

export function buildPostHogInitOptions() {
  return {
    api_host: POSTHOG_HOST,
    disable_session_recording: true,
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    persistence: "localStorage" as const,
  };
}

export function initAnalytics(user: SessionUser) {
  if (!POSTHOG_KEY || !isBrowser || user.analyticsOptOut) {
    return;
  }
  if (clientInitialized) {
    return;
  }

  posthog.init(POSTHOG_KEY, buildPostHogInitOptions());
  posthog.stopSessionRecording();
  clientInitialized = true;
  captureEnabled = true;
}

export function setAnalyticsOptOut(optOut: boolean) {
  if (!POSTHOG_KEY || !isBrowser) {
    return;
  }

  if (optOut) {
    captureEnabled = false;
    if (clientInitialized) {
      posthog.opt_out_capturing();
      posthog.stopSessionRecording();
      posthog.reset();
    }
    return;
  }

  if (clientInitialized) {
    posthog.opt_in_capturing();
    posthog.stopSessionRecording();
    captureEnabled = true;
  }
}

export function track<E extends AnalyticsEvent>(event: E, props?: AnalyticsEventMap[E]) {
  if (!POSTHOG_KEY || !isBrowser || !clientInitialized || !captureEnabled) {
    return;
  }
  if (!isAnalyticsEvent(event)) {
    return;
  }

  const sanitized = sanitizeAnalyticsProps(event, props);
  if (!sanitized) {
    return;
  }

  try {
    posthog.capture(event, sanitized);
  } catch {
    // Product analytics are best-effort and must not affect user flows.
  }
}

/** Test-only reset so unit tests can re-run init lifecycle. */
export function resetAnalyticsStateForTests() {
  clientInitialized = false;
  captureEnabled = false;
}
