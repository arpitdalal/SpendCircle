import { describe, expect, it } from "vitest";
import { normalizeSearchText, textIncludes } from "./text.js";

describe("normalizeSearchText", () => {
  it("trims, lowercases, and collapses internal whitespace", () => {
    expect(normalizeSearchText("  WEEKLY \t Shop \n")).toBe("weekly shop");
  });

  it("returns the empty string for undefined and whitespace-only input", () => {
    expect(normalizeSearchText(undefined)).toBe("");
    expect(normalizeSearchText("   \t\n ")).toBe("");
  });
});

describe("textIncludes", () => {
  it("matches a substring anywhere, case-insensitively", () => {
    expect(textIncludes("Groceries", "ocer")).toBe(true);
    expect(textIncludes("Groceries", "GROC")).toBe(true);
  });

  it("normalizes whitespace on the value side", () => {
    expect(textIncludes("Weekly   Shop", "weekly shop")).toBe(true);
  });

  it("rejects a non-match", () => {
    expect(textIncludes("Groceries", "rent")).toBe(false);
  });

  it("matches everything on an empty query", () => {
    expect(textIncludes("anything", "")).toBe(true);
    expect(textIncludes(undefined, "")).toBe(true);
  });

  it("treats undefined values as empty (no match for a real query)", () => {
    expect(textIncludes(undefined, "x")).toBe(false);
  });
});
