import { describe, expect, it } from "vitest";
import {
  cleanText,
  readIds,
  readLifecycleStatus,
  readPositiveIntPageParam,
  writeIds,
  writePositiveIntPageParam,
} from "./url-codec.js";

describe("cleanText", () => {
  it("treats null as empty", () => {
    expect(cleanText(null)).toBe("");
  });

  it("trims and collapses internal whitespace", () => {
    expect(cleanText("  a  b  c  ")).toBe("a b c");
    // Same body as URL `q=++weekly+++shop++` after URLSearchParams decodes + to spaces.
    expect(cleanText("  weekly   shop  ")).toBe("weekly shop");
  });
});

describe("readLifecycleStatus", () => {
  it("returns known values unchanged", () => {
    expect(readLifecycleStatus("active", "all")).toBe("active");
    expect(readLifecycleStatus("archived", "all")).toBe("archived");
    expect(readLifecycleStatus("all", "active")).toBe("all");
  });

  it("falls back to the passed default for null and unknown", () => {
    expect(readLifecycleStatus(null, "all")).toBe("all");
    expect(readLifecycleStatus("nope", "all")).toBe("all");
    expect(readLifecycleStatus("bogus", "active")).toBe("active");
  });
});

describe("readIds", () => {
  it("returns empty for null and blank", () => {
    expect(readIds(null)).toEqual([]);
    expect(readIds("")).toEqual([]);
    expect(readIds("  ,  , ")).toEqual([]);
  });

  it("trims, dedupes, and sorts", () => {
    expect(readIds("b, a, b , ")).toEqual(["a", "b"]);
  });
});

describe("writeIds", () => {
  it("sets a comma-joined sorted unique list", () => {
    const params = new URLSearchParams();
    writeIds(params, "categories", ["b", "a", "b"]);
    expect(params.get("categories")).toBe("a,b");
  });

  it("deletes the key when the list is empty after trim", () => {
    const params = new URLSearchParams("categories=old");
    writeIds(params, "categories", ["  ", ""]);
    expect(params.has("categories")).toBe(false);
  });
});

describe("readPositiveIntPageParam and writePositiveIntPageParam", () => {
  it("clamps invalid values and omits page 1 on write", () => {
    expect(readPositiveIntPageParam(null, 10)).toBe(1);
    expect(readPositiveIntPageParam("0", 10)).toBe(1);
    expect(readPositiveIntPageParam("5", 10)).toBe(5);
    expect(readPositiveIntPageParam("99", 10)).toBe(10);
    const params = new URLSearchParams("page=3");
    writePositiveIntPageParam(params, "page", 1, 10);
    expect(params.get("page")).toBeNull();
    writePositiveIntPageParam(params, "page", 4, 10);
    expect(params.get("page")).toBe("4");
  });
});
