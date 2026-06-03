import {
  type PlainMonth,
  type TransactionType,
  addMonths,
  currentMonth,
  formatMinorUnits,
  isValidPlainMonth,
  toCurrencyCode,
} from "@spend-circle/domain";
import { useEffect } from "react";
import { Link, useSearchParams } from "react-router";
import { TransactionForm } from "~/components/transaction-form.js";
import { Button } from "~/components/ui/button.js";
import {
  type Circle,
  type MonthlySummary,
  type PaginatedTransactions,
  type Transaction,
  useMonthlyLedger,
} from "~/lib/data.js";
import { cn } from "~/lib/utils.js";
import { useCircle } from "~/routes/layouts/circle-layout.js";

/**
 * The Monthly Ledger — the Circle's operational Transaction management surface
 * (glossary; PRD stories 62–67), reached via the Transactions route (the Circle
 * index is the Dashboard — RPT-3/4/6). It shows ONE selected month: that month's
 * Income / Expense / Net totals, that month's active Transactions (sorted
 * Transaction Date desc then created-at desc), and month/year navigation (PRD 64).
 * Archived Transactions are excluded (TXN-3). Dedicated Add Expense / Add Income
 * CTAs (not a type dropdown — PRD 27, 28) open a Transaction form scoped to that
 * type; the live list confirms a create landed. Search/filters are RPT-2.
 *
 * The totals come from `getMonthlyLedger` (a bounded server-side aggregate over the
 * whole month — never summed from the page) and the list from the month-scoped,
 * paginated `listTransactions`; `useMonthlyLedger` fuses the two for the selected
 * month and re-runs when navigation changes it.
 *
 * URL state (TXN-5, ADR 0017): the selected month is the `month=YYYY-MM` query
 * param and the open Add form is `new=expense|income` — both survive reload and
 * direct links. The bare route normalizes to the current month, an invalid `month`
 * replaces to the current month (no snackbar), an invalid `new` is dropped while a
 * valid `month` is preserved, and a read-only (archived) Circle drops the `new`
 * form state. Editing is its OWN object route (`/transactions/:transactionRef/edit`
 * — ADR 0016), so the row Edit is a real canonical link, not local state. Unsaved
 * draft fields are deliberately NOT encoded — reload restores navigation, not drafts.
 */
