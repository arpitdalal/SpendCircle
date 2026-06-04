import { currentMonth, isValidPlainMonth, type PlainMonth } from "@spend-circle/domain";
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Splash } from "~/components/splash.js";
import { TransactionForm } from "~/components/transaction-form.js";
import { useResolvedTransaction } from "~/lib/use-resolved-transaction.js";
import { useCircle } from "~/routes/layouts/circle-layout.js";

/**
 * The Transaction edit object route — `/circles/:circleRef/transactions/:transactionRef/edit`
 * (TXN-5, ADR 0016/0017). An edit deep link means "open an editable active
 * Transaction": {@link useResolvedTransaction} fetches the target BY ID (never from
 * the visible ledger page, so an off-month or off-page Transaction still opens),
 * canonicalizes a stale title slug in place, and routes every missing / inaccessible
 * / wrong-Circle / archived / not-editable-by-viewer case through the shared
 * unavailable-link fallback to the Circle's Transactions route — the selected month
 * preserved.
 *
 * The `month` query is ledger CONTEXT, not the Transaction's own month: closing or
 * saving returns to `/transactions?month=...` (this month), never auto-jumping to the
 * edited Transaction's month. An archived Circle stays accessible and read-only, so an
 * edit link there does not eject through the unavailable path — it lands back on the
 * in-place read-only ledger (the write surface is closed). Reload re-fetches the latest
 * server values; unsaved draft fields are not persisted.
 */
export default function TransactionEdit() {
  const circle = useCircle();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const rawMonth = searchParams.get("month");
  const month: PlainMonth = isValidPlainMonth(rawMonth) ? rawMonth : currentMonth(new Date());
  const ledgerUrl = `/circles/${circle.ref}/transactions?month=${month}`;
  const writable = circle.status === "active";

  // Set the instant we begin leaving (cancel or successful save).
  const [closing, setClosing] = useState(false);
  const close = () => {
    setClosing(true);
    navigate(ledgerUrl);
  };

  // The route only resolves an edit target while it should actually show the form: a
  // writable Circle and not already leaving. BOTH off-states must stop the resolver, so
  // its unavailable / canonicalize effects can never fire and race the route's own
  // navigation (ADR 0017):
  //   - `!writable` (archived): the Circle is read-only, so ANY edit URL — even one
  //     whose target resolves to `null` — must land on the in-place read-only ledger
  //     via the redirect below, never the generic unavailable-link snackbar.
  //   - `closing`: a save that renamed the Transaction changes its canonical ref, so a
  //     live resolver would canonicalize the now-stale URL slug with a `replace` and
  //     drag us back onto the edit route; gating lets the close navigation win.
  const active = writable && !closing;
  const resolution = useResolvedTransaction({ enabled: active });

  // An archived Circle is accessible but read-only: drop the edit form state and land on
  // the in-place read-only ledger (ADR 0017). Replace so the dead edit URL leaves no
  // Back entry. The resolver is already disabled above, so this is the only exit.
  useEffect(() => {
    if (!writable) {
      navigate(ledgerUrl, { replace: true });
    }
  }, [writable, navigate, ledgerUrl]);

  // While inactive (archived redirect or closing, both in flight) or while the target
  // resolves, show the splash rather than flashing a form about to be torn down.
  if (!active || resolution.status === "pending") {
    return <Splash label="Opening transaction…" />;
  }

  return (
    // Keyed by the resolved Transaction id so navigating edit→edit between two targets
    // that resolve without a loading gap (e.g. Back/Forward to a cached one) REMOUNTS
    // the form instead of reusing it with the previous Transaction's TanStack defaults
    // and type state — the same id-keying the inline ledger form used.
    <TransactionForm
      key={resolution.value.id}
      circle={circle}
      mode={{ kind: "edit", transaction: resolution.value }}
      selectedMonth={month}
      onClose={close}
    />
  );
}
