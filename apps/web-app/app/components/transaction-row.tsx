import { type CurrencyCode, formatMoney, money } from "@spend-circle/domain";
import type { ReactNode } from "react";
import { Link } from "react-router";
import type { Transaction } from "~/lib/data.js";
import { viewerLocale } from "~/lib/locale.js";
import { cn } from "~/lib/utils.js";

/**
 * One Transaction row, shared by the ledger/search list ({@link TransactionList}) and the
 * Dashboard recent feed so the layout can't drift between surfaces.
 *
 * Responsive by CONTAINER width, not viewport (`@container/txn-row` on the `<li>`): the row
 * is mounted in columns whose width differs from the screen, so it adapts to the space it
 * actually has. Narrow → a stacked two-row layout (title + amount on top, meta WRAPS below
 * so date, every category, payer, and the Archived badge all stay visible no matter how many
 * categories are added). Wide → today's single centered row where the plentiful width lets
 * the meta truncate to one line.
 *
 * `actions` is the right-rail slot (Edit / Archive-Restore or their overflow menu); the
 * Dashboard feed passes none. `titleHref` makes the title a link to the detail page.
 */
export function TransactionRow({
  txn,
  currency,
  titleHref,
  actions,
}: {
  txn: Transaction;
  currency: CurrencyCode;
  titleHref?: string;
  actions?: ReactNode;
}) {
  const archived = txn.status === "archived";
  return (
    <li className="@container/txn-row rounded-lg border border-border bg-card shadow-sm">
      <div className="flex items-start gap-x-3 gap-y-1 px-3 py-2.5 @2xl/txn-row:items-center">
        <div className="min-w-0 flex-1">
          <p className={cn("truncate text-sm font-medium", archived && "text-muted-foreground")}>
            {titleHref ? (
              <Link to={titleHref} className="hover:underline" aria-label={`View ${txn.title}`}>
                {txn.title}
              </Link>
            ) : (
              txn.title
            )}
          </p>
          {/* Meta WRAPS on a narrow container (no `truncate`) so every category, the date,
              the payer, and the Archived badge stay visible; the badge is inline so it flows
              with the wrap. Wide containers have room to spare, so collapse to one line. */}
          <p className="mt-0.5 text-xs text-muted-foreground @2xl/txn-row:truncate">
            {txn.date} · {txn.categories.map((category) => category.name).join(", ")} ·{" "}
            {txn.paidBy.displayName}
            {archived ? (
              <span className="ml-1.5 inline-flex items-center rounded border border-border px-1.5 py-px font-medium">
                Archived
              </span>
            ) : null}
          </p>
        </div>
        <span
          className={cn(
            "shrink-0 text-sm font-semibold whitespace-nowrap tabular-nums",
            txn.type === "income" ? "text-positive" : "text-foreground",
          )}
        >
          {txn.type === "income" ? "+" : "-"}
          {formatMoney(money(txn.amountMinorUnits, currency), viewerLocale())}
        </span>
        {actions}
      </div>
    </li>
  );
}
