import {
  type ComparisonRangeMonths,
  DEFAULT_COMPARISON_RANGE_MONTHS,
  isComparisonRangeMonths,
  isTransactionType,
  type TransactionType,
} from "@spend-circle/domain";

/** Default category analytics ranking — expense tagged spend (RPT-5). */
export const DEFAULT_CATEGORY_ANALYTICS_TYPE: TransactionType = "expense";

/**
 * The Dashboard's URL-owned selections (RPT-3/RPT-4/RPT-5): the Paid By filter, the
 * Comparison Range, and the category analytics type toggle, so a filtered Dashboard
 * view survives reload and can be shared or revisited through history — the same
 * URL-as-state policy as the Ledger filters (`transaction-filter-url.ts`). One
 * read/write pair so the route and tests can never disagree about the param vocabulary.
 *
 * Defaults are OMITTED when writing: the canonical Dashboard URL stays the bare
 * Circle route (ADR 0016) unless the user actually narrowed something. A malformed
 * `range` reads as the default rather than throwing — a hand-edited URL degrades to
 * the standard view. `paidBy` is carried as the raw id string; the ROUTE validates
 * it against the loaded Paid By options (and cleans a stale/unknown id from the URL)
 * because only the options query knows which Members are selectable.
 */
export interface DashboardSelection {
  /** Selected Paid By Member id, or "" for All members (no filter). */
  paidBy: string;
  range: ComparisonRangeMonths;
  /** Expense vs income category ranking (RPT-5). */
  type: TransactionType;
}

/** The params this module owns; everything else is preserved untouched. */
export const DASHBOARD_PARAMS = ["paidBy", "range", "type"];
const DASHBOARD_PARAM_SET = new Set<string>(DASHBOARD_PARAMS);

export function readDashboardSelection(searchParams: URLSearchParams): DashboardSelection {
  const rawRange = Number(searchParams.get("range"));
  const rawType = (searchParams.get("type") ?? "").trim();
  return {
    paidBy: (searchParams.get("paidBy") ?? "").trim(),
    range: isComparisonRangeMonths(rawRange) ? rawRange : DEFAULT_COMPARISON_RANGE_MONTHS,
    type: isTransactionType(rawType) ? rawType : DEFAULT_CATEGORY_ANALYTICS_TYPE,
  };
}

export function canonicalDashboardParams(
  selection: DashboardSelection,
  preserve?: URLSearchParams,
) {
  const params = new URLSearchParams();
  if (selection.paidBy) {
    params.set("paidBy", selection.paidBy);
  }
  if (selection.range !== DEFAULT_COMPARISON_RANGE_MONTHS) {
    params.set("range", String(selection.range));
  }
  if (selection.type !== DEFAULT_CATEGORY_ANALYTICS_TYPE) {
    params.set("type", selection.type);
  }
  for (const [key, value] of preserve ?? []) {
    if (!DASHBOARD_PARAM_SET.has(key)) {
      params.append(key, value);
    }
  }
  return params;
}
