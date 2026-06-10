import { formatMoney, money, type PlainMonth, toCurrencyCode } from "@spend-circle/domain";
import { useState } from "react";
import { Link } from "react-router";
import { Button } from "~/components/ui/button.js";
import {
  type Circle,
  type PaginatedTransactions,
  type Transaction,
  useArchiveTransaction,
  useRestoreTransaction,
} from "~/lib/data.js";
import { ledgerSearch, withQuery } from "~/lib/ledger-url.js";
import { viewerLocale } from "~/lib/locale.js";
import { useSnackbar } from "~/lib/snackbar.js";
import { cn } from "~/lib/utils.js";

export function TransactionList({
  paginated,
  circle,
  emptyLabel,
  canEdit,
  ledgerMonth,
  showLifecycle,
}: {
  paginated: PaginatedTransactions;
  circle: Circle;
  emptyLabel: string;
  canEdit: boolean;
  ledgerMonth?: PlainMonth;
  /**
   * Whether rows offer lifecycle actions (Archive/Restore). The ledger sets this; Search
   * is a read-only discovery surface and acts through the detail page instead. The action
   * each row offers is derived from that row's own `status`, so a mixed `status=all` list
   * still shows Archive on active rows and Restore on archived rows (not a dead view).
   */
  showLifecycle?: boolean;
}) {
  const { transactions, status, loadMore } = paginated;

  if (status === "LoadingFirstPage") {
    return <p className="text-sm text-muted-foreground">Loading transactions…</p>;
  }
  if (transactions.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        {emptyLabel}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {transactions.map((txn) => (
          <li
            key={txn.id}
            className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 shadow-sm"
          >
            <div className="min-w-0">
              <p
                className={cn(
                  "truncate text-sm font-medium",
                  txn.status === "archived" && "text-muted-foreground",
                )}
              >
                <Link
                  to={transactionDetailHref(circle, txn, ledgerMonth)}
                  className="hover:underline"
                  aria-label={`View ${txn.title}`}
                >
                  {txn.title}
                </Link>
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {txn.date} · {txn.categories.map((category) => category.name).join(", ")} ·{" "}
                {txn.paidBy.displayName}
                {txn.status === "archived" ? (
                  <span className="ml-1.5 inline-flex items-center rounded border border-border px-1.5 py-px text-xs font-medium">
                    Archived
                  </span>
                ) : null}
              </p>
            </div>
            <span
              className={cn(
                "ml-auto text-sm font-semibold tabular-nums",
                txn.type === "income" ? "text-positive" : "text-foreground",
              )}
            >
              {txn.type === "income" ? "+" : "-"}
              {formatMoney(
                money(txn.amountMinorUnits, toCurrencyCode(circle.currency)),
                viewerLocale(),
              )}
            </span>
            {ledgerMonth && txn.status === "active" && canEdit && txn.canEditFields ? (
              <Button asChild variant="outline" size="sm">
                <Link
                  to={`/circles/${circle.ref}/transactions/${txn.ref}/edit?month=${ledgerMonth}`}
                  aria-label={`Edit ${txn.title}`}
                >
                  Edit
                </Link>
              </Button>
            ) : null}
            {showLifecycle && canEdit && txn.canArchive ? (
              <LifecycleButton
                transaction={txn}
                action={txn.status === "archived" ? "restore" : "archive"}
              />
            ) : null}
          </li>
        ))}
      </ul>

      {status === "CanLoadMore" || status === "LoadingMore" ? (
        <Button
          type="button"
          variant="outline"
          onClick={loadMore}
          disabled={status === "LoadingMore"}
        >
          {status === "LoadingMore" ? "Loading…" : "Load more"}
        </Button>
      ) : null}
    </div>
  );
}

function transactionDetailHref(circle: Circle, txn: Transaction, ledgerMonth?: PlainMonth) {
  const base = `/circles/${circle.ref}/transactions/${txn.ref}`;
  return ledgerMonth ? withQuery(base, ledgerSearch({ month: ledgerMonth })) : base;
}

const LIFECYCLE_COPY = {
  archive: { idle: "Archive", busy: "Archiving…", error: "Couldn't archive the transaction." },
  restore: { idle: "Restore", busy: "Restoring…", error: "Couldn't restore the transaction." },
};

function LifecycleButton({
  transaction,
  action,
}: {
  transaction: Transaction;
  action: "archive" | "restore";
}) {
  const archiveTransaction = useArchiveTransaction();
  const restoreTransaction = useRestoreTransaction();
  const { show } = useSnackbar();
  const [pending, setPending] = useState(false);
  const copy = LIFECYCLE_COPY[action];

  const onClick = async () => {
    setPending(true);
    try {
      const run = action === "archive" ? archiveTransaction : restoreTransaction;
      await run({ transactionId: transaction.id });
    } catch (error) {
      console.error(`${action}Transaction failed`, error);
      show(`${copy.error} Please try again.`);
      setPending(false);
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={onClick}
      aria-label={`${copy.idle} ${transaction.title}`}
    >
      {pending ? copy.busy : copy.idle}
    </Button>
  );
}
