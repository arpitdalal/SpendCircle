import { api } from "@spend-circle/convex";
import { getFunctionName } from "convex/server";
import type { Mock } from "vitest";
import type { Circle } from "~/lib/data.js";
import type { EntityDouble } from "./contract.js";
import { testId } from "./ids.js";

export interface CirclesState {
  /** `listMyCircles` — `undefined` ≡ loading. */
  circles?: Circle[] | null;
  /** The `createCircle` mutation spy the test owns (CS-0). Returns the new Circle's id,
   * so a test configures `vi.fn().mockResolvedValue(testId("c-new"))` to drive the
   * create flow's navigation to the canonical ref. */
  createCircle?: Mock;
  completeCircleSetup?: Mock;
}

export function circlesDouble<S extends CirclesState>(state: S): EntityDouble {
  const { circles, createCircle, completeCircleSetup } = state;
  return {
    queries: {
      [getFunctionName(api.circles.listMyCircles)]: () => circles,
    },
    mutations: {
      [getFunctionName(api.circles.createCircle)]: createCircle,
      [getFunctionName(api.circles.completeCircleSetup)]: completeCircleSetup,
    },
  };
}

/**
 * Shared view-shape builders for the Transaction surfaces (the ledger, the form, the
 * edit route). One definition each — typed against the derived `~/lib/data.js`
 * contracts so a `to*View` change fails typecheck here — driven by a partial override
 * so each test states only what differs (CLAUDE.md: one helper, not copy-pasted
 * fixtures tweaked per file). Ids default to stable slugs; pass overrides for the rest.
 */
export function makeCircleView(over: Partial<Circle> = {}): Circle {
  return {
    id: testId<Circle["id"]>("c1"),
    ref: "trip-c1",
    name: "Trip",
    kind: "regular",
    currency: "USD",
    color: "blue",
    mark: "T",
    status: "active",
    setupAnswers: undefined,
    currencyLocked: false,
    ...over,
  };
}
