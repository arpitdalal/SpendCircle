import {
  COMPARISON_RANGE_OPTIONS,
  type ComparisonRangeMonths,
  currentMonth,
  formatMoney,
  getCurrency,
  isComparisonRangeMonths,
  money,
  toCurrencyCode,
} from "@spend-circle/domain";
import { useEffect } from "react";
import { Link, useSearchParams } from "react-router";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { RowsSkeleton, Skeleton, SkeletonRegion } from "~/components/skeleton.js";
import {
  canonicalDashboardParams,
  type DashboardSelection,
  readDashboardSelection,
} from "~/lib/dashboard-url.js";
import {
  type Circle,
  type Dashboard,
  type DashboardTotals,
  type Member,
  type MonthlyComparison,
  type Transaction,
  useDashboard,
  useMonthlyComparison,
  usePaidByFilterOptions,
} from "~/lib/data.js";
import { formatMonthLabel, formatMonthTick } from "~/lib/datetime.js";
import { transactionDetailHref } from "~/lib/ledger-url.js";
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
 * Transactions).
 *
 * The Paid By filter and the Comparison Range live in the URL (`dashboard-url.ts` —
 * the Ledger's URL-as-state policy), so a narrowed Dashboard survives reload and can
 * be shared; selection changes push history entries so Back walks them. The URL's
 * `paidBy` id is only TRUSTED once the loaded options vouch for it: until they
 * resolve, both money queries are held (`enabled: false`, reading as loading) so an
 * unverified id never reaches the backend and unfiltered totals never flash where a
 * filtered view was deep-linked; an id the options do not know (stale link, removed
 * relevance, hand-edited URL) is cleaned back to All members — the same observable
 * result as any other unknown id (ADR 0016).
 */
export default function CircleDashboard() {
  const circle = useCircle();
  const month = currentMonth(new Date());
  const [searchParams, setSearchParams] = useSearchParams();
  const selection = readDashboardSelection(searchParams);

  const filterOptions = usePaidByFilterOptions(circle.id);
  // The URL carries a raw id; the loaded options are the validator. `undefined`
  // means "not vouched for (yet)" — either still loading or unknown.
  const paidByMemberId = selection.paidBy
    ? filterOptions?.find((member) => member.id === selection.paidBy)?.id
    : undefined;
  const awaitingPaidBy = selection.paidBy !== "" && filterOptions === undefined;

  // Drop a paidBy the loaded options do not know — mirroring the Ledger's
  // dropUnknownIds cleanup — so the URL never keeps naming a filter that isn't
  // applied. Range needs no cleanup: a malformed value already READS as the default.
  useEffect(() => {
    if (selection.paidBy && filterOptions && !paidByMemberId) {
      setSearchParams(canonicalDashboardParams({ ...selection, paidBy: "" }, searchParams), {
        replace: true,
      });
    }
  }, [selection, filterOptions, paidByMemberId, searchParams, setSearchParams]);

  const dashboard = useDashboard(circle.id, {
    month,
    paidByMemberId,
    enabled: !awaitingPaidBy,
  });
  const comparison = useMonthlyComparison(circle.id, {
    endMonth: month,
    rangeMonths: selection.range,
    paidByMemberId,
    enabled: !awaitingPaidBy,
  });

  const select = (next: DashboardSelection) => {
    setSearchParams(canonicalDashboardParams(next, searchParams), { replace: false });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold tracking-tight">Dashboard</h2>
        <PaidByFilter
          options={filterOptions}
          value={paidByMemberId}
          onChange={(memberId) => select({ ...selection, paidBy: memberId ?? "" })}
        />
      </div>

      <DashboardTotalsCards dashboard={dashboard} fallbackCurrency={circle.currency} />
      <MonthlyComparisonSection
        comparison={comparison}
        rangeMonths={selection.range}
        onRangeChange={(range) => select({ ...selection, range })}
      />
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
      <label htmlFor="dashboard-paid-by" className="text-xs text-muted-foreground">
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
        className="rounded-md border border-input bg-card px-3 py-2 text-sm shadow-sm outline-none transition-[border-color,box-shadow] duration-150 focus:border-ring focus:ring-2 focus:ring-ring/30 disabled:opacity-50"
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
    { label: "Income", amount: totals?.incomeMinor, tone: "text-positive" },
    { label: "Expenses", amount: totals?.expenseMinor, tone: "text-foreground" },
    {
      label: "Net",
      amount: totals?.netMinor,
      tone: (totals?.netMinor ?? 0) >= 0 ? "text-positive" : "text-destructive",
    },
  ];

  return (
    <fieldset aria-busy={totals === undefined}>
      <legend className="sr-only">This month's totals</legend>
      <dl className="grid grid-cols-3 gap-3">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <dt className="text-xs text-muted-foreground">{stat.label}</dt>
            <dd
              className={cn(
                "mt-1 font-display text-lg font-semibold tabular-nums sm:text-2xl",
                stat.tone,
              )}
            >
              {stat.amount === undefined ? (
                <Skeleton className="mt-1 h-6 w-20" />
              ) : (
                formatMoney(money(stat.amount, currency), viewerLocale())
              )}
            </dd>
          </div>
        ))}
      </dl>
    </fieldset>
  );
}

