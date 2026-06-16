import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Dashboard, Member, MonthlyComparison, Transaction } from "~/lib/data.js";
import {
  configureConvex,
  makeCircleView,
  makeMemberView,
  makeTransactionView,
  renderCircleRoutes,
  renderInCircle,
  testId,
} from "~/test/convex-react.js";

/**
 * Behavior test for the Dashboard route (jsdom). Doubles ONLY Convex's reactive client
 * (via the shared helper) and runs the REAL route + real `~/lib/data.js` hooks against
 * it (ADR 0006), so the totals cards, recent feed, and the Paid By filter's re-query
 * are exercised exactly as in the app.
 */
vi.mock("convex/react", async () => (await import("~/test/convex-react.js")).convexReactMock);

import CircleDashboard from "./dashboard.js";

function makeDashboard(over: Partial<Dashboard> = {}): Dashboard {
  return {
    totals: { incomeMinor: 500_000, expenseMinor: 8_750, netMinor: 491_250 },
    recent: [],
    currency: "USD",
    month: "2026-06",
    ...over,
  };
}

afterEach(() => {
  // restoreAllMocks (not just clear) so a per-test navigator.language spy does not
  // leak its locale into later tests.
  vi.restoreAllMocks();
});

describe("Dashboard totals", () => {
  it("renders Income / Expenses / Net formatted in the Circle Currency", () => {
    configureConvex({ dashboard: makeDashboard() });
    renderInCircle(makeCircleView(), <CircleDashboard />);

    expect(screen.getByText("$5,000.00")).toBeInTheDocument(); // income
    expect(screen.getByText("$87.50")).toBeInTheDocument(); // expenses
    expect(screen.getByText("$4,912.50")).toBeInTheDocument(); // net
  });

  it("formats money in the viewer locale, disambiguating USD for a non-US viewer", () => {
    // The viewer's locale (navigator.language) drives presentation, NOT the
    // ambient runtime locale (ADR 0021). A Canadian-style viewer sees USD
    // qualified as US$ so it is not confused with the local dollar.
    vi.spyOn(window.navigator, "language", "get").mockReturnValue("en-CA");
    configureConvex({ dashboard: makeDashboard() });
    renderInCircle(makeCircleView(), <CircleDashboard />);

    expect(screen.getByText("US$5,000.00")).toBeInTheDocument(); // income
    expect(screen.getByText("US$87.50")).toBeInTheDocument(); // expenses
  });

  it("shows skeletons while the dashboard loads", () => {
    // A function returning `undefined` models the reactive query still loading
    // (passing `dashboard: undefined` would hit the helper's EMPTY_DASHBOARD default).
    configureConvex({ dashboard: () => undefined });
    renderInCircle(makeCircleView(), <CircleDashboard />);

    // The totals grid reads as busy and the recent feed shows its skeleton placeholder.
    expect(screen.getByText(/this month's totals/i).closest("fieldset")).toHaveAttribute(
      "aria-busy",
      "true",
    );
    expect(screen.getByTestId("recent-skeleton")).toBeInTheDocument();
    // Exactly ONE polite announcement covers the whole surface (not one per widget),
    // and the per-widget placeholders stay out of the a11y tree (aria-hidden).
    const statuses = screen.getAllByRole("status");
    expect(statuses).toHaveLength(1);
    expect(statuses[0]).toHaveTextContent(/loading dashboard/i);
  });
});

describe("Dashboard recent feed", () => {
  it("renders recent rows with title, paid-by, and signed amount", () => {
    const recent: Transaction[] = [
      makeTransactionView({
        id: testId<Transaction["id"]>("t-income"),
        type: "income",
        title: "Paycheck",
        ref: "paycheck-t1",
        amountMinorUnits: 500_000,
        paidBy: { id: testId<Member["id"]>("mem-you"), displayName: "You", image: undefined },
      }),
      makeTransactionView({
        id: testId<Transaction["id"]>("t-expense"),
        type: "expense",
        title: "Groceries",
        ref: "groceries-t1",
        amountMinorUnits: 7_350,
        paidBy: { id: testId<Member["id"]>("mem-alex"), displayName: "Alex", image: undefined },
      }),
    ];
    configureConvex({ dashboard: makeDashboard({ recent }) });
    renderInCircle(makeCircleView(), <CircleDashboard />);

    const feed = screen.getByRole("region", { name: /recent activity/i });
    expect(within(feed).getByRole("link", { name: /view paycheck/i })).toHaveAttribute(
      "href",
      "/circles/trip-c1/transactions/paycheck-t1?month=2026-06",
    );
    expect(within(feed).getByRole("link", { name: /view groceries/i })).toHaveAttribute(
      "href",
      "/circles/trip-c1/transactions/groceries-t1?month=2026-06",
    );
    expect(within(feed).getByText("+$5,000.00")).toBeInTheDocument();
    expect(within(feed).getByText("Groceries")).toBeInTheDocument();
    expect(within(feed).getByText("-$73.50")).toBeInTheDocument();
    expect(within(feed).getByText(/Alex/)).toBeInTheDocument();
  });

  it("shows an empty state when there is no recent activity", () => {
    configureConvex({ dashboard: makeDashboard({ recent: [] }) });
    renderInCircle(makeCircleView(), <CircleDashboard />);
    expect(screen.getByText(/no recent activity/i)).toBeInTheDocument();
  });
});

describe("Dashboard month-over-month comparison (RPT-4)", () => {
  /** A fixed three-month series so labels/amounts are deterministic regardless of
   * the runner's clock (the route asks for the CURRENT month's window, but the
   * surface renders whatever series the backend returns). */
  const THREE_MONTHS: MonthlyComparison = {
    series: [
      { month: "2026-04", incomeMinor: 500_000, expenseMinor: 1_250, netMinor: 498_750 },
      { month: "2026-05", incomeMinor: 0, expenseMinor: 7_500, netMinor: -7_500 },
      { month: "2026-06", incomeMinor: 2_000, expenseMinor: 9_000, netMinor: -7_000 },
    ],
    currency: "USD",
  };

  it("renders the chronological series with money formatted in the Circle Currency", () => {
    configureConvex({ monthlyComparison: THREE_MONTHS });
    renderInCircle(makeCircleView(), <CircleDashboard />);

    const section = screen.getByRole("region", { name: /month-over-month/i });
    const rows = within(section).getAllByRole("row");
    // Header row + one row per month, chronological.
    expect(rows).toHaveLength(4);
    expect(rows[1]).toHaveTextContent("April 2026");
    expect(rows[1]).toHaveTextContent("$5,000.00");
    expect(rows[1]).toHaveTextContent("$12.50");
    expect(rows[1]).toHaveTextContent("$4,987.50");
    expect(rows[2]).toHaveTextContent("May 2026");
    expect(rows[2]).toHaveTextContent("-$75.00"); // negative net
    expect(rows[3]).toHaveTextContent("June 2026");
  });

  it("defaults the Comparison Range to 6 months and offers 1/3/6/12", () => {
    configureConvex({});
    renderInCircle(makeCircleView(), <CircleDashboard />);

    const select = screen.getByLabelText(/range/i);
    expect(select).toHaveValue("6");
    const labels = within(select)
      .getAllByRole("option")
      .map((option) => option.textContent);
    expect(labels).toEqual(["1 month", "3 months", "6 months", "12 months"]);
  });

  it("re-queries the series for the selected range", async () => {
    // The double's default models the backend: a zero series sized to the queried
    // rangeMonths — so the month count visible in the table tracks the selection.
    configureConvex({});
    renderInCircle(makeCircleView(), <CircleDashboard />);

    const section = screen.getByRole("region", { name: /month-over-month/i });
    expect(within(section).getAllByRole("row")).toHaveLength(7); // header + 6

    await userEvent.selectOptions(screen.getByLabelText(/range/i), "3");
    expect(within(section).getAllByRole("row")).toHaveLength(4); // header + 3

    await userEvent.selectOptions(screen.getByLabelText(/range/i), "12");
    expect(within(section).getAllByRole("row")).toHaveLength(13); // header + 12
  });

  it("shares the Paid By filter: selecting a Member narrows the comparison query", async () => {
    const alex = makeMemberView({
      id: testId<Member["id"]>("mem-alex"),
      displayName: "Alex",
      role: "member",
      isSelf: false,
    });
    configureConvex({
      paidByFilterOptions: [alex],
      monthlyComparison: (args) =>
        args.paidByMemberId === "mem-alex"
          ? {
              series: [{ month: "2026-06", incomeMinor: 0, expenseMinor: 2_500, netMinor: -2_500 }],
              currency: "USD",
            }
          : {
              series: [
                { month: "2026-06", incomeMinor: 0, expenseMinor: 10_000, netMinor: -10_000 },
              ],
              currency: "USD",
            },
    });
    renderInCircle(makeCircleView(), <CircleDashboard />);

    const section = screen.getByRole("region", { name: /month-over-month/i });
    expect(within(section).getByText("$100.00")).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText(/paid by/i), "mem-alex");
    expect(within(section).getByText("$25.00")).toBeInTheDocument();
    expect(within(section).queryByText("$100.00")).not.toBeInTheDocument();
  });

  it("shows a skeleton while the comparison loads", () => {
    configureConvex({ monthlyComparison: () => undefined });
    renderInCircle(makeCircleView(), <CircleDashboard />);
    expect(screen.getByTestId("comparison-skeleton")).toBeInTheDocument();
  });

  it("formats the series in the viewer locale", () => {
    vi.spyOn(window.navigator, "language", "get").mockReturnValue("en-CA");
    configureConvex({ monthlyComparison: THREE_MONTHS });
    renderInCircle(makeCircleView(), <CircleDashboard />);

    const section = screen.getByRole("region", { name: /month-over-month/i });
    expect(within(section).getAllByRole("row")[1]).toHaveTextContent("US$5,000.00");
  });
});

