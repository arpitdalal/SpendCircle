import { describe, expect, it } from "vitest";
import { canonicalDashboardParams, readDashboardSelection } from "./dashboard-url.js";

describe("readDashboardSelection", () => {
  it("reads a supported range and category analytics type", () => {
    const params = new URLSearchParams("range=3&type=income");
    expect(readDashboardSelection(params)).toEqual({
      range: 3,
      type: "income",
    });
  });

  it("defaults to the six-month Comparison Range and expense category analytics", () => {
    expect(readDashboardSelection(new URLSearchParams())).toEqual({
      range: 6,
      type: "expense",
    });
  });

  it("ignores legacy paidBy params (Dashboard is Circle-wide)", () => {
    expect(readDashboardSelection(new URLSearchParams("paidBy=mem-alex&range=3"))).toEqual({
      range: 3,
      type: "expense",
    });
  });

  it("falls back to the default for an unsupported or malformed range", () => {
    expect(readDashboardSelection(new URLSearchParams("range=2")).range).toBe(6);
    expect(readDashboardSelection(new URLSearchParams("range=0")).range).toBe(6);
    expect(readDashboardSelection(new URLSearchParams("range=-6")).range).toBe(6);
    expect(readDashboardSelection(new URLSearchParams("range=banana")).range).toBe(6);
    expect(readDashboardSelection(new URLSearchParams("range=")).range).toBe(6);
  });

  it("falls back to expense for an unsupported category analytics type", () => {
    expect(readDashboardSelection(new URLSearchParams("type=refund")).type).toBe("expense");
    expect(readDashboardSelection(new URLSearchParams("type=")).type).toBe("expense");
  });
});

describe("canonicalDashboardParams", () => {
  it("encodes a non-default selection", () => {
    const params = canonicalDashboardParams({ range: 12, type: "income" });
    expect(params.toString()).toBe("range=12&type=income");
  });

  it("omits the defaults so the canonical Dashboard URL stays bare (ADR 0016)", () => {
    expect(canonicalDashboardParams({ range: 6, type: "expense" }).toString()).toBe("");
  });

  it("preserves unrelated params it does not own and drops legacy paidBy", () => {
    const params = canonicalDashboardParams(
      { range: 3, type: "expense" },
      new URLSearchParams("utm=x&range=12&paidBy=stale"),
    );
    expect(params.get("utm")).toBe("x");
    expect(params.get("range")).toBe("3");
    expect(params.get("paidBy")).toBeNull();
  });

  it("round-trips through readDashboardSelection", () => {
    const selection = { range: 3, type: "income" } as const;
    expect(readDashboardSelection(canonicalDashboardParams(selection))).toEqual(selection);
  });
});
