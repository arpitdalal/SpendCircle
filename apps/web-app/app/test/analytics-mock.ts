import { vi } from "vitest";

export const initAnalytics = vi.fn();
export const setAnalyticsOptOut = vi.fn();
export const track = vi.fn();
export const resetAnalyticsStateForTests = vi.fn();

export const analyticsModuleMock = {
  initAnalytics,
  setAnalyticsOptOut,
  track,
  resetAnalyticsStateForTests,
};

/** Alias for route tests asserting capture calls. */
export const analyticsMock = analyticsModuleMock;
