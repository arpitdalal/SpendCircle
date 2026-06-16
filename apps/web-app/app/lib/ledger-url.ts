/**
 * Transaction object-route URL helpers. The origin a route returns to on close/back —
 * the ledger month, search filters + page, dashboard scope — is no longer carried as a
 * structural slice here; it lives in the app-wide `returnTo` codec (`return-to-url.ts`,
 * issue #123). What remains is the canonical detail-path builder shared by the ledger /
 * search rows and the Dashboard recent feed, plus the small query-join those helpers and
 * `withReturnTo` reuse so the `?`-vs-empty rule has a single home.
 */

/** Joins a path with a bare query (no leading `?`), omitting the `?` when the query is empty. */
export function withQuery(path: string, query: string) {
  return query ? `${path}?${query}` : path;
}

/**
 * Minimal shape for building a Transaction detail URL — keeps this helper free of the
 * data barrel (ADR 0003 view types stay at call sites).
 */
type ObjectRef = { ref: string };

/**
 * Canonical read-only Transaction detail path for a Circle object route. The origin to
 * return to is carried separately as a validated `returnTo` param (see `withReturnTo`),
 * so this is just the bare path — the single home both the ledger/search rows and the
 * Dashboard recent feed build, so they can't drift.
 */
export function transactionDetailHref(circle: ObjectRef, transaction: ObjectRef) {
  return `/circles/${circle.ref}/transactions/${transaction.ref}`;
}
