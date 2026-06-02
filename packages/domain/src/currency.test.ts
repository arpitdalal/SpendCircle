import { describe, expect, it } from "vitest";
import { type CurrencyCode, toCurrencyCode } from "./currency.js";

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
