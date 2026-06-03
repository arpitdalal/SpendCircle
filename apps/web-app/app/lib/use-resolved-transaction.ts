import { api } from "@spend-circle/convex";
import { type PlainMonth, currentMonth, isValidPlainMonth } from "@spend-circle/domain";
import { useConvexAuth, useQuery } from "convex/react";
import { useParams, useSearchParams } from "react-router";
import { useCircle } from "~/routes/layouts/circle-layout.js";
import type { Transaction } from "./data.js";
import { MOCKS } from "./env.js";
import { mockEditableTransaction } from "./fixtures.js";
import { parseTransactionRef } from "./refs.js";
import { type Resolution, useResolvedRef } from "./use-resolved-ref.js";

/**
 * The Transaction object guard over the shared resolution primitive (ADR
 * 0016/0017), the second adapter the `useResolvedRef` state machine was extracted
 * for. It reads `transactionRef`, parses it, and subscribes to
 * `getEditableTransaction` scoped to the resolved Circle (from Outlet context) —
 * the edit target is fetched BY ID, never found in the visible ledger page, so an
 * off-month or off-page Transaction still opens (TXN-5).
 *
 * The server collapses missing / inaccessible / wrong-Circle / archived /
 * not-editable-by-viewer all to `null`, and this hands that `null` to the
 * primitive, which fires the generic unavailable-link snackbar and falls back to
 * the Circle's Transactions route — the SELECTED month preserved so closing an
 * unavailable edit link returns to the ledger the User was on, not a default
 * (ADR 0017). A stale title slug canonicalizes in place via the primitive.
 *
 * The fallback intentionally targets the read-only-safe Transactions route, not the
 * Circle root: an archived Circle stays accessible, so its edit links land back on
 * the in-place read-only ledger rather than ejecting through the unavailable path.
 *
 * `enabled` lets the route stop resolving while it is navigating away (e.g. right after
 * a successful save). Without it, a save that changes the Title changes the
 * Transaction's canonical ref, and the still-mounted resolver would canonicalize the
 * now-stale URL slug with a `replace` — racing the close navigation and dragging the
 * User back onto the edit route. Disabling skips the query AND every effect, so the
 * close wins (see `transaction-edit.tsx`).
 */
export function useResolvedTransaction({ enabled = true } = {}): Resolution<Transaction> {
  const circle = useCircle();
  const { transactionRef } = useParams();
  const { isAuthenticated } = useConvexAuth();
  const [searchParams] = useSearchParams();

  // Preserve the selected ledger month across the fallback so an unavailable edit link
  // returns to the ledger the User was on; an absent/invalid month resolves to the
  // current month (the same rule the ledger and the edit route's return URL apply), so
  // the fallback always carries a valid month rather than a bare route.
  const rawMonth = searchParams.get("month");
  const month: PlainMonth = isValidPlainMonth(rawMonth) ? rawMonth : currentMonth(new Date());
  const fallback = `/circles/${circle.ref}/transactions?month=${month}`;

  const parsed = parseTransactionRef(transactionRef);
  const queried = useQuery(
    api.transactions.getEditableTransaction,
    parsed && enabled && !MOCKS && isAuthenticated
      ? { circleId: circle.id, transactionId: parsed.id }
      : "skip",
  );
  // Mock mode synthesizes the Transaction from the ref so E2E/offline can render the
  // edit form without a live backend; real mode uses the reactive query (ADR 0006).
  const value = MOCKS && parsed && enabled ? mockEditableTransaction(parsed.id) : queried;

  return useResolvedRef<Transaction>({
    rawRef: transactionRef,
    parsed: parsed != null,
    // While disabled (navigating away), the query is skipped so `value` is `undefined`
    // — the primitive reads that as still-pending and fires NO effects (no fallback, no
    // canonicalize), letting the close navigation win.
    value,
    fallback,
  });
}
