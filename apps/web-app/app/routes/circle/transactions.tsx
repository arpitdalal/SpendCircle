import {
  addMonths,
  currentMonth,
  formatMoney,
  isValidPlainMonth,
  money,
  type PlainMonth,
  type TransactionType,
  toCurrencyCode,
} from "@spend-circle/domain";
import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { TransactionForm } from "~/components/transaction-form.js";
import { Button } from "~/components/ui/button.js";
import {
  type Circle,
  type MonthlySummary,
  type PaginatedTransactions,
  type Transaction,
  type TransactionStatus,
  useArchiveTransaction,
  useMonthlyLedger,
  useRestoreTransaction,
} from "~/lib/data.js";
import { ledgerSearch, withQuery } from "~/lib/ledger-url.js";
import { viewerLocale } from "~/lib/locale.js";
import { useSnackbar } from "~/lib/snackbar.js";
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

  // The list status the toggle selects: the month's active Transactions (default) or
  // its archived ones (TXN-3 — the surface the Restore affordance reads). Only the
  // explicit "archived" value switches; anything else (incl. absent) is active.
  const rawView = searchParams.get("view");
  const archivedView = rawView === "archived";
  const status: TransactionStatus = archivedView ? "archived" : "active";

  const rawNew = searchParams.get("new");
  // The open create form's type, or null. Creating belongs to the active view only and a
  // read-only Circle drops the form entirely (the write surface collapses — ADR 0017),
  // so `new` only opens a form on a writable Circle in the active view. An invalid value
  // is treated as no form (and dropped below).
  const createType: TransactionType | null =
    writable && !archivedView && (rawNew === "expense" || rawNew === "income") ? rawNew : null;

  // Normalize malformed/unsupported UI query state with REPLACE navigation rather than
  // treating it as an unavailable object (ADR 0017): backfill a missing/invalid month to
  // the current month, drop a redundant `view=active` (active is the absent default) and
  // an invalid `view`, and drop a `new` that is invalid or not allowed here (read-only
  // Circle, or the archived view where creating doesn't apply). Replace so these
  // corrections never litter the Back stack.
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    let changed = false;
    if (!monthValid) {
      next.set("month", month);
      changed = true;
    }
    if (rawView !== null && rawView !== "archived") {
      next.delete("view");
      changed = true;
    }
    const newAllowed = writable && !archivedView && (rawNew === "expense" || rawNew === "income");
    if (rawNew !== null && !newAllowed) {
      next.delete("new");
      changed = true;
    }
    if (changed) {
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, monthValid, month, rawNew, rawView, archivedView, writable, setSearchParams]);

  const { summary, transactions } = useMonthlyLedger(circle.id, month, { status });

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

  // Toggle the active/archived list (TXN-3): set `view=archived` or drop the param for
  // the active default, keeping the month. Switching to a view also closes any open
  // create form (`new`) since it only applies to the active view. PUSH so Back returns
  // to the prior view.
  const goToView = (next: TransactionStatus) => {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      params.set("month", month);
      params.delete("new");
      if (next === "archived") {
        params.set("view", "archived");
      } else {
        params.delete("view");
      }
      return params;
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Transactions</h2>
        {writable && !archivedView ? (
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

      <ViewToggle archivedView={archivedView} onChange={goToView} />

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
        archivedView={archivedView}
      />
    </div>
  );
}

/**
 * Active / Archived list switch for the Ledger (TXN-3). The archived view is where an
 * Archived Transaction is restorable; the active view is the normal surface. Two
 * `aria-pressed` toggle buttons (not a `<select>`) so the state is announced and
 * keyboard-operable, owned by the `view` URL param so it survives reload (ADR 0017).
 */
function ViewToggle({
  archivedView,
  onChange,
}: {
  archivedView: boolean;
  onChange: (status: TransactionStatus) => void;
}) {
  const options: { status: TransactionStatus; label: string; active: boolean }[] = [
    { status: "active", label: "Active", active: !archivedView },
    { status: "archived", label: "Archived", active: archivedView },
  ];
  return (
    <fieldset className="flex items-center gap-2">
      <legend className="sr-only">Show active or archived transactions</legend>
      {options.map((option) => (
        <button
          key={option.status}
          type="button"
          aria-pressed={option.active}
          onClick={() => onChange(option.status)}
          className={cn(
            "rounded-md border px-3 py-1 text-sm transition-colors",
            option.active
              ? "border-neutral-100 bg-neutral-100 text-neutral-900"
              : "border-neutral-700 text-neutral-300 hover:text-neutral-100",
          )}
        >
          {option.label}
        </button>
      ))}
    </fieldset>
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
 * jumps to any month.
 *
 * The native `<input type="month">` is UNCONTROLLED (`defaultValue` + a ref), not a
 * React-controlled `value`. Typing a 4-digit year is a multi-keystroke edit of the
 * year segment, and writing `value` back into the control mid-edit — from ANY source,
 * even synchronous local state — resets the browser's in-progress segment buffer and
 * drops digits (the TXN-5 regression: month moved from synchronous local state to async
 * URL state, but reflecting any value back is the real fault). Leaving the input
 * uncontrolled lets the browser fully own segment editing, so the whole year always
 * registers; we push external month changes (prev/next, a deep link, normalization)
 * into the DOM through the ref, and read the value back only on commit.
 *
 * Commit happens on blur / Enter, not per keystroke: typing "2026" navigates ONCE to
 * the finished month, never pushing junk history entries (and ledger queries) for the
 * transient 0002 → 0020 → 0202 the year segment emits while filling. Only a valid
 * "YYYY-MM" commits; the native control clears to "" when emptied and degrades to a
 * free-text field (out-of-range/garbage) where the browser has no real month picker —
 * both make the ledger queries throw `Invalid month` (ledger.ts/transactions.ts), so an
 * invalid/partial value reverts to the selected month rather than committing. With that
 * guard `month` is always valid, so the prev/next `addMonths` never sees NaN.
 */
function MonthNavigator({
  month,
  onChange,
}: {
  month: PlainMonth;
  onChange: (month: PlainMonth) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  // The input is uncontrolled, so `defaultValue` only seeds the first mount; push later
  // external month changes (prev/next, deep link, normalization) into the DOM directly.
  // Guarded on inequality so this never clobbers a value the user is mid-typing.
  useEffect(() => {
    const input = inputRef.current;
    if (input && input.value !== month) {
      input.value = month;
    }
  }, [month]);

  const commit = () => {
    const input = inputRef.current;
    if (!input) {
      return;
    }
    if (isValidPlainMonth(input.value)) {
      if (input.value !== month) {
        onChange(input.value);
      }
    } else {
      input.value = month; // revert a cleared/partial value to the selected month
    }
  };

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
        ref={inputRef}
        id="ledger-month"
        type="month"
        defaultValue={month}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            commit();
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
              {stat.amount === undefined
                ? "…"
                : formatMoney(money(stat.amount, currency), viewerLocale())}
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
 *
 * Archive / Restore are the TXN-3 lifecycle actions, gated on `canArchive` (the Recorded
 * By Member OR the Owner — server-enforced moderation, not a field-edit backdoor) and a
 * writable Circle. In the ACTIVE view a row offers Edit + Archive; in the ARCHIVED view
 * a row is FROZEN — no Edit affordance — and offers only Restore.
 */
function TransactionList({
  paginated,
  circle,
  month,
  monthLabel,
  canEdit,
  archivedView,
}: {
  paginated: PaginatedTransactions;
  circle: Circle;
  month: PlainMonth;
  monthLabel: string;
  canEdit: boolean;
  archivedView: boolean;
}) {
  const { transactions, status, loadMore } = paginated;

  if (status === "LoadingFirstPage") {
    return <p className="text-sm text-neutral-500">Loading transactions…</p>;
  }
  // An inaccessible Circle (ADR 0016) and a month with no Transactions of this status
  // both arrive as an empty page — the Circle guard already gated entry, so treat both
  // as nothing to show, naming the month (and whether this is the archived view) so an
  // empty view reads as "this month is empty" rather than "this circle is empty".
  if (transactions.length === 0) {
    return (
      <p className="text-sm text-neutral-500">
        {archivedView
          ? `No archived transactions in ${monthLabel}.`
          : `No transactions in ${monthLabel}.`}
      </p>
    );
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
              {/* The title is a canonical object LINK to the Transaction detail surface
                  (TXN-4) — Audit Metadata + Transaction History. A real, shareable,
                  reload-safe URL (ADR 0016), available for active and archived rows alike
                  (detail is a read surface). It carries the ledger slice (month + view) so
                  the detail's Back link returns to THIS slice, matching the Edit link's
                  month preservation. */}
              <p className="truncate text-sm font-medium">
                <Link
                  to={withQuery(
                    `/circles/${circle.ref}/transactions/${txn.ref}`,
                    ledgerSearch({ month, status: archivedView ? "archived" : "active" }),
                  )}
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
            {/* Active rows can be edited (recorder only) + archived; archived rows are
                frozen (no Edit) and can only be restored. */}
            {!archivedView && canEdit && txn.canEditFields ? (
              <Button asChild variant="outline">
                <Link
                  to={`/circles/${circle.ref}/transactions/${txn.ref}/edit?month=${month}`}
                  aria-label={`Edit ${txn.title}`}
                >
                  Edit
                </Link>
              </Button>
            ) : null}
            {canEdit && txn.canArchive ? (
              <LifecycleButton transaction={txn} action={archivedView ? "restore" : "archive"} />
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

/**
 * The Archive / Restore button for one Transaction row (TXN-3). The mutation is the
 * authority on the permission and the writable-Circle rule (ADR 0015); this disables
 * itself while in flight (guarding double-submit) and surfaces an unexpected failure
 * through the snackbar rather than swallowing it (README §4 no silent failures). On
 * success the reactive list drops the row from this view — no manual navigation. The
 * `aria-label` names the Transaction so the action is unambiguous to assistive tech.
 */
const LIFECYCLE_COPY = {
  archive: { idle: "Archive", busy: "Archiving…", error: "Couldn't archive the transaction." },
  restore: { idle: "Restore", busy: "Restoring…", error: "Couldn't restore the transaction." },
} as const;

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
      // The reactive list re-queries and drops the row from this view on success.
    } catch (error) {
      // Known guard rejections (permission, archived Circle) can't normally be reached
      // from here (the affordance is already gated), so anything thrown is unexpected:
      // surface it (Sentry once it lands — ADR 0012) and tell the user, never swallow.
      console.error(`${action}Transaction failed`, error);
      show(`${copy.error} Please try again.`);
      setPending(false); // keep the row actionable for a retry
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
