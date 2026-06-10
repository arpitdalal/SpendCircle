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
    return <p className="text-sm text-neutral-500">Loading transactions…</p>;
  }
  if (transactions.length === 0) {
    return <p className="text-sm text-neutral-500">{emptyLabel}</p>;
  }

  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {transactions.map((txn) => (
          <li
            key={txn.id}
            className="flex items-center gap-3 rounded-md border border-neutral-800 px-3 py-2"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                <Link
                  to={transactionDetailHref(circle, txn, ledgerMonth)}
                  className="hover:underline"
                  aria-label={`View ${txn.title}`}
                >
                  {txn.title}
                </Link>
              </p>
              <p className="truncate text-xs text-neutral-500">
                {txn.date} · {txn.categories.map((category) => category.name).join(", ")} ·{" "}
                {txn.paidBy.displayName}
              </p>
            </div>
            <span
              className={cn(
                "ml-auto text-sm font-medium tabular-nums",
                txn.type === "income" ? "text-green-400" : "text-neutral-100",
              )}
            >
              {txn.type === "income" ? "+" : "-"}
              {formatMoney(
                money(txn.amountMinorUnits, toCurrencyCode(circle.currency)),
                viewerLocale(),
              )}
            </span>
            {ledgerMonth && txn.status === "active" && canEdit && txn.canEditFields ? (
              <Button asChild variant="outline">
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
      disabled={pending}
      onClick={onClick}
      aria-label={`${copy.idle} ${transaction.title}`}
    >
      {pending ? copy.busy : copy.idle}
    </Button>
  );
}
