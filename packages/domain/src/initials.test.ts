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

  it("keeps a decomposed accent whole instead of dropping it", () => {
    // NFD: base letter + combining mark form ONE grapheme. Code-point slicing
    // would drop the accent, leaving a bare "e". The whole cluster uppercases to
    // "E" + combining acute (U+0301), which renders as "É". This is the common
    // case for European names ("Élodie", "Ángel") on an English app.
    expect(initials("élodie")).toBe("É");
  });

  it("skips a leading emoji and uses the next word's letter", () => {
    // U+1F98A (fox) is one code point but a surrogate pair in UTF-16; it must be
    // segmented whole AND skipped (not rendered) so the chip stays a clean
    // monochrome glyph. Falls through to the next word's first letter.
    expect(initials("\u{1F98A} Fox")).toBe("F");
    // Multi-code-point clusters are likewise skipped whole, never sliced: a
    // regional-indicator flag (U+1F1EE U+1F1F3) and a ZWJ family sequence.
    expect(initials("\u{1F1EE}\u{1F1F3} India")).toBe("I");
    const family = "\u{1F468}\u{200D}\u{1F469}\u{200D}\u{1F467}";
    expect(initials(`${family} Family`)).toBe("F");
  });

  it("uses a number when a word starts with one", () => {
    expect(initials("3M Crew")).toBe("3C");
  });

  it("falls back to a placeholder when there is no alphanumeric glyph", () => {
    expect(initials("")).toBe("?");
    expect(initials("   ")).toBe("?");
    expect(initials("\u{1F98A}")).toBe("?"); // emoji-only
    expect(initials("!!! ???")).toBe("?"); // symbols only
  });
});
