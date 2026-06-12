import { describe, expect, it } from "vitest";
import { type CategoryResolveRow, resolveCategories } from "./transaction-category-resolve.js";

function map(entries: [string, CategoryResolveRow][]) {
  return new Map(entries);
}

describe("resolveCategories", () => {
  it("returns ids when every selection resolves and none are newly archived", () => {
    const byId = map([
      ["a", { id: "a", name: "A", status: "active" }],
      ["b", { id: "b", name: "B", status: "active" }],
    ]);
    const r = resolveCategories(["a", "b"], byId, new Set());
    expect(r).toEqual({ ok: true, categoryIds: ["a", "b"] });
  });

  it("allows an already-attached archived category", () => {
    const byId = map([["x", { id: "x", name: "Old", status: "archived" }]]);
    const r = resolveCategories(["x"], byId, new Set(["x"]));
    expect(r).toEqual({ ok: true, categoryIds: ["x"] });
  });

  it("fails when a selected id is missing from the map", () => {
    const byId = map([["a", { id: "a", name: "A", status: "active" }]]);
    const r = resolveCategories(["a", "ghost"], byId, new Set());
    expect(r).toEqual({ ok: false, reason: "unresolved" });
  });

  it("fails when a newly selected category is archived and not already attached", () => {
    const byId = map([["x", { id: "x", name: "Snacks", status: "archived" }]]);
    const r = resolveCategories(["x"], byId, new Set());
    expect(r).toEqual({
      ok: false,
      reason: "newly_archived",
      categories: [{ id: "x", name: "Snacks", status: "archived" }],
    });
  });
});
