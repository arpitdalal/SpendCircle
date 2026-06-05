import { describe, expect, it } from "vitest";
import { monthDateRange, sumMonthTotals } from "./monthActivity.js";

// `sumMonthTotals` is the single home of the Income/Expense/Net reporting math
// shared by the Monthly Ledger and the Dashboard (RPT-1/RPT-3). It reads only
// `type` + `amountMinorUnits`, so it is exercised here as the pure reducer it is —
// the index-backed collect and access checks are covered through the query handlers
// in ledger.test.ts / dashboard.test.ts.
describe("sumMonthTotals", () => {
  it("returns zeros for an empty set", () => {
    expect(sumMonthTotals([])).toEqual({ incomeMinor: 0, expenseMinor: 0, netMinor: 0 });
  });

  it("sums income and expense separately and nets them in minor units", () => {
    const totals = sumMonthTotals([
      { type: "income", amountMinorUnits: 500_000 },
      { type: "expense", amountMinorUnits: 1_250 },
      { type: "expense", amountMinorUnits: 7_500 },
    ]);
    expect(totals).toEqual({ incomeMinor: 500_000, expenseMinor: 8_750, netMinor: 491_250 });
  });

  it("nets negative when expenses exceed income", () => {
    expect(
      sumMonthTotals([
        { type: "income", amountMinorUnits: 2_000 },
        { type: "expense", amountMinorUnits: 9_000 },
      ]),
    ).toEqual({ incomeMinor: 2_000, expenseMinor: 9_000, netMinor: -7_000 });
  });
});

describe("monthDateRange", () => {
  it("yields the half-open [month, next-month) plain-date range", () => {
    expect(monthDateRange("2026-06")).toEqual({ start: "2026-06", endExclusive: "2026-07" });
  });

  it("rolls the year over at the December boundary", () => {
    expect(monthDateRange("2026-12")).toEqual({ start: "2026-12", endExclusive: "2027-01" });
  });
});
