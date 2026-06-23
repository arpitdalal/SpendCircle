import type { TestConvex } from "convex-test";
import { vi } from "vitest";
import type schema from "../convex/schema.js";

type ConvexTestHandle = TestConvex<typeof schema>;

/** Runs a mutation (or other async work) then drains scheduler-backed jobs (ADR 0027). */
export async function mutateAndDrain<T>(t: ConvexTestHandle, run: () => Promise<T>) {
  vi.useFakeTimers();
  try {
    const result = await run();
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    return result;
  } finally {
    vi.useRealTimers();
  }
}

/** Drains pending scheduler jobs without wrapping a mutation. */
export async function drainScheduledFunctions(t: ConvexTestHandle) {
  vi.useFakeTimers();
  try {
    await t.finishAllScheduledFunctions(vi.runAllTimers);
  } finally {
    vi.useRealTimers();
  }
}