/**
 * The month-over-month comparison (RPT-4; PRD stories 70, 71, 72): grouped Income /
 * Expense bars with a Net line overlay (Recharts — ADR 0005) over the selected
 * Comparison Range (1/3/6/12 months, default 6 — CONTEXT glossary), ending at the
 * current month. The series arrives chronological, zero-filled, and in minor units;
 * this surface only formats (ADR 0009) — axes/tooltips in the viewer locale and the
 * Circle Currency. It shares the Dashboard's Paid By filter, so the chart always
 * describes the same activity as the totals cards.
 *
 * The chart SVG is presentational (`aria-hidden`): its colors are a visual cue only
 * (CONTEXT: never identify by color alone — the legend and tooltip carry the names),
 * and the SAME series renders as a visually-hidden table — the accessible (and
 * jsdom-testable) reading of the chart, with month labels and formatted money.
 */
function MonthlyComparisonSection({
  comparison,
  rangeMonths,
  onRangeChange,
}: {
  comparison: MonthlyComparison | null | undefined;
  rangeMonths: ComparisonRangeMonths;
  onRangeChange: (rangeMonths: ComparisonRangeMonths) => void;
}) {
  return (
    <section className="space-y-3" aria-labelledby="dashboard-comparison-heading">
      <div className="flex items-center justify-between gap-3">
        <h3 id="dashboard-comparison-heading" className="text-sm font-semibold text-foreground">
          Month-over-month
        </h3>
        <div className="flex items-center gap-2">
          <label htmlFor="dashboard-comparison-range" className="text-xs text-muted-foreground">
            Range
          </label>
          <select
            id="dashboard-comparison-range"
            value={rangeMonths}
            onChange={(event) => {
              // The DOM emits a string; narrow it back to a supported Comparison
              // Range (the only values the options offer).
              const next = Number(event.target.value);
              if (isComparisonRangeMonths(next)) {
                onRangeChange(next);
              }
            }}
            className="rounded-md border border-input bg-card px-3 py-2 text-sm shadow-sm outline-none transition-[border-color,box-shadow] duration-150 focus:border-ring focus:ring-2 focus:ring-ring/30"
          >
            {COMPARISON_RANGE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option === 1 ? "1 month" : `${option} months`}
              </option>
            ))}
          </select>
        </div>
      </div>

      {comparison === undefined ? (
        <SkeletonRegion label="Loading comparison…" testId="comparison-skeleton">
          <Skeleton className="h-72 w-full rounded-xl" />
        </SkeletonRegion>
      ) : !comparison ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No comparison available.
        </p>
      ) : (
        <ComparisonChart comparison={comparison} />
      )}
    </section>
  );
}

