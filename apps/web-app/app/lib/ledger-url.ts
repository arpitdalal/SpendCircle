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

/**
 * Where an edit object route returns on close — Cancel OR a successful save (ADR 0017).
 * The default `"ledger"` lands on the Monthly Ledger (the edit's `month` context);
 * `"detail"` returns to the Transaction detail page the edit was opened from, so a
 * Ledger → Detail → Edit → close trip lands back on Detail, not the Ledger. The detail
 * page's Edit link sets `from=detail`; the ledger row's Edit link omits it (ledger
 * default). Decoded by {@link parseEditReturn} so the edit route honors the same marker.
 */
export type EditReturn = "ledger" | "detail";

/** The edit object link's `from` param: who opened the editor and thus where close returns. */
export const EDIT_RETURN_PARAM = "from";

/** Decodes the edit route's `from` param to a known {@link EditReturn}; anything else
 * (absent, stale, hand-typed) falls back to the ledger default. */
export function parseEditReturn(value: string | null): EditReturn {
  return value === "detail" ? "detail" : "ledger";
}

/**
 * Builds an edit object link's query: the {@link ledgerSearch} slice to carry forward
 * (so a return to the detail keeps ITS Back target, and a return to the ledger keeps the
 * month) plus, when opened from the detail page, the `from=detail` return marker. Reuses
 * `ledgerSearch` for the slice so the slice encoding has a single home and can't drift.
 */
export function editSearch(
  opts: { month?: PlainMonth; status?: TransactionStatus; from?: EditReturn } = {},
): string {
  const params = new URLSearchParams(ledgerSearch(opts));
  if (opts.from === "detail") {
    params.set(EDIT_RETURN_PARAM, "detail");
  }
  return params.toString();
}
