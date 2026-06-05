import { describe, expect, it } from "vitest";
import { COLOR_PALETTE, paletteColorForSeed } from "./color.js";

describe("paletteColorForSeed", () => {
  it("returns the same palette color for the same seed", () => {
    expect(paletteColorForSeed("mem-abc")).toEqual(paletteColorForSeed("mem-abc"));
  });

  it("always returns a member of the palette", () => {
    for (const seed of ["", "a", "mem-abc", "mem-xyz", "9".repeat(50)]) {
      expect(COLOR_PALETTE).toContainEqual(paletteColorForSeed(seed));
    }
  });

  it("spreads different seeds across more than one color", () => {
    const colors = new Set(
      Array.from({ length: 40 }, (_, i) => paletteColorForSeed(`member-${i}`).id),
    );
    expect(colors.size).toBeGreaterThan(1);
  });

  it("handles an empty seed deterministically", () => {
    expect(paletteColorForSeed("")).toEqual(paletteColorForSeed(""));
  });
});
