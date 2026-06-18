import { describe, expect, it } from "vitest";
import {
  COLOR_PALETTE,
  circleSettingsColorChoices,
  colorHex,
  colorLabel,
  DEFAULT_COLOR_ID,
  isValidCircleSettingsColorId,
  isValidColorId,
  PERSONAL_CIRCLE_COLOR,
  PERSONAL_CIRCLE_COLOR_HEX,
  PERSONAL_CIRCLE_COLOR_ID,
  paletteColorForSeed,
  randomColorId,
} from "./color.js";

describe("colorHex", () => {
  it("returns the palette hex for a known color id", () => {
    for (const color of COLOR_PALETTE) {
      expect(colorHex(color.id)).toBe(color.hex);
    }
  });

  it("returns the iris hex for the Personal Circle color id", () => {
    expect(colorHex(PERSONAL_CIRCLE_COLOR_ID)).toBe(PERSONAL_CIRCLE_COLOR_HEX);
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

  it("returns Iris for the Personal Circle color id", () => {
    expect(colorLabel(PERSONAL_CIRCLE_COLOR_ID)).toBe("Iris");
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

  it("never returns the Personal Circle color id", () => {
    for (let i = 0; i < 30; i += 1) {
      expect(randomColorId()).not.toBe(PERSONAL_CIRCLE_COLOR_ID);
    }
  });
});

describe("circleSettingsColorChoices", () => {
  it("includes iris first for Personal Circles only", () => {
    expect(circleSettingsColorChoices("personal")[0]).toEqual(PERSONAL_CIRCLE_COLOR);
    expect(circleSettingsColorChoices("personal")).toHaveLength(COLOR_PALETTE.length + 1);
    expect(circleSettingsColorChoices("regular")).toEqual(COLOR_PALETTE);
  });
});

describe("isValidCircleSettingsColorId", () => {
  it("accepts palette ids for any kind and iris only for personal", () => {
    expect(isValidCircleSettingsColorId("teal", "regular")).toBe(true);
    expect(isValidCircleSettingsColorId("teal", "personal")).toBe(true);
    expect(isValidCircleSettingsColorId(PERSONAL_CIRCLE_COLOR_ID, "personal")).toBe(true);
    expect(isValidCircleSettingsColorId(PERSONAL_CIRCLE_COLOR_ID, "regular")).toBe(false);
  });
});
