import type { Category, Circle } from "./data.js";

/**
 * Mock fixture data for E2E renders without a live backend (ADR 0006). These are
 * typed against the derived {@link Circle} contract, so a field change to
 * `toCircleView` (packages/convex/convex/circles.ts) fails typecheck here rather
 * than letting the mock path silently drift from the real path at runtime. The
 * synthetic ids are cast to the `Id<"circles">` brand — they never reach Convex.
 */

export const MOCK_CIRCLES: Circle[] = [
  {
    id: "mock-personal" as Circle["id"],
    ref: "personal-mock-personal",
    name: "Personal",
    kind: "personal",
    currency: "USD",
    color: "blue",
    mark: "P",
    status: "active",
    currencyLocked: false,
  },
];

/**
 * Mock Categories spanning both types, typed against the derived {@link Category}
 * contract so a shape change to `toCategoryView` fails typecheck here (ADR 0003).
 * `useCategories` filters these by the requested type.
 */
export const MOCK_CATEGORIES: Category[] = [
  {
    id: "mock-cat-groceries" as Category["id"],
    name: "Groceries",
    type: "expense",
    color: "green",
    status: "active",
    creator: { displayName: "You", image: undefined },
  },
  {
    id: "mock-cat-rent" as Category["id"],
    name: "Rent",
    type: "expense",
    color: "amber",
    status: "active",
    creator: { displayName: "You", image: undefined },
  },
  {
    id: "mock-cat-salary" as Category["id"],
    name: "Salary",
    type: "income",
    color: "teal",
    status: "active",
    creator: { displayName: "You", image: undefined },
  },
];

export function mockCircle(id: string): Circle {
  return {
    id: id as Circle["id"],
    ref: `mock-circle-${id}`,
    name: "Mock Circle",
    kind: "regular",
    currency: "USD",
    color: "blue",
    mark: "M",
    status: "active",
    currencyLocked: false,
  };
}