export default function CircleTransactions() {
  const circle = useCircle();
  const [searchParams, setSearchParams] = useSearchParams();
  const writable = circle.status === "active";

  const rawMonth = searchParams.get("month");
  const monthValid = isValidPlainMonth(rawMonth);
  // `rawMonth` is the source of truth; an absent/invalid one falls back to the current
  // month for rendering AND is normalized into the URL by the effect below. The guard is
  // re-applied inline (not via `monthValid`) so TS narrows `rawMonth` to a `PlainMonth`.
  const month: PlainMonth = isValidPlainMonth(rawMonth) ? rawMonth : currentMonth(new Date());

  const rawNew = searchParams.get("new");
  // The open create form's type, or null. A read-only Circle drops the form state
  // entirely (the write surface collapses — ADR 0017), so `new` only opens a form on
  // a writable Circle. An invalid `new` value is treated as no form (and dropped below).
  const createType: TransactionType | null =
    writable && (rawNew === "expense" || rawNew === "income") ? rawNew : null;

  // Normalize malformed/unsupported UI query state with REPLACE navigation rather than
  // treating it as an unavailable object (ADR 0017): backfill a missing/invalid month
  // to the current month, and drop a `new` that is invalid or not allowed here (the
  // Circle is read-only). Replace so these corrections never litter the Back stack.
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    let changed = false;
    if (!monthValid) {
      next.set("month", month);
      changed = true;
    }
    const newAllowed = writable && (rawNew === "expense" || rawNew === "income");
    if (rawNew !== null && !newAllowed) {
      next.delete("new");
      changed = true;
    }
    if (changed) {
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, monthValid, month, rawNew, writable, setSearchParams]);

  const { summary, transactions } = useMonthlyLedger(circle.id, month);

  // Month changes PUSH a normal history entry (Back returns to the prior month).
  const goToMonth = (next: PlainMonth) => {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        params.set("month", next);
        return params;
      },
      { replace: false },
    );
  };

  // Opening an Add form deep-links `new=<type>` (preserving the month); closing or
  // saving removes only `new` and keeps the month.
  const openCreate = (type: TransactionType) => {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      params.set("month", month);
      params.set("new", type);
      return params;
    });
  };
  const closeCreate = () => {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        params.delete("new");
        return params;
      },
      { replace: true },
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Transactions</h2>
        {writable ? (
          <div className="flex gap-2">
            <Button type="button" onClick={() => openCreate("expense")}>
              Add expense
            </Button>
            <Button type="button" variant="outline" onClick={() => openCreate("income")}>
              Add income
            </Button>
          </div>
        ) : null}
      </div>

      <MonthNavigator month={month} onChange={goToMonth} />
      <MonthlyTotals summary={summary} fallbackCurrency={circle.currency} />

      {!writable ? (
        <p className="rounded-md border border-neutral-800 p-3 text-sm text-neutral-500">
          This circle is archived. Restore it to add transactions.
        </p>
      ) : null}

      {/* The create form is keyed on its type so switching Add expense ↔ Add income
          remounts it fresh; `createType` is already null for a read-only Circle, so a
          Circle archived mid-edit (its reactive query flips status) closes the form in
          place. An inaccessible Circle is handled a layer up by the guard (ADR 0016/0017). */}
      {createType ? (
        <TransactionForm
          key={`create-${createType}`}
          circle={circle}
          mode={{ kind: "create", type: createType }}
          selectedMonth={month}
          onClose={closeCreate}
        />
      ) : null}

      <TransactionList
        paginated={transactions}
        circle={circle}
        month={month}
        monthLabel={formatMonthLabel(month)}
        canEdit={writable}
      />
    </div>
  );
}

/** A "YYYY-MM" month as a human label, e.g. "June 2026". Built from the plain month
 * parts (no timezone parsing) so it matches the stored bucket exactly. */
