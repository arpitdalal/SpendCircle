import { api } from "@spend-circle/convex";
import type { TransactionType } from "@spend-circle/domain";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { MOCKS } from "./env.js";
import { MOCK_CATEGORIES, MOCK_CIRCLES, MOCK_MEMBERS, MOCK_TRANSACTIONS } from "./fixtures.js";

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
 * A Circle's Categories of one type — active only by default, or active + archived
 * when `includeArchived` is set (each carries its `status`, so the caller can tell
 * them apart). `undefined` while loading; `null` when the Circle is inaccessible
 * (anti-enumeration — ADR 0016). In mock mode it filters fixtures and skips the
 * backend so E2E renders without a live deployment (ADR 0006); in real mode it is
 * the reactive Convex query.
 */
export function useCategories(
  circleId: Circle["id"],
  type: TransactionType,
  options?: { includeArchived?: boolean },
) {
  const includeArchived = options?.includeArchived ?? false;
  const queried = useQuery(
    api.categories.listCategories,
    MOCKS ? "skip" : { circleId, type, includeArchived },
  );
  return MOCKS
    ? MOCK_CATEGORIES.filter(
        (category) => category.type === type && (includeArchived || category.status === "active"),
      )
    : queried;
}

/**
 * The Create-Category mutation, exposed as the function the form awaits. Kept
 * behind this seam (rather than `useMutation` in the route) so the route imports
 * no Convex internals.
 */
export function useCreateCategory() {
  return useMutation(api.categories.createCategory);
}

/**
 * The single Member view contract, derived from `listMembers` so it cannot drift
 * from `toMemberView` in `packages/convex/convex/members.ts` (ADR 0003). The query
 * returns `MemberView[] | null` (null ≡ inaccessible Circle — ADR 0016); this is
 * one element of that array.
 */
export type Member = NonNullable<FunctionReturnType<typeof api.members.listMembers>>[number];

/**
 * A Circle's active Members, Owner first. `undefined` while loading; `null` when
 * the Circle is inaccessible (ADR 0016). Feeds the Transaction form's Paid By
 * selector; MEM-1 layers the full Member List UI on the same query. Mock mode
 * returns fixtures and skips the backend (ADR 0006).
 */
export function useMembers(circleId: Circle["id"]): Member[] | null | undefined {
  const queried = useQuery(api.members.listMembers, MOCKS ? "skip" : { circleId });
  return MOCKS ? MOCK_MEMBERS : queried;
}

/**
 * The single Transaction view contract, derived from `listTransactions` so it
 * cannot drift from `toTransactionView` in `packages/convex/convex/transactions.ts`
 * (ADR 0003). The query returns a paginated result; this is one element of its
 * `page`.
 */
export type Transaction = FunctionReturnType<
  typeof api.transactions.listTransactions
>["page"][number];

/** How many Transactions to fetch per page (initial load and each "load more"). */
export const TRANSACTIONS_PAGE_SIZE = 25;

/** Convex's paginated-query lifecycle status, re-exported so the route needn't import Convex. */
export type PaginationStatus = "LoadingFirstPage" | "CanLoadMore" | "LoadingMore" | "Exhausted";

export interface PaginatedTransactions {
  transactions: Transaction[];
  status: PaginationStatus;
  /** Loads the next page; a no-op unless `status` is "CanLoadMore". */
  loadMore: () => void;
}

/**
 * A Circle's active Transactions, most recent first, paginated at the source so
 * the client never holds an unbounded set — it loads one page and grows on demand
 * (ADR 0006 for the mock fork). TXN-1 uses this to confirm a create landed; the
 * Ledger/Dashboard slices (RPT-*) build their surfaces on the same paginated read.
 */
export function useTransactions(circleId: Circle["id"]): PaginatedTransactions {
  const paginated = usePaginatedQuery(
    api.transactions.listTransactions,
    MOCKS ? "skip" : { circleId },
    { initialNumItems: TRANSACTIONS_PAGE_SIZE },
  );
  if (MOCKS) {
    return {
      transactions: MOCK_TRANSACTIONS,
      status: "Exhausted",
      loadMore: () => {},
    };
  }
  return {
    transactions: paginated.results,
    status: paginated.status,
    loadMore: () => paginated.loadMore(TRANSACTIONS_PAGE_SIZE),
  };
}

/**
 * The Create-Transaction mutation, exposed as the function the form awaits. Kept
 * behind this seam (rather than `useMutation` in the route) so the route imports
 * no Convex internals.
 */
export function useCreateTransaction() {
  return useMutation(api.transactions.createTransaction);
}
