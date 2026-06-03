import { type PlainMonth, currentMonth, isValidPlainMonth } from "@spend-circle/domain";
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

  // Set the instant we begin leaving (cancel or successful save). It stops the resolver
  // (below) so a save that renamed the Transaction — changing its canonical ref — can't
  // canonicalize the now-stale URL slug and race us back onto the edit route. The close
  // navigation then wins cleanly.
  const [closing, setClosing] = useState(false);
  const close = () => {
    setClosing(true);
    navigate(ledgerUrl);
  };

  const resolution = useResolvedTransaction({ enabled: !closing });

  // An archived Circle is accessible but read-only: an edit URL there must not open the
  // form (and `updateTransaction` would reject anyway — ADR 0015). Drop the form state
  // and land on the in-place read-only ledger rather than ejecting through the
  // unavailable-link path (ADR 0017). Replace so the dead edit URL leaves no Back entry.
  useEffect(() => {
    if (!writable) {
      navigate(ledgerUrl, { replace: true });
    }
  }, [writable, navigate, ledgerUrl]);

  // While the target resolves, while the archived-Circle redirect is in flight, or while
  // closing, show the splash rather than flashing a form that's about to be torn down.
  if (!writable || closing || resolution.status === "pending") {
    return <Splash label="Opening transaction…" />;
  }

  return (
    <TransactionForm
      circle={circle}
      mode={{ kind: "edit", transaction: resolution.value }}
      selectedMonth={month}
      onClose={close}
    />
  );
}
