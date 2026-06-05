import { describe, expect, it } from "vitest";
import { initials } from "./initials.js";

describe("initials", () => {
  it("takes the first letter of the first and last word", () => {
    expect(initials("Olive Owner")).toBe("OO");
    expect(initials("Mary Jane Watson")).toBe("MW");
  });

  it("uses a single letter for a one-word name", () => {
    expect(initials("Alex")).toBe("A");
  });

  it("uppercases lowercase input", () => {
    expect(initials("jean picard")).toBe("JP");
  });

  it("collapses extra whitespace and trims", () => {
    expect(initials("  Maya   Member  ")).toBe("MM");
  });

  it("keeps a hyphenated word as one word", () => {
    expect(initials("jean-luc picard")).toBe("JP");
  });

  it("reads a full grapheme, not a half surrogate pair, for emoji/extended names", () => {
    // 🦊 is a surrogate pair; naive name[0] would slice it in half.
    expect(initials("🦊 Fox")).toBe("🦊F");
    expect(initials("🦊")).toBe("🦊");
  });

  it("falls back to a placeholder for empty or whitespace-only input", () => {
    expect(initials("")).toBe("?");
    expect(initials("   ")).toBe("?");
  });
});
