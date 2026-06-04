import type { PlainMonth } from "@spend-circle/domain";
import type { TransactionStatus } from "./data.js";

/**
 * The Monthly Ledger's URL-owned slice as a query string (ADR 0017): the selected
 * `month` and the active/archived `view`. The single home of that encoding so the
 * ledger row's detail link (open a row, keep its slice) and the detail page's Back link
 * (return to the same slice) can't drift apart — and it matches the contract the ledger
 * route normalizes (`month=YYYY-MM`, `view=archived`; active is the absent default).
 *
 * Returns a bare query (no leading `?`), empty when nothing to preserve, so a caller
 * prepends it onto whatever path it owns: `…/transactions?${q}` or `…/transactions/<ref>?${q}`.
 */
export function ledgerSearch(
  opts: { month?: PlainMonth; status?: TransactionStatus } = {},
): string {
  const params = new URLSearchParams();
  if (opts.month) {
    params.set("month", opts.month);
  }
  if (opts.status === "archived") {
    params.set("view", "archived");
  }
  return params.toString();
}

/** Joins a path with a {@link ledgerSearch} query, omitting the `?` when the query is empty. */
export function withQuery(path: string, query: string): string {
  return query ? `${path}?${query}` : path;
}
