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

  it("reads a full grapheme, not a half surrogate pair, for astral emoji", () => {
    // U+1F98A (fox) is one code point but a surrogate pair in UTF-16; naive
    // string indexing (name[0]) would slice it in half.
    expect(initials("\u{1F98A} Fox")).toBe("\u{1F98A}F");
    expect(initials("\u{1F98A}")).toBe("\u{1F98A}");
  });

  it("keeps multi-code-point grapheme clusters whole", () => {
    // Regional-indicator flag: TWO code points (U+1F1EE U+1F1F3) form one
    // perceived character. Code-point slicing would emit a lone half-flag.
    const flag = "\u{1F1EE}\u{1F1F3}";
    expect(initials(`${flag} India`)).toBe(`${flag}I`);

    // ZWJ emoji sequence (man + ZWJ + woman + ZWJ + girl). Code-point slicing
    // would emit just the first person.
    const family = "\u{1F468}\u{200D}\u{1F469}\u{200D}\u{1F467}";
    expect(initials(`${family} Family`)).toBe(`${family}F`);

    // Decomposed accent (NFD): base letter + combining mark. Code-point slicing
    // would drop the accent, leaving a bare "e". The whole cluster uppercases to
    // "E" + combining acute (U+0301), which renders as "É".
    expect(initials("élodie")).toBe("É");
  });

  it("falls back to a placeholder for empty or whitespace-only input", () => {
    expect(initials("")).toBe("?");
    expect(initials("   ")).toBe("?");
  });
});
