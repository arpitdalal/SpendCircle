import { describe, expect, it } from "vitest";
import {
  COLOR_PALETTE,
  colorHex,
  colorLabel,
  DEFAULT_COLOR_ID,
  isNewCircleColorId,
  isValidColorId,
  NEW_CIRCLE_COLOR,
  newCircleColorId,
  paletteColorForSeed,
  randomColorId,
} from "./color.js";

describe("colorHex", () => {
  it("returns the palette hex for a known color id", () => {
    for (const color of COLOR_PALETTE) {
      expect(colorHex(color.id)).toBe(color.hex);
    }
  });

  it("returns the iris hex for the create-time circle color id", () => {
    expect(colorHex(NEW_CIRCLE_COLOR.id)).toBe(NEW_CIRCLE_COLOR.hex);
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

  it("returns Iris for the create-time circle color id", () => {
    expect(colorLabel(NEW_CIRCLE_COLOR.id)).toBe("Iris");
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

describe("newCircleColorId", () => {
  it("returns the reserved create-time iris color id", () => {
    expect(newCircleColorId()).toBe(NEW_CIRCLE_COLOR.id);
    expect(isNewCircleColorId(newCircleColorId())).toBe(true);
  });

  it("is not a palette color id", () => {
    expect(isValidColorId(newCircleColorId())).toBe(false);
    expect(COLOR_PALETTE.map((color) => color.id)).not.toContain(newCircleColorId());
  });
});
