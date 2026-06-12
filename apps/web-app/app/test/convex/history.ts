import { api } from "@spend-circle/convex";
import { getFunctionName } from "convex/server";
import type {
  CategoryHistoryEvent,
  PaginationStatus,
  TransactionHistoryEvent,
} from "~/lib/data.js";
import type { EntityDouble } from "./contract.js";
import { testId } from "./ids.js";

export interface HistoryState {
  /** `listTransactionHistory` page (paginated, TXN-4) — the detail surface's history;
   * defaults to empty. */
  transactionHistory?: TransactionHistoryEvent[];
  historyStatus?: PaginationStatus;
  /** The paginated history `loadMore`; assert against it for the history "Load more". */
  historyLoadMore?: () => void;
  /** `listCategoryHistory` page (paginated, CAT-2) — the Categories surface's
   * per-row history panel; defaults to empty. Shares `historyStatus` /
   * `historyLoadMore` with the Transaction History double — the two queries never
   * render in one surface, so one status knob serves both. */
  categoryHistory?: CategoryHistoryEvent[];
}

export function historyDouble<S extends HistoryState>(state: S): EntityDouble {
  const {
    transactionHistory = [],
    historyStatus = "Exhausted",
    historyLoadMore = () => {},
    categoryHistory = [],
  } = state;
  return {
    paginatedQueries: {
      [getFunctionName(api.transactions.listTransactionHistory)]: () => ({
        results: transactionHistory,
        status: historyStatus,
        loadMore: historyLoadMore,
      }),
      [getFunctionName(api.categories.listCategoryHistory)]: () => ({
        results: categoryHistory,
        status: historyStatus,
        loadMore: historyLoadMore,
      }),
    },
  };
}

/** One Transaction History event (TXN-4). Defaults to a `created` event with a frozen,
 * ID-free set of changes; pass overrides for the action, actor, instant, or changes. */
export function makeHistoryEventView(
  over: Partial<TransactionHistoryEvent> = {},
): TransactionHistoryEvent {
  return {
    id: testId<TransactionHistoryEvent["id"]>("h1"),
    action: "created",
    createdAt: Date.UTC(2026, 4, 15, 9, 30),
    actor: { displayName: "You", image: undefined },
    changes: [
      { field: "title", to: "Weekly shop" },
      { field: "amount", toMoney: { minorUnits: 1250, currency: "USD" } },
    ],
    ...over,
  };
}
