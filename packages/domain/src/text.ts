/**
 * Text matching for the lightweight in-app search surfaces (Transaction text
 * search — RPT-2; Category Filter — CAT-4). One definition of "matches" shared
 * by the backend handlers and the web mock fixtures, so the mock path cannot
 * drift from the real one: substring, case-insensitive, whitespace-normalized.
 */

/** Canonical search text: trimmed, lowercased, runs of whitespace collapsed to
 * one space. Applied to BOTH sides of a match so `"  WEEKLY  shop "` and
 * `"weekly shop"` are the same query. */
export function normalizeSearchText(value: string | undefined) {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** Whether `value` contains `queryText` as a substring, both sides normalized.
 * An empty (or whitespace-only) query matches everything. Callers that match a
 * query against many rows may pre-normalize it — re-normalizing an already
 * canonical string is a no-op, so both call shapes are correct. */
export function textIncludes(value: string | undefined, queryText: string) {
  return normalizeSearchText(value).includes(normalizeSearchText(queryText));
}
