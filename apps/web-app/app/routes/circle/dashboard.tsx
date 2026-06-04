import { currentMonth, formatMoney, money, toCurrencyCode } from "@spend-circle/domain";
import { useState } from "react";
import {
  type Circle,
  type Dashboard,
  type DashboardTotals,
  type Member,
  type Transaction,
  useDashboard,
  usePaidByFilterOptions,
} from "~/lib/data.js";
import { viewerLocale } from "~/lib/locale.js";
import { cn } from "~/lib/utils.js";
import { useCircle } from "~/routes/layouts/circle-layout.js";

/**
 * The per-Circle Dashboard (RPT-3; PRD stories 68, 69, 75) — the Circle index route.
 * Shows the CURRENT month's Income / Expense / Net totals and a recent-Transactions
 * feed, with a Paid By filter that narrows BOTH to one Member so you can inspect one
 * person's activity. Only active Transactions count (archived excluded — TXN-3).
 *
 * The month is the User's LOCAL current month (`currentMonth(new Date())`) so the
 * Dashboard reads as "this month" for them; month navigation and month-over-month
 * comparison are RPT-4, category breakdown RPT-5, and drilldowns RPT-6 — this slice
 * is the totals + recent surface they build on.
 *
 * Totals and recent come from `getDashboard` (a bounded server-side aggregate over the
 * month — never summed on the client, ADR 0009); the Paid By options come from
 * `getPaidByFilterOptions` (current Members + Removed Members with matching active
 * Transactions). The filter is local component state: the Dashboard is a single-month
 * inspection surface, so the selection is transient rather than URL-encoded.
 */
export default function CircleDashboard() {
  const circle = useCircle();
  const month = currentMonth(new Date());
  const [paidByMemberId, setPaidByMemberId] = useState<Member["id"] | undefined>(undefined);

  const dashboard = useDashboard(circle.id, { month, paidByMemberId });
  const filterOptions = usePaidByFilterOptions(circle.id);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Dashboard</h2>
        <PaidByFilter options={filterOptions} value={paidByMemberId} onChange={setPaidByMemberId} />
      </div>

      <DashboardTotalsCards dashboard={dashboard} fallbackCurrency={circle.currency} />
      <RecentTransactions dashboard={dashboard} circle={circle} />
    </div>
  );
}

/**
 * The Paid By filter (PRD 69): "All members" plus each selectable Member; a Removed
 * Member option is labelled so it reads distinctly (CONTEXT Paid By — Removed Members
 * stay selectable when matching Transactions exist). A native `<select>` with an
 * associated label keeps it keyboard-operable and accessible (README §4). While the
 * options load it renders with just "All members" and is disabled; `null`
 * (inaccessible Circle) is handled a layer up by the guard, so it is treated as no
 * extra options here.
 */
function PaidByFilter({
  options,
  value,
  onChange,
}: {
  options: Member[] | null | undefined;
  value: Member["id"] | undefined;
  onChange: (value: Member["id"] | undefined) => void;
}) {
  const members = options ?? [];
  const loading = options === undefined;

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="dashboard-paid-by" className="text-xs text-neutral-500">
        Paid by
      </label>
      <select
        id="dashboard-paid-by"
        value={value ?? ""}
        disabled={loading}
        onChange={(event) =>
          // The branded Member id is the option's own value, narrowed back from the
          // string the DOM emits; "" is the "All members" sentinel (no filter).
          onChange(members.find((member) => member.id === event.target.value)?.id)
        }
        className="rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm outline-none transition-colors focus:border-neutral-400 disabled:opacity-50"
      >
        <option value="">All members</option>
        {members.map((member) => (
          <option key={member.id} value={member.id}>
            {member.displayName}
            {member.status === "removed" ? " (removed)" : ""}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * The current month's Income / Expense / Net cards. Totals are minor units summed
 * server-side and formatted ONCE here in the Circle Currency (ADR 0009) — never summed
 * from formatted strings. `dashboard` is `undefined` while loading (placeholders shown)
 * and `null` only for an inaccessible Circle (the guard ejects before this renders);
 * the currency falls back to the Circle's until the Dashboard resolves.
 */
function DashboardTotalsCards({
  dashboard,
  fallbackCurrency,
}: {
  dashboard: Dashboard | null | undefined;
  fallbackCurrency: string;
}) {
  const currency = toCurrencyCode(dashboard?.currency ?? fallbackCurrency);
  const totals: DashboardTotals | undefined = dashboard?.totals;
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
      <legend className="sr-only">This month's totals</legend>
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
 * The recent-Transactions feed (PRD 75): the latest active Transactions by record
 * time, money formatted in the Circle Currency. Rows are display-only for now — the
 * Transaction detail route they will deep-link to is TXN-4, and object routes land
 * WITH their feature (README §4), so this does not link to a route that does not yet
 * exist. `dashboard` is `undefined` while loading; an empty feed reads as "no recent
 * activity" for the selected scope (which the Paid By filter may have narrowed).
 */
function RecentTransactions({
  dashboard,
  circle,
}: {
  dashboard: Dashboard | null | undefined;
  circle: Circle;
}) {
  const currency = toCurrencyCode(circle.currency);

  return (
    <section className="space-y-3" aria-labelledby="dashboard-recent-heading">
      <h3 id="dashboard-recent-heading" className="text-sm font-semibold text-neutral-300">
        Recent activity
      </h3>
      {dashboard === undefined ? (
        <p className="text-sm text-neutral-500">Loading recent activity…</p>
      ) : !dashboard || dashboard.recent.length === 0 ? (
        <p className="text-sm text-neutral-500">No recent activity.</p>
      ) : (
        <ul className="space-y-2">
          {dashboard.recent.map((txn) => (
            <RecentRow key={txn.id} txn={txn} currency={currency} />
          ))}
        </ul>
      )}
    </section>
  );
}

function RecentRow({
  txn,
  currency,
}: {
  txn: Transaction;
  currency: ReturnType<typeof toCurrencyCode>;
}) {
  return (
    <li className="flex items-center gap-3 rounded-md border border-neutral-800 px-3 py-2">
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
        {formatMoney(money(txn.amountMinorUnits, currency), viewerLocale())}
      </span>
    </li>
  );
}
