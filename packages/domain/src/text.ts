/**
 * Text matching for lightweight in-app search surfaces. Category Filter (CAT-4)
 * keeps substring matching via `textIncludes`; Transaction Search denormalizes
 * title+note into `transactionSearchText` for Convex full-text search (GH-91).
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

/** The one denormalized field Convex indexes for Transaction full-text search. */
export function transactionSearchText(input: { title: string; note?: string }) {
  return normalizeSearchText([input.title, input.note].filter(Boolean).join(" "));
}

function searchTerms(queryText: string) {
  return normalizeSearchText(queryText).split(" ").filter(Boolean);
}

/** Mirrors Convex full-text basics for mock/test-only Transaction search paths:
 * whole terms, with prefix matching only on the last query term. */
export function transactionTextMatches(value: string | undefined, queryText: string) {
  const terms = searchTerms(queryText);
  if (terms.length === 0) return true;
  const valueTerms = searchTerms(value ?? "");
  const finalIndex = terms.length - 1;
  return terms.some((term, index) =>
    valueTerms.some((valueTerm) =>
      index === finalIndex ? valueTerm.startsWith(term) : valueTerm === term,
    ),
  );
}
