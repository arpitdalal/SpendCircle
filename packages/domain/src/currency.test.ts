import { describe, expect, it } from "vitest";
import {
  type CurrencyCode,
  DEFAULT_CURRENCY,
  defaultCurrencyForLocale,
  toCurrencyCode,
} from "./currency.js";

describe("toCurrencyCode", () => {
  it("narrows a supported code to a typed CurrencyCode", () => {
    const code = toCurrencyCode("USD");
    // Assignability to CurrencyCode is the point; the runtime value round-trips.
    const typed: CurrencyCode = code;
    expect(typed).toBe("USD");
  });

  it("accepts every supported currency", () => {
    for (const code of ["USD", "EUR", "GBP", "CAD", "AUD", "INR", "SGD", "NZD"]) {
      expect(toCurrencyCode(code)).toBe(code);
    }
  });

  it("throws on an unsupported code instead of casting blindly", () => {
    expect(() => toCurrencyCode("XYZ")).toThrow(/unsupported currency/i);
    expect(() => toCurrencyCode("")).toThrow(/unsupported currency/i);
  });
});

describe("defaultCurrencyForLocale", () => {
  // Every mapped region resolves to its expected currency, including all the
  // Eurozone locales that collapse onto EUR. This is the table the Create Circle
  // form relies on for its locale-default currency (no hardcoded USD in the UI).
  it.each([
    ["en-US", "USD"],
    ["en-GB", "GBP"],
    ["en-CA", "CAD"],
    ["en-AU", "AUD"],
    ["en-NZ", "NZD"],
    ["en-IN", "INR"],
    ["en-SG", "SGD"],
    ["en-IE", "EUR"],
    ["de-DE", "EUR"],
    ["fr-FR", "EUR"],
    ["es-ES", "EUR"],
    ["it-IT", "EUR"],
    ["nl-NL", "EUR"],
  ])("maps %s to %s", (locale, expected) => {
    expect(defaultCurrencyForLocale(locale)).toBe(expected);
  });

  it("is case-insensitive on the region subtag", () => {
    // The region is uppercased before lookup, so a lowercased locale still maps.
    expect(defaultCurrencyForLocale("en-gb")).toBe("GBP");
    expect(defaultCurrencyForLocale("de-de")).toBe("EUR");
  });

  it("falls back to USD when the region is unsupported", () => {
    // Real regions we simply don't map yet (JP/BR) fall back rather than guess.
    expect(defaultCurrencyForLocale("ja-JP")).toBe(DEFAULT_CURRENCY);
    expect(defaultCurrencyForLocale("pt-BR")).toBe(DEFAULT_CURRENCY);
    expect(DEFAULT_CURRENCY).toBe("USD");
  });

  it("falls back to USD when the locale carries no region subtag", () => {
    // A bare language ("en") or a script-only subtag has no region to key on.
    expect(defaultCurrencyForLocale("en")).toBe(DEFAULT_CURRENCY);
    expect(defaultCurrencyForLocale("zh")).toBe(DEFAULT_CURRENCY);
  });

  it("falls back to USD for an empty or missing locale", () => {
    // viewerLocale() never returns these, but the helper must not throw if it does.
    expect(defaultCurrencyForLocale("")).toBe(DEFAULT_CURRENCY);
    expect(defaultCurrencyForLocale(undefined)).toBe(DEFAULT_CURRENCY);
  });
});
