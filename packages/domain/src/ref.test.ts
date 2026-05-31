import { describe, expect, it } from "vitest";
import { buildRef, isCanonicalRef, parseRef, slugify } from "./ref.js";

// In tests the injected validator just checks a simple "looks like an ID" shape.
const isValidId = (candidate: string) => /^[a-z0-9]{2,}$/.test(candidate);

describe("parseRef", () => {
  it("extracts the trailing segment as the ID and keeps the slug", () => {
    expect(parseRef("my-home-c1abc", isValidId)).toEqual({ id: "c1abc", slug: "my-home" });
  });

  it("accepts a bare ID with no slug", () => {
    expect(parseRef("c1abc", isValidId)).toEqual({ id: "c1abc", slug: "" });
  });

  it("rejects an empty ref", () => {
    expect(parseRef("", isValidId)).toBeNull();
  });

  it("rejects when the trailing segment fails the injected validator", () => {
    expect(parseRef("my-home-!", isValidId)).toBeNull();
  });
});

describe("slugify", () => {
  it("lowercases, strips punctuation, and collapses separators", () => {
    expect(slugify("My Home & Family!")).toBe("my-home-family");
  });

  it("strips diacritics", () => {
    expect(slugify("Café Trip")).toBe("cafe-trip");
  });
});

describe("buildRef / isCanonicalRef", () => {
  it("builds slug-id and detects canonical form", () => {
    const ref = buildRef("My Home", "c1abc");
    expect(ref).toBe("my-home-c1abc");
    expect(isCanonicalRef(ref, "My Home", "c1abc")).toBe(true);
    expect(isCanonicalRef("stale-c1abc", "My Home", "c1abc")).toBe(false);
  });
});
