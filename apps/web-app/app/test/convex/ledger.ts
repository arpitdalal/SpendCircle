import { api } from "@spend-circle/convex";
import { getFunctionName } from "convex/server";
import type {
  MonthlySummary,
  PaginationStatus,
  Transaction,
  TransactionFilterOptions,
} from "~/lib/data.js";
import type { EntityDouble } from "./contract.js";
import { resolveWith } from "./contract.js";

/** A zero Monthly Ledger summary — the default for tests that don't drive totals. */
export const EMPTY_MONTHLY_SUMMARY: MonthlySummary = {
  totals: { incomeMinor: 0, expenseMinor: 0, netMinor: 0 },
  currency: "USD",
};

export interface LedgerState {
  /** `getMonthlyLedger` summary (totals + currency); `undefined` ≡ loading, `null` ≡
   * inaccessible Circle. Defaults to a zero summary so the totals header renders. */
  monthlySummary?: MonthlySummary | null;
  ledgerFilterTransactions?: Transaction[];
  ledgerFilterStatus?: PaginationStatus;
  searchTransactions?: Transaction[];
  searchStatus?: PaginationStatus;
  /** `getLedgerFilterOptions` / `getTransactionSearchOptions` result; `undefined` ≡ loading,
   * `null` ≡ inaccessible. A function resolves per query args (e.g. by `type`) so a test can
   * model the type-scoped Category option set the panel narrows to as the draft type flips. */
  ledgerFilterOptions?:
    | TransactionFilterOptions
    | null
    | ((args: Record<string, unknown>) => TransactionFilterOptions | null | undefined);
  transactionSearchOptions?:
    | TransactionFilterOptions
    | null
    | ((args: Record<string, unknown>) => TransactionFilterOptions | null | undefined);
  /** Paginated `loadMore` for ledger filter / search doubles — same knob as the TXN
   * list's `loadMore` in merged test state. */
  loadMore?: () => void;
}

export function ledgerDouble(state: LedgerState): EntityDouble {
  const {
    monthlySummary = EMPTY_MONTHLY_SUMMARY,
    ledgerFilterTransactions = [],
    ledgerFilterStatus = "Exhausted",
    searchTransactions = [],
    searchStatus = "Exhausted",
    ledgerFilterOptions,
    transactionSearchOptions,
    loadMore = () => {},
  } = state;
  return {
    queries: {
      [getFunctionName(api.ledger.getMonthlyLedger)]: () => monthlySummary,
      [getFunctionName(api.search.getLedgerFilterOptions)]: (args) =>
        resolveWith(ledgerFilterOptions, args),
      [getFunctionName(api.search.getTransactionSearchOptions)]: (args) =>
        resolveWith(transactionSearchOptions, args),
    },
    paginatedQueries: {
      [getFunctionName(api.search.filterLedgerTransactions)]: () => ({
        results: ledgerFilterTransactions,
        status: ledgerFilterStatus,
        loadMore,
      }),
      [getFunctionName(api.search.searchTransactions)]: () => ({
        results: searchTransactions,
        status: searchStatus,
        loadMore,
      }),
    },
  };
}
