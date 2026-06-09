import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { Splash } from "~/components/splash.js";
import { TransactionForm } from "~/components/transaction-form.js";
import { EDIT_RETURN_PARAM, parseEditReturn, withQuery } from "~/lib/ledger-url.js";
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
 * This route never reads the edit URL's `month`: an edit has no month of its own (its date
 * comes from the saved Transaction). The `month` param is just ledger context the
 * close carries BACK untouched. Where close (cancel or successful save) and the archived
 * redirect land is the `from` marker: `from=detail` (the detail page's Edit link) strips
 * only the `/edit` segment to return to this Transaction's detail page, so Detail → Edit →
 * close lands back on Detail; the default strips `/:transactionRef/edit` to return to the
 * ledger (the ledger row's Edit link). Either way the URL's own query is reused verbatim,
 * minus the edit-only `from` marker — a slice that was absent stays absent, so it never
 * invents one that would rewrite the detail's Back link. An archived Circle stays accessible
 * and read-only, so an edit link there does not eject through the unavailable path — it
 * lands back on that same return target (the write surface is closed). Reload re-fetches the
 * latest server values; unsaved draft fields are not persisted.
 */
export default function TransactionEdit() {
  const circle = useCircle();
  const navigate = useNavigate();
  const params = useParams();
  const [searchParams] = useSearchParams();
  const writable = circle.status === "active";

  // Close (cancel / successful save) and the archived redirect return to where the editor
  // was opened FROM, by structurally trimming the current URL — never by re-encoding it.
  // The query carries back verbatim (minus the edit-only `from` marker), so an absent slice
  // stays absent. `from=detail` lands on this Transaction's detail object route (drop only
  // `/edit`); the default lands on the ledger (drop `/:transactionRef/edit`).
  const returnSlice = new URLSearchParams();
  const month = searchParams.get("month");
  if (month) {
    returnSlice.set("month", month);
  }
  const ledgerBase = `/circles/${circle.ref}/transactions`;
  const returnBase =
    parseEditReturn(searchParams.get(EDIT_RETURN_PARAM)) === "detail"
      ? `${ledgerBase}/${params.transactionRef}`
      : ledgerBase;
  const returnUrl = withQuery(returnBase, returnSlice.toString());

  // Set the instant we begin leaving (cancel or successful save).
  const [closing, setClosing] = useState(false);
  const close = () => {
    setClosing(true);
    navigate(returnUrl);
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
  // the return target (the detail read surface when opened from there, else the in-place
  // read-only ledger — ADR 0017). Replace so the dead edit URL leaves no Back entry. The
  // resolver is already disabled above, so this is the only exit.
  useEffect(() => {
    if (!writable) {
      navigate(returnUrl, { replace: true });
    }
  }, [writable, navigate, returnUrl]);

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
      onClose={close}
    />
  );
}
