import { describe, expect, it } from "vitest";
import {
  MAX_AMOUNT_MINOR,
  formatMinorUnits,
  isValidMinorUnits,
  minorUnitsToMajorString,
  parseAmountToMinorUnits,
} from "./money.js";

describe("parseAmountToMinorUnits", () => {
  it("parses a plain two-decimal value", () => {
    expect(parseAmountToMinorUnits("12.50")).toEqual({ ok: true, minorUnits: 1250 });
  });

  it("parses an integer value", () => {
    expect(parseAmountToMinorUnits("7")).toEqual({ ok: true, minorUnits: 700 });
  });

  it("avoids float drift on values like 12.10", () => {
    expect(parseAmountToMinorUnits("12.10")).toEqual({ ok: true, minorUnits: 1210 });
  });

  it.each([
    ["", "empty"],
    ["abc", "not-a-number"],
    ["-5", "not-a-number"],
    ["0", "zero"],
    ["0.00", "zero"],
    ["1.234", "too-many-decimals"],
    ["1000000000", "too-large"],
  ])("rejects %s as %s", (input, error) => {
    expect(parseAmountToMinorUnits(input)).toEqual({ ok: false, error });
  });

  it("accepts the maximum allowed value", () => {
    expect(parseAmountToMinorUnits("999999999.99")).toEqual({
      ok: true,
      minorUnits: MAX_AMOUNT_MINOR,
    });
  });
});

describe("isValidMinorUnits", () => {
  it("rejects zero, negatives, non-integers, and over-max", () => {
    expect(isValidMinorUnits(0)).toBe(false);
    expect(isValidMinorUnits(-1)).toBe(false);
    expect(isValidMinorUnits(1.5)).toBe(false);
    expect(isValidMinorUnits(MAX_AMOUNT_MINOR + 1)).toBe(false);
    expect(isValidMinorUnits(1250)).toBe(true);
  });
});

describe("formatting", () => {
  it("formats minor units with the currency symbol", () => {
    expect(formatMinorUnits(1250, "USD", "en-US")).toBe("$12.50");
  });

  it("renders a plain decimal string", () => {
    expect(minorUnitsToMajorString(1250)).toBe("12.50");
  });
});
