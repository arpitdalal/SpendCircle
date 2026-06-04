import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Dashboard, Member, Transaction } from "~/lib/data.js";
import {
  configureConvex,
  makeCircleView,
  makeMemberView,
  makeTransactionView,
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

  it("shows placeholders while the dashboard loads", () => {
    // A function returning `undefined` models the reactive query still loading
    // (passing `dashboard: undefined` would hit the helper's EMPTY_DASHBOARD default).
    configureConvex({ dashboard: () => undefined });
    renderInCircle(makeCircleView(), <CircleDashboard />);

    // Three totals placeholders, plus the recent loading line.
    expect(screen.getAllByText("…")).toHaveLength(3);
    expect(screen.getByText(/loading recent activity/i)).toBeInTheDocument();
  });
});

describe("Dashboard recent feed", () => {
  it("renders recent rows with title, paid-by, and signed amount", () => {
    const recent: Transaction[] = [
      makeTransactionView({
        id: testId<Transaction["id"]>("t-income"),
        type: "income",
        title: "Paycheck",
        amountMinorUnits: 500_000,
        paidBy: { id: testId<Member["id"]>("mem-you"), displayName: "You", image: undefined },
      }),
      makeTransactionView({
        id: testId<Transaction["id"]>("t-expense"),
        type: "expense",
        title: "Groceries",
        amountMinorUnits: 7_350,
        paidBy: { id: testId<Member["id"]>("mem-alex"), displayName: "Alex", image: undefined },
      }),
    ];
    configureConvex({ dashboard: makeDashboard({ recent }) });
    renderInCircle(makeCircleView(), <CircleDashboard />);

    const feed = screen.getByRole("region", { name: /recent activity/i });
    expect(within(feed).getByText("Paycheck")).toBeInTheDocument();
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
