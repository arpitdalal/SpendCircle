import { describe, expect, it } from "vitest";
import { canonicalDashboardParams, readDashboardSelection } from "./dashboard-url.js";

describe("readDashboardSelection", () => {
  it("reads a supported range, a paidBy id, and a category analytics type", () => {
    const params = new URLSearchParams("range=3&paidBy=mem-alex&type=income");
    expect(readDashboardSelection(params)).toEqual({
      range: 3,
      paidBy: "mem-alex",
      type: "income",
    });
  });

  it("defaults to the six-month Comparison Range, expense category analytics, and no Paid By filter", () => {
    expect(readDashboardSelection(new URLSearchParams())).toEqual({
      range: 6,
      paidBy: "",
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

  it("trims a paidBy value and treats whitespace as absent", () => {
    expect(readDashboardSelection(new URLSearchParams("paidBy=%20mem-a%20")).paidBy).toBe("mem-a");
    expect(readDashboardSelection(new URLSearchParams("paidBy=%20%20")).paidBy).toBe("");
  });
});

describe("canonicalDashboardParams", () => {
  it("encodes a non-default selection", () => {
    const params = canonicalDashboardParams({ range: 12, paidBy: "mem-alex", type: "income" });
    expect(params.toString()).toBe("paidBy=mem-alex&range=12&type=income");
  });

  it("omits the defaults so the canonical Dashboard URL stays bare (ADR 0016)", () => {
    expect(canonicalDashboardParams({ range: 6, paidBy: "", type: "expense" }).toString()).toBe("");
  });

  it("preserves unrelated params it does not own", () => {
    const params = canonicalDashboardParams(
      { range: 3, paidBy: "", type: "expense" },
      new URLSearchParams("utm=x&range=12&paidBy=stale"),
    );
    expect(params.get("utm")).toBe("x");
    expect(params.get("range")).toBe("3");
    expect(params.get("paidBy")).toBeNull();
  });

  it("round-trips through readDashboardSelection", () => {
    const selection = { range: 3, paidBy: "mem-rae", type: "income" } as const;
    expect(readDashboardSelection(canonicalDashboardParams(selection))).toEqual(selection);
  });
});
