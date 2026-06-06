import { api } from "@spend-circle/convex";
import type { PlainMonth, TransactionType } from "@spend-circle/domain";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { MOCKS } from "./env.js";
import {
  MOCK_CATEGORIES,
  MOCK_CIRCLES,
  MOCK_DASHBOARD,
  MOCK_MEMBERS,
  MOCK_MONTHLY_SUMMARY,
  MOCK_TRANSACTION_HISTORY,
  MOCK_TRANSACTIONS,
} from "./fixtures.js";

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
 * The Create-Circle mutation (CS-0), exposed as the function the create form awaits.
 * Kept behind this seam (rather than `useMutation` in the route) so the route imports
 * no Convex internals — mirroring {@link useCreateCategory}. Returns the new Circle's
 * `Id<"circles">`, which the form turns into a canonical ref to navigate to (ADR 0016).
 */
export function useCreateCircle() {
  return useMutation(api.circles.createCircle);
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

/**
 * The single Transaction DETAIL view contract (TXN-4), derived from `getTransaction`
 * so it cannot drift from `toTransactionDetailView` in
 * `packages/convex/convex/transactions.ts` (ADR 0003). It is the full {@link Transaction}
 * view plus its Audit Metadata block. The query returns `TransactionDetailView | null`
 * (null ≡ inaccessible / missing / wrong-Circle — ADR 0016); this is the non-null shape.
 */
export type TransactionDetail = NonNullable<
  FunctionReturnType<typeof api.transactions.getTransaction>
>;

/**
 * One Transaction History event (TXN-4), derived from `listTransactionHistory` so it
 * cannot drift from `toHistoryEventView` (ADR 0003): the action, the acting Member's
 * display identity (or `null` for a system event), the event instant, and the frozen
 * display-safe `changes` (text `from`/`to`, typed `fromMoney`/`toMoney` — never a raw
 * id). It is one element of the query's paginated `page`.
 */
export type TransactionHistoryEvent = FunctionReturnType<
  typeof api.transactions.listTransactionHistory
>["page"][number];

/** One change line within a {@link TransactionHistoryEvent}. */
export type TransactionHistoryChange = TransactionHistoryEvent["changes"][number];

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

/** A Transaction's lifecycle status — `"active"` by default, `"archived"` for the
 * dedicated archived view (TXN-3). Re-derived from the view type so it can't drift. */
export type TransactionStatus = Transaction["status"];

/**
 * A Circle's Transactions of one lifecycle status, most recent first, paginated at
 * the source so the client never holds an unbounded set — it loads one page and grows
 * on demand (ADR 0006 for the mock fork). An optional `month` ("YYYY-MM") scopes the
 * page to one month at the source — the Monthly Ledger list (RPT-1); omit it for the
 * all-status read. TXN-1 uses the unscoped active form to confirm a create landed;
 * `status: "archived"` is the archived view the Restore affordance reads (TXN-3),
 * which the backend ranges off the same index. `status` defaults to `"active"` — the
 * normal surface that excludes archived Transactions.
 */
export function useTransactions(
  circleId: Circle["id"],
  month?: PlainMonth,
  options?: { status?: TransactionStatus },
): PaginatedTransactions {
  const status = options?.status ?? "active";
  const paginated = usePaginatedQuery(
    api.transactions.listTransactions,
    MOCKS ? "skip" : { circleId, status, ...(month ? { month } : {}) },
    { initialNumItems: TRANSACTIONS_PAGE_SIZE },
  );
  if (MOCKS) {
    return {
      // Archived has no offline fixtures; the active list powers the populated path.
      transactions: status === "active" ? MOCK_TRANSACTIONS : [],
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
 * The Monthly Ledger's per-month financial summary, derived from `getMonthlyLedger`
 * so it can't drift from the backend (ADR 0003): that month's Income / Expense / Net
 * in minor units plus the Circle Currency. `null` ≡ inaccessible Circle (ADR 0016);
 * `undefined` while loading.
 */
export type MonthlySummary = NonNullable<FunctionReturnType<typeof api.ledger.getMonthlyLedger>>;
export type MonthlyTotals = MonthlySummary["totals"];

/**
 * The Monthly Ledger surface for one Circle-month (RPT-1): the `summary` (totals +
 * Currency, computed server-side over the whole month) fused with the month-scoped,
 * paginated `transactions` list. They are two backend reads (a `usePaginatedQuery`
 * can't carry totals next to a page, and the totals must sum the entire month while
 * the list only resolves the visible page), recombined here into the one hook the
 * route consumes. Mock mode returns fixtures and skips both backend reads (ADR 0006).
 *
 * `status` selects the month's active list (default) or its archived list (TXN-3 — the
 * surface the Restore affordance reads). The `summary` totals are always the month's
 * ACTIVE Income/Expense/Net (archived Transactions never count — Dashboard contract),
 * independent of which list the toggle shows.
 */
export function useMonthlyLedger(
  circleId: Circle["id"],
  month: PlainMonth,
  options?: { status?: TransactionStatus },
) {
  const queried = useQuery(api.ledger.getMonthlyLedger, MOCKS ? "skip" : { circleId, month });
  const transactions = useTransactions(circleId, month, { status: options?.status ?? "active" });
  return {
    summary: MOCKS ? MOCK_MONTHLY_SUMMARY : queried,
    transactions,
  };
}

/**
 * The per-Circle Dashboard view contract, derived from `getDashboard` so it can't
 * drift from the backend (ADR 0003): the selected month's Income / Expense / Net in
 * minor units, the recent Transactions feed, the Circle Currency, and the resolved
 * month. `null` ≡ inaccessible Circle (ADR 0016); `undefined` while loading.
 */
export type Dashboard = NonNullable<FunctionReturnType<typeof api.dashboard.getDashboard>>;
export type DashboardTotals = Dashboard["totals"];

/**
 * The per-Circle Dashboard (RPT-3): current-month (or an explicit `month`) Income /
 * Expense / Net totals plus a recent-Transactions feed, optionally narrowed to one
 * Member via the Paid By filter (`paidByMemberId`). Totals and recent both reflect the
 * SAME active set the filter narrows, so they never disagree. `undefined` while
 * loading; `null` for an inaccessible Circle (the guard ejects before this renders).
 * Mock mode returns fixtures and skips the backend (ADR 0006).
 */
export function useDashboard(
  circleId: Circle["id"],
  options?: { month?: PlainMonth; paidByMemberId?: Member["id"] },
) {
  const queried = useQuery(
    api.dashboard.getDashboard,
    MOCKS
      ? "skip"
      : {
          circleId,
          ...(options?.month ? { month: options.month } : {}),
          ...(options?.paidByMemberId ? { paidByMemberId: options.paidByMemberId } : {}),
        },
  );
  return MOCKS ? MOCK_DASHBOARD : queried;
}

/**
 * The Members selectable in the Dashboard's Paid By filter: current Members plus
 * Removed Members who are Paid By on a matching active Transaction (RPT-3). Same
 * `Member` shape as `useMembers` (both derive from `toMemberView`), so the selector
 * renders them identically and a Removed option's `status` lets the UI label it.
 * `undefined` while loading; `null` for an inaccessible Circle. Mock mode returns
 * fixtures and skips the backend (ADR 0006).
 */
export function usePaidByFilterOptions(circleId: Circle["id"]): Member[] | null | undefined {
  const queried = useQuery(api.dashboard.getPaidByFilterOptions, MOCKS ? "skip" : { circleId });
  return MOCKS ? MOCK_MEMBERS : queried;
}

/**
 * The Create-Transaction mutation, exposed as the function the form awaits. Kept
 * behind this seam (rather than `useMutation` in the route) so the route imports
 * no Convex internals.
 */
export function useCreateTransaction() {
  return useMutation(api.transactions.createTransaction);
}

/**
 * The Edit-Transaction mutation (TXN-2), behind the same seam as create. The form
 * sends only the fields it manages; the server diffs against the stored Transaction,
 * records only what changed, and owns every invariant (Recorded By, type change,
 * archived-frozen — ADR 0015).
 */
export function useUpdateTransaction() {
  return useMutation(api.transactions.updateTransaction);
}

/**
 * The Archive-Transaction mutation (TXN-3), behind the same seam as create/edit. The
 * server enforces the permission (Recorded By creator or Owner — moderation, never a
 * field-edit backdoor) and that the Circle is writable; this hook just exposes the call
 * the ledger row awaits. Restoring is its mirror.
 */
export function useArchiveTransaction() {
  return useMutation(api.transactions.archiveTransaction);
}

/** The Restore-Transaction mutation (TXN-3): the mirror of {@link useArchiveTransaction}. */
export function useRestoreTransaction() {
  return useMutation(api.transactions.restoreTransaction);
}

/** How many Transaction History events to fetch per page (initial load and each
 * "load more"). History is unbounded-growth, so the detail surface pages it (README §4). */
export const HISTORY_PAGE_SIZE = 20;

export interface PaginatedHistory {
  events: TransactionHistoryEvent[];
  status: PaginationStatus;
  /** Loads the next page; a no-op unless `status` is "CanLoadMore". */
  loadMore: () => void;
}

/**
 * A Transaction's History, newest first, paginated at the source so the detail surface
 * never holds an unbounded audit — it loads one page and grows on demand (TXN-4; ADR
 * 0006 for the mock fork). The detail route already resolved the Transaction through
 * `getTransaction` before this renders, so an inaccessible Circle never reaches here; the
 * backend still returns an empty page for one (anti-enumeration parity with the ledger).
 * Mock mode returns fixtures and skips the backend so E2E/offline render without a live
 * deployment (ADR 0006).
 */
export function useTransactionHistory(
  circleId: Circle["id"],
  transactionId: TransactionDetail["id"],
): PaginatedHistory {
  const paginated = usePaginatedQuery(
    api.transactions.listTransactionHistory,
    MOCKS ? "skip" : { circleId, transactionId },
    { initialNumItems: HISTORY_PAGE_SIZE },
  );
  if (MOCKS) {
    return { events: MOCK_TRANSACTION_HISTORY, status: "Exhausted", loadMore: () => {} };
  }
  return {
    events: paginated.results,
    status: paginated.status,
    loadMore: () => paginated.loadMore(HISTORY_PAGE_SIZE),
  };
}
