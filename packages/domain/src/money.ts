import { type CurrencyCode, getCurrency } from "./currency.js";

/**
 * Money is stored as positive integer minor units (cents) and all math is done
 * on integers to avoid floating-point rounding (ADR 0009). v1 currencies all
 * use two decimal places, and the UI constrains entry accordingly.
 */

/** Largest allowed major value: 999,999,999.99 → 99,999,999,999 minor units. */
export const MAX_AMOUNT_MAJOR = 999_999_999.99;
export const MAX_AMOUNT_MINOR = 99_999_999_999;
export const MONEY_DECIMALS = 2;

export type AmountParseError =
  | "empty"
  | "not-a-number"
  | "negative"
  | "zero"
  | "too-many-decimals"
  | "too-large";

export type AmountParseResult =
  | { ok: true; minorUnits: number }
  | { ok: false; error: AmountParseError };

/**
 * Parses a user-entered major-unit string (e.g. "12.50") into positive integer
 * minor units. Rejects empty, non-numeric, zero, negative, over-precision, and
 * absurd values so money data stays valid (PRD story 31).
 */
export function parseAmountToMinorUnits(input: string): AmountParseResult {
  const trimmed = input.trim();
  if (trimmed === "") {
    return { ok: false, error: "empty" };
  }
  if (!/^\d*(\.\d*)?$/.test(trimmed)) {
    return { ok: false, error: "not-a-number" };
  }
  const decimalPart = trimmed.split(".")[1] ?? "";
  if (decimalPart.length > MONEY_DECIMALS) {
    return { ok: false, error: "too-many-decimals" };
  }
  const value = Number(trimmed);
  if (Number.isNaN(value)) {
    return { ok: false, error: "not-a-number" };
  }
  if (value < 0) {
    return { ok: false, error: "negative" };
  }
  if (value === 0) {
    return { ok: false, error: "zero" };
  }
  // Round on the string to dodge binary float drift (e.g. 12.10 * 100).
  const minorUnits = Math.round(value * 10 ** MONEY_DECIMALS);
  if (minorUnits <= 0) {
    return { ok: false, error: "zero" };
  }
  if (minorUnits > MAX_AMOUNT_MINOR) {
    return { ok: false, error: "too-large" };
  }
  return { ok: true, minorUnits };
}

export function isValidMinorUnits(minorUnits: number): boolean {
  return Number.isInteger(minorUnits) && minorUnits > 0 && minorUnits <= MAX_AMOUNT_MINOR;
}

/** Formats integer minor units as a localized currency string for display. */
export function formatMinorUnits(
  minorUnits: number,
  currency: CurrencyCode,
  locale?: string,
): string {
  const { decimals } = getCurrency(currency);
  const major = minorUnits / 10 ** decimals;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(major);
}

/** Formats minor units as a plain decimal string (no symbol), e.g. for inputs/CSV. */
export function minorUnitsToMajorString(minorUnits: number): string {
  return (minorUnits / 10 ** MONEY_DECIMALS).toFixed(MONEY_DECIMALS);
}
