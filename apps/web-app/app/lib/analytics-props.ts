import { currentMonth, type PlainMonth, plainMonthParts } from "@spend-circle/domain";

import type {
  AnalyticsEventMap,
  AnalyticsLifecycleStatus,
  AnalyticsTransactionType,
} from "./analytics-events.js";
import type {
  BaseTransactionFilters,
  LedgerFilters,
  SearchFilters,
} from "./transaction-filter-url.js";

function coarseBaseFilterProps(filters: BaseTransactionFilters) {
  return {
    type: filters.type as AnalyticsTransactionType,
    status: filters.status as AnalyticsLifecycleStatus,
    hasQuery: filters.q.trim().length > 0,
    categoryCount: filters.categories.length,
    recordedByCount: filters.recordedBy.length,
    paidByCount: filters.paidBy.length,
  };
}

/** Coarse month delta between the selected ledger month and the current month. */
export function ledgerMonthOffset(month: PlainMonth, now = new Date()) {
  const selected = plainMonthParts(month);
  const current = plainMonthParts(currentMonth(now));
  return (selected.year - current.year) * 12 + (selected.month - current.month);
}

export function ledgerFilterAnalyticsProps(
  filters: LedgerFilters,
): AnalyticsEventMap["ledger_filter_applied"] {
  return {
    ...coarseBaseFilterProps(filters),
    monthOffset: ledgerMonthOffset(filters.month),
  };
}

export function searchFilterAnalyticsProps(
  filters: SearchFilters,
): AnalyticsEventMap["transaction_search_submitted"] {
  return {
    ...coarseBaseFilterProps(filters),
    hasDateRange: Boolean(filters.from || filters.to),
    hasAmountRange: Boolean(filters.min || filters.max),
  };
}

export function exportAnalyticsProps(
  filters: SearchFilters,
  result: AnalyticsEventMap["export_performed"]["result"],
): AnalyticsEventMap["export_performed"] {
  return {
    status: filters.status as AnalyticsLifecycleStatus,
    result,
    hasQuery: filters.q.trim().length > 0,
    hasDateRange: Boolean(filters.from || filters.to),
    hasAmountRange: Boolean(filters.min || filters.max),
  };
}