function ComparisonChart({ comparison }: { comparison: MonthlyComparison }) {
  const currency = toCurrencyCode(comparison.currency);
  const locale = viewerLocale();
  const formatMinor = (minorUnits: number) => formatMoney(money(minorUnits, currency), locale);
  // Compact axis ticks (e.g. "$5K") — the tooltip and table carry exact values.
  const compactTick = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    notation: "compact",
  });
  const formatTick = (minorUnits: number) =>
    compactTick.format(minorUnits / 10 ** getCurrency(currency).decimals);

  return (
    <>
      <div
        aria-hidden="true"
        className="h-72 rounded-xl border border-border bg-card p-3 shadow-sm"
      >
        {/* initialDimension seeds the first paint before ResizeObserver reports the
            real box — without it Recharts measures -1 and warns on every mount. */}
        <ResponsiveContainer
          width="100%"
          height="100%"
          initialDimension={{ width: 600, height: 260 }}
        >
          <ComposedChart data={comparison.series} barGap={2}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="month"
              tickFormatter={formatMonthTick}
              tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
              tickLine={false}
              axisLine={{ stroke: "var(--border)" }}
            />
            <YAxis
              tickFormatter={formatTick}
              tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              width={64}
            />
            <Tooltip
              formatter={(value: unknown, name: unknown) => [
                typeof value === "number" ? formatMinor(value) : "",
                typeof name === "string" ? name : "",
              ]}
              labelFormatter={(label: unknown) =>
                typeof label === "string" ? formatMonthLabel(label) : ""
              }
              cursor={{ fill: "var(--muted)" }}
              contentStyle={{
                backgroundColor: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: "0.5rem",
                color: "var(--foreground)",
              }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="incomeMinor" name="Income" fill="var(--positive)" radius={[3, 3, 0, 0]} />
            <Bar
              dataKey="expenseMinor"
              name="Expense"
              fill="var(--destructive)"
              radius={[3, 3, 0, 0]}
            />
            <Line
              type="monotone"
              dataKey="netMinor"
              name="Net"
              stroke="var(--primary)"
              strokeWidth={2}
              dot={{ r: 3, fill: "var(--primary)" }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <table className="sr-only">
        <caption>Month-over-month Income, Expense, and Net</caption>
        <thead>
          <tr>
            <th scope="col">Month</th>
            <th scope="col">Income</th>
            <th scope="col">Expense</th>
            <th scope="col">Net</th>
          </tr>
        </thead>
        <tbody>
          {comparison.series.map((entry) => (
            <tr key={entry.month}>
              <th scope="row">{formatMonthLabel(entry.month)}</th>
              <td>{formatMinor(entry.incomeMinor)}</td>
              <td>{formatMinor(entry.expenseMinor)}</td>
              <td>{formatMinor(entry.netMinor)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

/**
 * The recent-Transactions feed (PRD 75): the latest active Transactions by record
 * time, money formatted in the Circle Currency. Each row's title links to the TXN-4
 * detail route with the dashboard month in the query (ADR 0017), matching the Ledger
 * row links. `dashboard` is `undefined` while loading; an empty feed reads as "no recent
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
      <h3 id="dashboard-recent-heading" className="text-sm font-semibold text-foreground">
        Recent activity
      </h3>
      {dashboard === undefined ? (
        <SkeletonRegion label="Loading recent activity…" testId="recent-skeleton">
          <RowsSkeleton rows={4} />
        </SkeletonRegion>
      ) : !dashboard || dashboard.recent.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No recent activity.
        </p>
      ) : (
        <ul className="space-y-2">
          {dashboard.recent.map((txn) => (
            <RecentRow
              key={txn.id}
              circle={circle}
              txn={txn}
              currency={currency}
              month={dashboard.month}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function RecentRow({
  circle,
  txn,
  currency,
  month,
}: {
  circle: Circle;
  txn: Transaction;
  currency: ReturnType<typeof toCurrencyCode>;
  month: Dashboard["month"];
}) {
  return (
    <li className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 shadow-sm">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">
          <Link
            to={transactionDetailHref(circle, txn, month)}
            className="hover:underline"
            aria-label={`View ${txn.title}`}
          >
            {txn.title}
          </Link>
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {txn.date} · {txn.categories.map((category) => category.name).join(", ")} ·{" "}
          {txn.paidBy.displayName}
        </p>
      </div>
      <span
        className={cn(
          "ml-auto text-sm font-semibold tabular-nums",
          txn.type === "income" ? "text-positive" : "text-foreground",
        )}
      >
        {txn.type === "income" ? "+" : "-"}
        {formatMoney(money(txn.amountMinorUnits, currency), viewerLocale())}
      </span>
    </li>
  );
}