function formatMonthLabel(month: PlainMonth): string {
  const parts = month.split("-");
  const year = Number(parts[0]);
  const monthIndex = Number(parts[1]);
  return new Date(year, monthIndex - 1, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

/**
 * Month/year navigation for the Ledger (PRD 64): previous / next step by one month
 * (`addMonths`, so Dec↔Jan crosses the year correctly), and the native month input
 * jumps to any month. The input is the single source of the value; the buttons drive
 * it through the same `onChange`.
 */
function MonthNavigator({
  month,
  onChange,
}: {
  month: PlainMonth;
  onChange: (month: PlainMonth) => void;
}) {
  return (
    <fieldset className="flex items-center gap-2">
      <legend className="sr-only">Select month</legend>
      <Button
        type="button"
        variant="outline"
        aria-label="Previous month"
        onClick={() => onChange(addMonths(month, -1))}
      >
        ‹
      </Button>
      <label htmlFor="ledger-month" className="sr-only">
        Month
      </label>
      <input
        id="ledger-month"
        type="month"
        value={month}
        onChange={(event) => {
          // Commit only a valid "YYYY-MM". The native control clears to "" when emptied
          // (ignored, so the Ledger always has a selected month); and where the browser
          // has no real month picker it degrades to a free-text field that can yield an
          // out-of-range/garbage month — both ledger queries throw `Invalid month` on
          // that (ledger.ts/transactions.ts), so reject it here at the source. With this
          // guard `month` is always valid, so the prev/next `addMonths` never sees NaN.
          if (isValidPlainMonth(event.target.value)) {
            onChange(event.target.value);
          }
        }}
        className="rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm outline-none transition-colors focus:border-neutral-400"
      />
      <Button
        type="button"
        variant="outline"
        aria-label="Next month"
        onClick={() => onChange(addMonths(month, 1))}
      >
        ›
      </Button>
    </fieldset>
  );
}

/**
 * The selected month's Income / Expense / Net header. Totals are minor units summed
 * server-side and formatted ONCE here in the Circle Currency (ADR 0009) — never
 * summed from formatted strings. `summary` is `undefined` while loading (placeholders
 * shown) and `null` only for an inaccessible Circle (the guard ejects before this
 * renders); the currency falls back to the Circle's until the summary resolves.
 */
function MonthlyTotals({
  summary,
  fallbackCurrency,
}: {
  summary: MonthlySummary | null | undefined;
  fallbackCurrency: string;
}) {
  const currency = toCurrencyCode(summary?.currency ?? fallbackCurrency);
  const totals = summary?.totals;
  const stats: { label: string; amount: number | undefined; tone: string }[] = [
    { label: "Income", amount: totals?.incomeMinor, tone: "text-green-400" },
    { label: "Expenses", amount: totals?.expenseMinor, tone: "text-neutral-100" },
    {
      label: "Net",
      amount: totals?.netMinor,
      tone: (totals?.netMinor ?? 0) >= 0 ? "text-green-400" : "text-red-400",
    },
  ];

  return (
    <fieldset>
      <legend className="sr-only">Monthly totals</legend>
      <dl className="grid grid-cols-3 gap-3">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-md border border-neutral-800 p-3">
            <dt className="text-xs text-neutral-500">{stat.label}</dt>
            <dd className={cn("text-sm font-semibold tabular-nums", stat.tone)}>
              {stat.amount === undefined ? "…" : formatMinorUnits(stat.amount, currency)}
            </dd>
          </div>
        ))}
      </dl>
    </fieldset>
  );
}

/**
 * The active Transactions, most recent first, with money formatted in the Circle
 * Currency. Paginated: it renders the loaded page and a Load more control while
 * more remain, so an arbitrarily long ledger never loads in one shot.
 *
 * The Edit affordance is a canonical object LINK to `/transactions/:transactionRef/edit`
 * (ADR 0016) — a real, shareable, reload-safe URL, not local state (TXN-5) — carrying
 * the selected `month` so the edit route returns to this same ledger month on close.
 * It shows only where the server marked the viewer as able to edit (`canEditFields` —
 * the Recorded By Member) and the Circle is writable; the server re-checks on save and
 * the edit-target query re-checks on open, so this is the courtesy, not the enforcement
 * (ADR 0015).
 */
function TransactionList({
  paginated,
  circle,
  month,
  monthLabel,
  canEdit,
}: {
  paginated: PaginatedTransactions;
  circle: Circle;
  month: PlainMonth;
  monthLabel: string;
  canEdit: boolean;
}) {
  const { transactions, status, loadMore } = paginated;

  if (status === "LoadingFirstPage") {
    return <p className="text-sm text-neutral-500">Loading transactions…</p>;
  }
  // An inaccessible Circle (ADR 0016) and a month with no active Transactions both
  // arrive as an empty page — the Circle guard already gated entry, so treat both as
  // nothing to show, naming the month so an empty view reads as "this month is empty"
  // rather than "this circle is empty".
  if (transactions.length === 0) {
    return <p className="text-sm text-neutral-500">No transactions in {monthLabel}.</p>;
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
              <p className="truncate text-sm font-medium">{txn.title}</p>
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
              {formatMinorUnits(txn.amountMinorUnits, toCurrencyCode(circle.currency))}
            </span>
            {canEdit && txn.canEditFields ? (
              <Button asChild variant="outline">
                <Link
                  to={`/circles/${circle.ref}/transactions/${txn.ref}/edit?month=${month}`}
                  aria-label={`Edit ${txn.title}`}
                >
                  Edit
                </Link>
              </Button>
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
