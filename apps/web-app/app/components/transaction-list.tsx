import { type PlainMonth, toCurrencyCode } from "@spend-circle/domain";
import { ArchiveIcon, ArchiveRestoreIcon, EllipsisVerticalIcon, PencilIcon } from "lucide-react";
import { useCallback, useState } from "react";
import { Link } from "react-router";
import { InfiniteScrollFooter } from "~/components/infinite-scroll-footer.js";
import { TransactionRow } from "~/components/transaction-row.js";
import { Button } from "~/components/ui/button.js";
import { buttonVariants } from "~/components/ui/button-variants.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLinkItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu.js";
import {
  type Circle,
  type PaginatedTransactions,
  type Transaction,
  useArchiveTransaction,
  useRestoreTransaction,
} from "~/lib/data.js";
import { mutationErrorMessageForUser } from "~/lib/mutation-user-message.js";
import { useSnackbar } from "~/lib/snackbar.js";
import { transactionDetailHref } from "~/lib/transaction-detail-href.js";

export function TransactionList({
  paginated,
  circle,
  emptyLabel,
  canEdit,
  ledgerMonth,
  showLifecycle,
  paginationMode = "infinite",
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
  /** Search uses numbered pages; ledger and filters keep infinite scroll. */
  paginationMode?: "infinite" | "none";
}) {
  const { transactions, status, loadMore } = paginated;
  const currency = toCurrencyCode(circle.currency);

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
        {transactions.map((txn) => {
          const canShowEdit =
            ledgerMonth !== undefined && txn.status === "active" && canEdit && txn.canEditFields;
          const canShowLifecycle = Boolean(showLifecycle) && canEdit && txn.canArchive;
          return (
            <TransactionRow
              key={txn.id}
              txn={txn}
              currency={currency}
              titleHref={transactionDetailHref(circle, txn, ledgerMonth)}
              actions={
                canShowEdit || canShowLifecycle ? (
                  <RowActions
                    transaction={txn}
                    editHref={canShowEdit ? editHref(circle, txn, ledgerMonth) : undefined}
                    showLifecycle={canShowLifecycle}
                  />
                ) : undefined
              }
            />
          );
        })}
      </ul>

      {paginationMode === "infinite" ? (
        <InfiniteScrollFooter
          status={status}
          loadMore={loadMore}
          loadingCopy="Loading more transactions…"
          listAriaLabel="Transaction list"
          sentinelTestId="transactions-infinite-scroll-sentinel"
        />
      ) : null}
    </div>
  );
}

function editHref(circle: Circle, txn: Transaction, ledgerMonth: PlainMonth) {
  return `/circles/${circle.ref}/transactions/${txn.ref}/edit?month=${ledgerMonth}`;
}

/**
 * The row's right-rail actions. Wide containers show inline Edit / Archive-Restore buttons;
 * narrow containers (where two ~70px buttons would starve the meta line) collapse them into
 * an overflow menu — the same accessible names either way, toggled by container width so the
 * presentation tracks the space the row actually has, not the viewport. `editHref` present ⇒
 * the row is editable; a row's lifecycle action is derived from its own status.
 */
function RowActions({
  transaction,
  editHref,
  showLifecycle,
}: {
  transaction: Transaction;
  editHref?: string;
  showLifecycle: boolean;
}) {
  const action = transaction.status === "archived" ? "restore" : "archive";
  const copy = LIFECYCLE_COPY[action];
  return (
    <>
      {/* Wide: inline buttons. */}
      <div className="hidden shrink-0 items-center gap-2 @2xl/txn-row:flex">
        {editHref ? (
          <Link
            to={editHref}
            aria-label={`Edit ${transaction.title}`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Edit
          </Link>
        ) : null}
        {showLifecycle ? <LifecycleButton transaction={transaction} action={action} /> : null}
      </div>

      {/* Narrow: overflow menu. */}
      <div className="shrink-0 @2xl/txn-row:hidden">
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger
            render={<Button variant="ghost" size="icon" />}
            aria-label={`Actions for ${transaction.title}`}
          >
            <EllipsisVerticalIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {editHref ? (
              <DropdownMenuLinkItem
                render={<Link to={editHref} />}
                aria-label={`Edit ${transaction.title}`}
              >
                <PencilIcon />
                Edit
              </DropdownMenuLinkItem>
            ) : null}
            {showLifecycle ? (
              <LifecycleMenuItem transaction={transaction} action={action}>
                {action === "archive" ? <ArchiveIcon /> : <ArchiveRestoreIcon />}
                {copy.idle}
              </LifecycleMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  );
}

const LIFECYCLE_COPY = {
  archive: { idle: "Archive", busy: "Archiving…", error: "Couldn't archive the transaction." },
  restore: { idle: "Restore", busy: "Restoring…", error: "Couldn't restore the transaction." },
};

/**
 * The Archive/Restore mutation wiring, shared by the inline button and the overflow menu item
 * so the success/error/snackbar contract lives in one place. Resolves to whether it succeeded
 * so a caller that stays mounted (the inline button) can settle its own pending flag.
 */
function useLifecycleAction() {
  const archiveTransaction = useArchiveTransaction();
  const restoreTransaction = useRestoreTransaction();
  const { show } = useSnackbar();
  return useCallback(
    async (transaction: Transaction, action: "archive" | "restore") => {
      try {
        const run = action === "archive" ? archiveTransaction : restoreTransaction;
        await run({ transactionId: transaction.id });
        return true;
      } catch (error) {
        console.error(`${action}Transaction failed`, error);
        show(
          mutationErrorMessageForUser(error, `${LIFECYCLE_COPY[action].error} Please try again.`),
        );
        return false;
      }
    },
    [archiveTransaction, restoreTransaction, show],
  );
}

function LifecycleButton({
  transaction,
  action,
}: {
  transaction: Transaction;
  action: "archive" | "restore";
}) {
  const runLifecycle = useLifecycleAction();
  const [pending, setPending] = useState(false);
  const copy = LIFECYCLE_COPY[action];

  const onClick = async () => {
    setPending(true);
    try {
      await runLifecycle(transaction, action);
    } finally {
      // Always clear the in-flight flag. On success the row stays mounted in a mixed
      // `status=all` list and `action` flips with the new `status`, so leaving `pending`
      // set would strand the button on the opposite action's busy label (issue #82).
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

/**
 * The overflow-menu twin of {@link LifecycleButton}. Selecting it closes the menu (so the item
 * unmounts), so it owns no pending flag — the mutation runs detached and any failure surfaces
 * through the shared snackbar, exactly as the inline button's does.
 */
function LifecycleMenuItem({
  transaction,
  action,
  children,
}: {
  transaction: Transaction;
  action: "archive" | "restore";
  children: React.ReactNode;
}) {
  const runLifecycle = useLifecycleAction();
  return (
    <DropdownMenuItem
      onClick={() => void runLifecycle(transaction, action)}
      aria-label={`${LIFECYCLE_COPY[action].idle} ${transaction.title}`}
    >
      {children}
    </DropdownMenuItem>
  );
}
