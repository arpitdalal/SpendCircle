import { describe, expect, it } from "vitest";
import {
  canonicalCategoriesParams,
  defaultCategoriesFilters,
  hasCategoriesNarrowing,
  readCategoriesFilters,
} from "./categories-filter-url.js";

describe("readCategoriesFilters", () => {
  it("reads defaults from an empty URL (type=expense, status=all, q empty)", () => {
    expect(readCategoriesFilters(new URLSearchParams())).toEqual({
      type: "expense",
      status: "all",
      q: "",
    });
  });

  it("reads explicit values", () => {
    expect(readCategoriesFilters(new URLSearchParams("type=income&status=archived&q=gas"))).toEqual(
      { type: "income", status: "archived", q: "gas" },
    );
  });

  it("clamps unknown type and status to the defaults", () => {
    expect(readCategoriesFilters(new URLSearchParams("type=bogus&status=nope"))).toEqual({
      type: "expense",
      status: "all",
      q: "",
    });
    // The Categories type is binary — the transaction modules' "all" is unknown here.
    expect(readCategoriesFilters(new URLSearchParams("type=all")).type).toBe("expense");
  });

  it("trims and collapses whitespace in q", () => {
    expect(readCategoriesFilters(new URLSearchParams("q=++weekly+++shop++")).q).toBe("weekly shop");
  });
});

describe("canonicalCategoriesParams", () => {
  it("always writes type and status, omits an empty q", () => {
    expect(canonicalCategoriesParams(defaultCategoriesFilters()).toString()).toBe(
      "type=expense&status=all",
    );
  });

  it("writes a trimmed, normalized q when present", () => {
    const params = canonicalCategoriesParams({ type: "income", status: "active", q: " a  b " });
    expect(params.toString()).toBe("type=income&status=active&q=a+b");
  });

  it("omits a whitespace-only q", () => {
    const params = canonicalCategoriesParams({ type: "expense", status: "all", q: "   " });
    expect(params.get("q")).toBeNull();
  });

  it("preserves non-filter params and drops stale filter params", () => {
    const preserve = new URLSearchParams("q=old&other=keep");
    const params = canonicalCategoriesParams({ type: "expense", status: "all", q: "" }, preserve);
    expect(params.get("other")).toBe("keep");
    expect(params.get("q")).toBeNull();
  });

  it("round-trips through the reader", () => {
    const filters = { type: "income" as const, status: "archived" as const, q: "fuel" };
    expect(readCategoriesFilters(canonicalCategoriesParams(filters))).toEqual(filters);
  });
});

describe("hasCategoriesNarrowing", () => {
  it("is false for the defaults (the type tab alone is not narrowing)", () => {
    expect(hasCategoriesNarrowing(defaultCategoriesFilters())).toBe(false);
    expect(hasCategoriesNarrowing({ type: "income", status: "all", q: "" })).toBe(false);
  });

  it("is true when a search or a non-default status applies", () => {
    expect(hasCategoriesNarrowing({ type: "expense", status: "all", q: "gas" })).toBe(true);
    expect(hasCategoriesNarrowing({ type: "expense", status: "active", q: "" })).toBe(true);
    expect(hasCategoriesNarrowing({ type: "expense", status: "archived", q: "" })).toBe(true);
  });
});
