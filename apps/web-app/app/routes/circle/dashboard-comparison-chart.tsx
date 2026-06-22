import { formatMoney, getCurrency, money, toCurrencyCode } from "@spend-circle/domain";
import { useMemo } from "react";
import { Link, useNavigate } from "react-router";
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
import type { MonthlyComparison } from "~/lib/data.js";
import { formatMonthLabel, formatMonthTick } from "~/lib/datetime.js";
import { ledgerDrilldownHref } from "~/lib/ledger-url.js";
import { viewerLocale } from "~/lib/locale.js";

export function DashboardComparisonChart({
  comparison,
  circleRef,
}: {
  comparison: MonthlyComparison;
  circleRef: string;
}) {
  const navigate = useNavigate();
  const currency = toCurrencyCode(comparison.currency);
  const locale = viewerLocale();
  const formatMinor = (minorUnits: number) => formatMoney(money(minorUnits, currency), locale);
  const compactTick = useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        style: "currency",
        currency,
        notation: "compact",
      }),
    [locale, currency],
  );
  const formatTick = (minorUnits: number) =>
    compactTick.format(minorUnits / 10 ** getCurrency(currency).decimals);

  const monthHref = (month: string) => ledgerDrilldownHref({ ref: circleRef }, { month });

  const navigateToMonth = (payload: unknown) => {
    if (
      payload &&
      typeof payload === "object" &&
      "month" in payload &&
      typeof payload.month === "string"
    ) {
      navigate(monthHref(payload.month));
    }
  };

  return (
    <>
      <div
        aria-hidden="true"
        className="h-72 rounded-xl border border-border bg-card p-3 shadow-sm"
      >
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
            <Bar
              dataKey="incomeMinor"
              name="Income"
              fill="var(--positive)"
              radius={[3, 3, 0, 0]}
              className="cursor-pointer"
              onClick={(bar) => navigateToMonth(bar?.payload)}
            />
            <Bar
              dataKey="expenseMinor"
              name="Expense"
              fill="var(--destructive)"
              radius={[3, 3, 0, 0]}
              className="cursor-pointer"
              onClick={(bar) => navigateToMonth(bar?.payload)}
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
              <th scope="row">
                <Link to={monthHref(entry.month)}>{formatMonthLabel(entry.month)}</Link>
              </th>
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
