import type { TransactionType } from "@spend-circle/domain";

import { cleanText, readLifecycleStatus } from "./url-codec.js";

/**
 * URL codec for the Categories page's **Category Filter** (CAT-4) — a small
 * sibling of `transaction-filter-url.ts`, not an overload of it: the Categories
 * `type` is binary (`expense | income`, the page always shows exactly one type),
 * so it has no `"all"` and the two modules' defaults differ. Filter state lives
 * in the URL so a filtered view is shareable and reproducible (ADR 0016).
 *
 * Canonical form: `type` and `status` are ALWAYS written (so a copied URL is
 * self-describing), `q` is omitted when empty and trimmed/normalized when
 * present. Readers clamp unknown values to the defaults.
 */

export type CategoryLifecycleFilter = "active" | "archived" | "all";

export interface CategoriesFilters {
  type: TransactionType;
  status: CategoryLifecycleFilter;
  q: string;
}

export const DEFAULT_CATEGORIES_TYPE: TransactionType = "expense";
/** Parity with the ledger's one-picture view: archived rows are distinguished,
 * not hidden, so history is visible without toggling. */
export const DEFAULT_CATEGORIES_STATUS: CategoryLifecycleFilter = "all";

const FILTER_PARAMS = ["type", "status", "q"];

/** The canonical `q` text: trimmed, internal whitespace collapsed (case kept —
 * the backend match is case-insensitive, but the URL shows what was typed). The
 * route's debounce compares against this to avoid writing no-op history entries. */
export function cleanQueryText(value: string | null) {
  return cleanText(value);
}

function readType(value: string | null): TransactionType {
  return value === "expense" || value === "income" ? value : DEFAULT_CATEGORIES_TYPE;
}

function readStatus(value: string | null): CategoryLifecycleFilter {
  return readLifecycleStatus(value, DEFAULT_CATEGORIES_STATUS);
}

export function readCategoriesFilters(searchParams: URLSearchParams): CategoriesFilters {
  return {
    type: readType(searchParams.get("type")),
    status: readStatus(searchParams.get("status")),
    q: cleanQueryText(searchParams.get("q")),
  };
}

export function writeCategoriesFilters(params: URLSearchParams, filters: CategoriesFilters) {
  params.set("type", filters.type);
  params.set("status", filters.status);
  const q = cleanQueryText(filters.q);
  if (q) {
    params.set("q", q);
  } else {
    params.delete("q");
  }
}

/** The canonical params for a filter state, preserving any non-filter params the
 * URL carries (same contract as `canonicalLedgerParams`). */
export function canonicalCategoriesParams(filters: CategoriesFilters, preserve?: URLSearchParams) {
  const params = new URLSearchParams();
  writeCategoriesFilters(params, filters);
  for (const [key, value] of preserve ?? []) {
    if (!FILTER_PARAMS.includes(key)) {
      params.append(key, value);
    }
  }
  return params;
}

export function defaultCategoriesFilters(): CategoriesFilters {
  return { type: DEFAULT_CATEGORIES_TYPE, status: DEFAULT_CATEGORIES_STATUS, q: "" };
}

/** Whether any narrowing beyond the type tab is applied — drives the
 * "no matches" vs "no Categories yet" empty-state split. */
export function hasCategoriesNarrowing(filters: CategoriesFilters) {
  return filters.q !== "" || filters.status !== DEFAULT_CATEGORIES_STATUS;
}
