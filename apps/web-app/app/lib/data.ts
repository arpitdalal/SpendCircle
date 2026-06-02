import { api } from "@spend-circle/convex";
import type { TransactionType } from "@spend-circle/domain";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { MOCKS } from "./env.js";
import { MOCK_CATEGORIES, MOCK_CIRCLES } from "./fixtures.js";

/**
 * The single Circle view contract, derived from the Convex function's return
 * type so it cannot drift from the backend (ADR 0003). `toCircleView` in
 * `packages/convex/convex/circles.ts` is the one definition; both the real
 * `useQuery` path and the mock fixtures conform to this same type, so a field
 * change there surfaces here at typecheck time rather than as a runtime mismatch
 * between the two paths. `id` is an `Id<"circles">` branded string — the real
 * query already returns it; the mock fixtures cast their synthetic ids to match.
 */
export type Circle = NonNullable<FunctionReturnType<typeof api.circles.getCircle>>;

/**
 * The current User's Circles. In mock mode this returns fixture data and skips
 * the backend query so E2E renders without a live deployment (ADR 0006); in real
 * mode it is the reactive Convex query.
 */
export function useMyCircles(): Circle[] | undefined {
  const queried = useQuery(api.circles.listMyCircles, MOCKS ? "skip" : {});
  return MOCKS ? MOCK_CIRCLES : queried;
}

/**
 * The single Category view contract, derived from `listCategories` so it cannot
 * drift from `toCategoryView` in `packages/convex/convex/categories.ts` (ADR
 * 0003). The query returns `CategoryView[] | null` (null ≡ inaccessible Circle —
 * ADR 0016); this is one element of that array.
 */
export type Category = NonNullable<
  FunctionReturnType<typeof api.categories.listCategories>
>[number];

/**
 * A Circle's Categories of one type, active only. `undefined` while loading;
 * `null` when the Circle is inaccessible (anti-enumeration — ADR 0016). In mock
 * mode it filters fixtures and skips the backend so E2E renders without a live
 * deployment (ADR 0006); in real mode it is the reactive Convex query.
 */
export function useCategories(
  circleId: Circle["id"],
  type: TransactionType,
): Category[] | null | undefined {
  const queried = useQuery(api.categories.listCategories, MOCKS ? "skip" : { circleId, type });
  return MOCKS ? MOCK_CATEGORIES.filter((category) => category.type === type) : queried;
}

/**
 * The Create-Category mutation, exposed as the function the form awaits. Kept
 * behind this seam (rather than `useMutation` in the route) so the route imports
 * no Convex internals and render tests can mock the data layer alone.
 */
export function useCreateCategory() {
  return useMutation(api.categories.createCategory);
}
