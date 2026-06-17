import { describe, expect, it } from "vitest";
import {
  canonicalCategoriesParams,
  categoryNewHref,
  defaultCategoriesFilters,
  hasCategoriesNarrowing,
  readCategoriesFilters,
} from "./categories-filter-url.js";

describe("readCategoriesFilters", () => {
  it("reads defaults from an empty URL (type=all, status=all, q empty)", () => {
    expect(readCategoriesFilters(new URLSearchParams())).toEqual({
      type: "all",
      status: "all",
      q: "",
    });
  });

  it("reads explicit values", () => {
    expect(readCategoriesFilters(new URLSearchParams("type=income&status=archived&q=gas"))).toEqual(
      { type: "income", status: "archived", q: "gas" },
    );
  });

  it("reads an explicit type=all", () => {
    expect(readCategoriesFilters(new URLSearchParams("type=all")).type).toBe("all");
  });

  it("clamps unknown type and status to the defaults", () => {
    expect(readCategoriesFilters(new URLSearchParams("type=bogus&status=nope"))).toEqual({
      type: "all",
      status: "all",
      q: "",
    });
  });

  it("trims and collapses whitespace in q", () => {
    expect(readCategoriesFilters(new URLSearchParams("q=++weekly+++shop++")).q).toBe("weekly shop");
  });
});

describe("canonicalCategoriesParams", () => {
  it("always writes type and status, omits an empty q", () => {
    expect(canonicalCategoriesParams(defaultCategoriesFilters()).toString()).toBe(
      "type=all&status=all",
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
  it("is false only for the unnarrowed defaults (type=all, status=all, no q)", () => {
    expect(hasCategoriesNarrowing(defaultCategoriesFilters())).toBe(false);
  });

  it("is true when a search, a non-default status, or a concrete type applies", () => {
    expect(hasCategoriesNarrowing({ type: "all", status: "all", q: "gas" })).toBe(true);
    expect(hasCategoriesNarrowing({ type: "all", status: "active", q: "" })).toBe(true);
    expect(hasCategoriesNarrowing({ type: "all", status: "archived", q: "" })).toBe(true);
    // A concrete type counts now that the default scope is "all" (issue #138).
    expect(hasCategoriesNarrowing({ type: "expense", status: "all", q: "" })).toBe(true);
    expect(hasCategoriesNarrowing({ type: "income", status: "all", q: "" })).toBe(true);
  });
});

describe("categoryNewHref", () => {
  const circle = { ref: "trip-c1" };

  it("carries a concrete type so the create form opens on it", () => {
    expect(categoryNewHref(circle, { type: "income" })).toBe(
      "/circles/trip-c1/categories/new?type=income",
    );
  });

  it("omits type for the all filter — the form defaults to expense (issue #138)", () => {
    expect(categoryNewHref(circle, { type: "all" })).toBe("/circles/trip-c1/categories/new");
  });
});