describe("Dashboard Paid By filter", () => {
  const you = makeMemberView({ id: testId<Member["id"]>("mem-you"), displayName: "You" });
  const alex = makeMemberView({
    id: testId<Member["id"]>("mem-alex"),
    displayName: "Alex",
    role: "member",
    isSelf: false,
  });
  const rae = makeMemberView({
    id: testId<Member["id"]>("mem-rae"),
    displayName: "Rae",
    role: "member",
    status: "removed",
    isSelf: false,
  });

  it("offers All members plus each option, labelling a Removed Member", () => {
    configureConvex({
      dashboard: makeDashboard(),
      paidByFilterOptions: [you, alex, rae],
    });
    renderInCircle(makeCircleView(), <CircleDashboard />);

    const select = screen.getByLabelText(/paid by/i);
    const labels = within(select)
      .getAllByRole("option")
      .map((option) => option.textContent);
    expect(labels).toEqual(["All members", "You", "Alex", "Rae (removed)"]);
  });

  it("re-queries the dashboard narrowed to the selected Member", async () => {
    // The dashboard result depends on the queried `paidByMemberId`, so selecting a
    // Member flows a new arg through the real hook and updates the totals/recent.
    configureConvex({
      paidByFilterOptions: [you, alex],
      dashboard: (args) =>
        args.paidByMemberId === "mem-alex"
          ? makeDashboard({
              totals: { incomeMinor: 0, expenseMinor: 2_500, netMinor: -2_500 },
              recent: [makeTransactionView({ title: "Alex spend", type: "expense" })],
            })
          : makeDashboard({
              totals: { incomeMinor: 0, expenseMinor: 10_000, netMinor: -10_000 },
              recent: [makeTransactionView({ title: "All spend", type: "expense" })],
            }),
    });
    renderInCircle(makeCircleView(), <CircleDashboard />);

    // Default (All members): the unfiltered total.
    expect(screen.getByText("$100.00")).toBeInTheDocument();
    expect(screen.getByText("All spend")).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText(/paid by/i), "mem-alex");

    // Narrowed to Alex: totals and recent both reflect just their activity.
    expect(screen.getByText("$25.00")).toBeInTheDocument();
    expect(screen.getByText("Alex spend")).toBeInTheDocument();
    expect(screen.queryByText("All spend")).not.toBeInTheDocument();
  });

  it("disables the filter while options load", () => {
    configureConvex({ dashboard: makeDashboard(), paidByFilterOptions: undefined });
    renderInCircle(makeCircleView(), <CircleDashboard />);
    expect(screen.getByLabelText(/paid by/i)).toBeDisabled();
  });
});

