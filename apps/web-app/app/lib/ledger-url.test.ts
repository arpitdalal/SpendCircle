import { describe, expect, it } from "vitest";
import { editSearch, ledgerSearch, parseEditReturn, withQuery } from "./ledger-url.js";

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

describe("editSearch", () => {
  it("carries the ledger slice without a from marker by default (ledger return)", () => {
    expect(editSearch({ month: "2026-05", status: "archived" })).toBe(
      "month=2026-05&view=archived",
    );
  });

  it("appends from=detail after the slice when opened from the detail page", () => {
    expect(editSearch({ month: "2026-05", status: "archived", from: "detail" })).toBe(
      "month=2026-05&view=archived&from=detail",
    );
  });

  it("omits from for an explicit ledger return", () => {
    expect(editSearch({ month: "2026-05", from: "ledger" })).toBe("month=2026-05");
  });
});

describe("parseEditReturn", () => {
  it("decodes detail and falls back to ledger for anything else", () => {
    expect(parseEditReturn("detail")).toBe("detail");
    expect(parseEditReturn("ledger")).toBe("ledger");
    expect(parseEditReturn(null)).toBe("ledger");
    expect(parseEditReturn("bogus")).toBe("ledger");
  });
});
