import { formatMoney, money, toCurrencyCode } from "@spend-circle/domain";
import { Link } from "react-router";
import { HistoryList } from "~/components/history-list.js";
import { Splash } from "~/components/splash.js";
import { Button } from "~/components/ui/button.js";
import { type Circle, type TransactionDetail, useTransactionHistory } from "~/lib/data.js";
import { formatAuditTimestamp } from "~/lib/datetime.js";
import { viewerLocale } from "~/lib/locale.js";
import { useResolvedTransactionDetail } from "~/lib/use-resolved-transaction-detail.js";
import { useCircle } from "~/routes/layouts/circle-layout.js";

/**
 * The Transaction DETAIL object route — `/circles/:circleRef/transactions/:transactionRef`
 * (TXN-4, ADR 0016/0017) and the REFERENCE object route the object-guard pattern is built
 * around. {@link useResolvedTransactionDetail} fetches the target BY ID (so a Transaction
 * outside the visible ledger page still opens), canonicalizes a stale title slug in place,
 * and routes every missing / inaccessible / wrong-Circle case through the shared
 * unavailable-link fallback to the Circle's Transactions route.
 *
 * A read surface: it shows the Transaction's fields, its **Audit Metadata** (created/
 * updated by + at — PRD story 76), and its **Transaction History** (the shared
 * {@link HistoryList}, paginated — PRD story 77). It works for an archived (frozen)
 * Transaction too. Creating / editing / archiving live in their own slices (TXN-1/2/3);
 * this only LINKS to the edit object route as a courtesy, gated on the server's
 * `canEditFields` flag and a writable Circle — the server re-checks every mutation (ADR
 * 0015), so the link is never the enforcement. No raw internal IDs are shown (PRD 80).
 */
export default function TransactionDetailRoute() {
  const circle = useCircle();
  const resolution = useResolvedTransactionDetail();

  if (resolution.status === "pending") {
    return <Splash label="Opening transaction…" />;
  }

  return <TransactionDetailView circle={circle} transaction={resolution.value} />;
}

function TransactionDetailView({
  circle,
  transaction,
}: {
  circle: Circle;
  transaction: TransactionDetail;
}) {
  const currency = toCurrencyCode(circle.currency);
  const amount = formatMoney(money(transaction.amountMinorUnits, currency), viewerLocale());
  const writable = circle.status === "active";
  const ledgerUrl = `/circles/${circle.ref}/transactions`;
  const isArchived = transaction.status === "archived";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <Link to={ledgerUrl} className="text-sm text-neutral-400 hover:text-neutral-100">
          ‹ Back to transactions
        </Link>
        {writable && transaction.canEditFields && !isArchived ? (
          <Button asChild variant="outline">
            <Link
              to={`${ledgerUrl}/${transaction.ref}/edit`}
              aria-label={`Edit ${transaction.title}`}
            >
              Edit
            </Link>
          </Button>
        ) : null}
      </div>

      <header className="space-y-2">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">{transaction.title}</h2>
          {isArchived ? (
            <span className="rounded-md border border-neutral-700 px-2 py-0.5 text-xs text-neutral-400">
              Archived
            </span>
          ) : null}
        </div>
        <p
          className={
            transaction.type === "income"
              ? "text-xl font-semibold tabular-nums text-green-400"
              : "text-xl font-semibold tabular-nums text-neutral-100"
          }
        >
          {transaction.type === "income" ? "+" : "-"}
          {amount}
        </p>
      </header>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        <Field label="Type">{transaction.type === "income" ? "Income" : "Expense"}</Field>
        <Field label="Date">{transaction.date}</Field>
        <Field label="Paid By">{transaction.paidBy.displayName}</Field>
        <Field label="Recorded By">{transaction.recordedBy.displayName}</Field>
        <Field label="Categories">
          {transaction.categories.map((category) => category.name).join(", ")}
        </Field>
        {transaction.note ? <Field label="Note">{transaction.note}</Field> : null}
      </dl>

      <AuditMetadata audit={transaction.audit} />

      <TransactionHistory circleId={circle.id} transactionId={transaction.id} />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-neutral-500">{label}</dt>
      <dd className="truncate text-neutral-100">{children}</dd>
    </div>
  );
}

/**
 * The Audit Metadata block (PRD story 76): who created the Transaction and when, and who
 * last changed it and when. Timestamps render in a fixed reference zone, never the
 * viewer's timezone (Audit Metadata glossary — see {@link formatAuditTimestamp}).
 */
function AuditMetadata({ audit }: { audit: TransactionDetail["audit"] }) {
  const rows = [
    { label: "Created", member: audit.createdBy.displayName, at: audit.createdAt },
    { label: "Last updated", member: audit.updatedBy.displayName, at: audit.updatedAt },
  ];
  return (
    <section aria-label="Audit metadata" className="space-y-2">
      <h3 className="text-sm font-semibold">Details</h3>
      <dl className="grid gap-y-2 text-sm">
        {rows.map((row) => (
          <div key={row.label} className="flex flex-wrap items-baseline gap-x-2">
            <dt className="text-neutral-500">{row.label} by</dt>
            <dd className="text-neutral-100">{row.member}</dd>
            <dd className="text-neutral-500">
              ·{" "}
              <time dateTime={new Date(row.at).toISOString()}>{formatAuditTimestamp(row.at)}</time>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** The Transaction History list (PRD story 77) — the paginated audit fed into the shared
 * {@link HistoryList}. Kept a thin wrapper so the data hook stays out of the render shell. */
function TransactionHistory({
  circleId,
  transactionId,
}: {
  circleId: Circle["id"];
  transactionId: TransactionDetail["id"];
}) {
  const { events, status, loadMore } = useTransactionHistory(circleId, transactionId);
  return <HistoryList events={events} status={status} loadMore={loadMore} label="History" />;
}
