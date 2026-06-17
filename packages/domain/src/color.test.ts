import { describe, expect, it } from "vitest";
import {
  COLOR_PALETTE,
  colorHex,
  colorLabel,
  DEFAULT_COLOR_ID,
  isValidColorId,
  paletteColorForSeed,
  randomColorId,
} from "./color.js";

describe("colorHex", () => {
  it("returns the palette hex for a known color id", () => {
    for (const color of COLOR_PALETTE) {
      expect(colorHex(color.id)).toBe(color.hex);
    }
  });

  it("falls back to the default color's hex for an unknown id", () => {
    const fallback = COLOR_PALETTE.find((color) => color.id === DEFAULT_COLOR_ID)?.hex;
    expect(colorHex("not-a-color")).toBe(fallback);
    expect(colorHex("")).toBe(fallback);
  });
});

describe("colorLabel", () => {
  it("returns the palette name for a known id and echoes an unknown id", () => {
    expect(colorLabel("blue")).toBe("Blue");
    expect(colorLabel("not-a-color")).toBe("not-a-color");
  });
});

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

describe("randomColorId", () => {
  it("returns a valid palette color id", () => {
    for (let i = 0; i < 30; i += 1) {
      expect(isValidColorId(randomColorId())).toBe(true);
    }
  });
});