describe("Dashboard URL state (paidBy + range)", () => {
  const you = makeMemberView({ id: testId<Member["id"]>("mem-you"), displayName: "You" });
  const alex = makeMemberView({
    id: testId<Member["id"]>("mem-alex"),
    displayName: "Alex",
    role: "member",
    isSelf: false,
  });
  const ROUTES = <Route path="circles/:circleRef" element={<CircleDashboard />} />;

  function setup(initialSearch = "") {
    return renderCircleRoutes(makeCircleView(), ROUTES, {
      initialEntries: [`/circles/trip-c1${initialSearch}`],
    });
  }

  it("restores a deep-linked Paid By + range and queries with both", () => {
    configureConvex({
      paidByFilterOptions: [you, alex],
      // The double inspects the queried args, so this asserts the URL actually
      // flowed through the real hooks into the subscription.
      monthlyComparison: (args) =>
        args.rangeMonths === 3 && args.paidByMemberId === "mem-alex"
          ? {
              series: [{ month: "2026-06", incomeMinor: 0, expenseMinor: 4_200, netMinor: -4_200 }],
              currency: "USD",
            }
          : { series: [], currency: "USD" },
      dashboard: (args) =>
        args.paidByMemberId === "mem-alex"
          ? makeDashboard({ totals: { incomeMinor: 0, expenseMinor: 2_500, netMinor: -2_500 } })
          : makeDashboard(),
    });
    setup("?paidBy=mem-alex&range=3");

    expect(screen.getByLabelText(/paid by/i)).toHaveValue("mem-alex");
    expect(screen.getByLabelText(/range/i)).toHaveValue("3");
    expect(screen.getByText("$25.00")).toBeInTheDocument(); // filtered totals
    const section = screen.getByRole("region", { name: /month-over-month/i });
    expect(within(section).getByText("-$42.00")).toBeInTheDocument(); // filtered series
  });

  it("writes selections to the URL and clears them back to a bare URL on defaults", async () => {
    configureConvex({ paidByFilterOptions: [you, alex] });
    const view = setup();

    await userEvent.selectOptions(screen.getByLabelText(/range/i), "12");
    expect(view.location()).toBe("/circles/trip-c1?range=12");

    await userEvent.selectOptions(screen.getByLabelText(/paid by/i), "mem-alex");
    expect(view.location()).toBe("/circles/trip-c1?paidBy=mem-alex&range=12");

    // Back to the defaults: the params drop, leaving the canonical bare URL.
    await userEvent.selectOptions(screen.getByLabelText(/range/i), "6");
    await userEvent.selectOptions(screen.getByLabelText(/paid by/i), "");
    expect(view.location()).toBe("/circles/trip-c1");
  });

  it("falls back to the default range for an unsupported range param", () => {
    configureConvex({ paidByFilterOptions: [you] });
    setup("?range=9");
    expect(screen.getByLabelText(/range/i)).toHaveValue("6");
  });

  it("cleans a paidBy the loaded options do not know and shows the unfiltered view", async () => {
    configureConvex({
      paidByFilterOptions: [you],
      dashboard: (args) =>
        args.paidByMemberId
          ? makeDashboard({ totals: { incomeMinor: 0, expenseMinor: 0, netMinor: 0 } })
          : makeDashboard(),
    });
    const view = setup("?paidBy=mem-ghost");

    // The stale id is dropped from the URL (same observable result as any unknown
    // id — ADR 0016) and the queries run unfiltered.
    await waitFor(() => expect(view.location()).toBe("/circles/trip-c1"));
    expect(screen.getByLabelText(/paid by/i)).toHaveValue("");
    expect(screen.getByText("$5,000.00")).toBeInTheDocument();
  });

  it("holds the money queries while a deep-linked paidBy awaits its options", () => {
    // Options still loading + a paidBy in the URL: the dashboard and comparison must
    // read as LOADING (queries skipped), never flash unfiltered totals where a
    // filtered view was deep-linked.
    configureConvex({ paidByFilterOptions: undefined, dashboard: makeDashboard() });
    setup("?paidBy=mem-alex");

    expect(screen.getByText(/this month's totals/i).closest("fieldset")).toHaveAttribute(
      "aria-busy",
      "true",
    );
    expect(screen.getByTestId("comparison-skeleton")).toBeInTheDocument();
    expect(screen.getByTestId("recent-skeleton")).toBeInTheDocument();
    expect(screen.queryByText("$5,000.00")).not.toBeInTheDocument();
  });
});
