import { describe, expect, it } from "vitest";
import { transactionDetailHref, withQuery } from "./ledger-url.js";

describe("transactionDetailHref", () => {
  it("builds the bare detail path (origin is carried by returnTo, not here)", () => {
    expect(transactionDetailHref({ ref: "c1" }, { ref: "rent-t1" })).toBe(
      "/circles/c1/transactions/rent-t1",
    );
  });
});

describe("withQuery", () => {
  it("appends a non-empty query with a ?", () => {
    expect(withQuery("/a/b", "month=2026-05")).toBe("/a/b?month=2026-05");
  });

  it("returns the bare path when the query is empty", () => {
    expect(withQuery("/a/b", "")).toBe("/a/b");
  });
});
