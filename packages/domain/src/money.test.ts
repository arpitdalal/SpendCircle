import { describe, expect, it } from "vitest";
import {
  formatMoney,
  formatMoneyAmount,
  isValidMinorUnits,
  MAX_AMOUNT_MINOR,
  minorUnitsToMajorString,
  money,
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

describe("formatMoney", () => {
  it("formats a money value with the currency symbol in the given locale", () => {
    expect(formatMoney(money(1250, "USD"), "en-US")).toBe("$12.50");
  });

  it("disambiguates USD for a non-US viewer locale", () => {
    // An Australian/Canadian-style viewer sees a qualified form so USD is not
    // confused with the local dollar — the whole point of an explicit locale.
    // Normalize the various Unicode spaces ICU may insert before the amount.
    const normalize = (value: string) => value.replace(/\s/g, " ");
    expect(formatMoney(money(1250, "USD"), "en-CA")).toBe("US$12.50");
    expect(normalize(formatMoney(money(1250, "USD"), "en-AU"))).toBe("USD 12.50");
  });

  it("formats the local currency without qualification for its own locale", () => {
    expect(formatMoney(money(1250, "AUD"), "en-AU")).toBe("$12.50");
  });

  it("does NOT depend on the ambient runtime locale (regression for ADR 0021)", () => {
    // The same value + viewer locale renders identically no matter what locale
    // the process runs under — the bug MNT-2 fixes was an omitted locale.
    const original = process.env.LANG;
    try {
      process.env.LANG = "en_CA.UTF-8";
      expect(formatMoney(money(500000, "USD"), "en-US")).toBe("$5,000.00");
    } finally {
      process.env.LANG = original;
    }
  });
});

describe("formatMoneyAmount", () => {
  it("renders a plain positive decimal string with no symbol (export form)", () => {
    expect(formatMoneyAmount(money(1250, "USD"))).toBe("12.50");
    expect(formatMoneyAmount(money(MAX_AMOUNT_MINOR, "USD"))).toBe("999999999.99");
  });

  it("renders a plain decimal string from minor units", () => {
    expect(minorUnitsToMajorString(1250)).toBe("12.50");
  });
});
