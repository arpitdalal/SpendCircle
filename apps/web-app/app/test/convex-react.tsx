/**
 * Entity-scoped Convex test doubles; import from `~/test/convex-react.js` (barrel).
 */

/**
 * Shared view-shape builders for route and component tests — one canonical default per
 * model (`Circle`, `Category`, `Member`, `Transaction`, detail, history event), typed
 * against `~/lib/data.js` so a contract change fails typecheck here. Each helper takes a
 * partial override so tests state only what differs (CLAUDE.md: one helper, not copy-pasted
 * fixtures tweaked per file). Ids default to stable slugs; pass overrides for the rest.
 */
export { makeCategoryView } from "./convex/categories.js";
export { makeCircleView } from "./convex/circles.js";
export type { ConvexState } from "./convex/core.js";
export { configureConvex, convexHelpersReactMock, convexReactMock } from "./convex/core.js";
export { makeHistoryEventView } from "./convex/history.js";
export { testId } from "./convex/ids.js";
export { makeMemberView } from "./convex/members.js";
export {
  renderCircleRoutes,
  renderInCircle,
  renderRoutes,
  renderWithRouter,
} from "./convex/render.js";
export { makeTransactionDetailView, makeTransactionView } from "./convex/transactions.js";
