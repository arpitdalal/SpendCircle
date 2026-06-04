import { describe, expect, it } from "vitest";
import { ledgerSearch, withQuery } from "./ledger-url.js";

describe("ledgerSearch", () => {
  it("encodes the month alone for the active (default) view", () => {
    expect(ledgerSearch({ month: "2026-05", status: "active" })).toBe("month=2026-05");
  });

  it("adds view=archived only for the archived view", () => {
    expect(ledgerSearch({ month: "2026-05", status: "archived" })).toBe(
      "month=2026-05&view=archived",
    );
  });

  it("omits an absent month and an absent status", () => {
    expect(ledgerSearch({})).toBe("");
    expect(ledgerSearch({ status: "archived" })).toBe("view=archived");
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
