/**
 * Supported ISO 4217 currencies for v1. The list is checked in (PRD) and every
 * currency in v1 uses two decimal places, which keeps money handling uniform
 * (ADR 0009). New currencies are added here as they are requested via Feedback.
 */
export type CurrencyCode = (typeof SUPPORTED_CURRENCIES)[number]["code"];

export interface Currency {
  readonly code: string;
  readonly name: string;
  readonly symbol: string;
  /** Number of minor-unit digits. v1 only supports 2-decimal currencies. */
  readonly decimals: 2;
}

export const SUPPORTED_CURRENCIES = [
  { code: "USD", name: "US Dollar", symbol: "$", decimals: 2 },
  { code: "EUR", name: "Euro", symbol: "€", decimals: 2 },
  { code: "GBP", name: "British Pound", symbol: "£", decimals: 2 },
  { code: "CAD", name: "Canadian Dollar", symbol: "CA$", decimals: 2 },
  { code: "AUD", name: "Australian Dollar", symbol: "A$", decimals: 2 },
  { code: "INR", name: "Indian Rupee", symbol: "₹", decimals: 2 },
  { code: "SGD", name: "Singapore Dollar", symbol: "S$", decimals: 2 },
  { code: "NZD", name: "New Zealand Dollar", symbol: "NZ$", decimals: 2 },
] as const satisfies readonly Currency[];

export const DEFAULT_CURRENCY: CurrencyCode = "USD";

const CURRENCY_BY_CODE = new Map<string, Currency>(
  SUPPORTED_CURRENCIES.map((currency) => [currency.code, currency]),
);

export function isSupportedCurrency(code: string): code is CurrencyCode {
  return CURRENCY_BY_CODE.has(code);
}

export function getCurrency(code: CurrencyCode): Currency {
  const currency = CURRENCY_BY_CODE.get(code);
  if (!currency) {
    throw new Error(`Unsupported currency: ${code}`);
  }
  return currency;
}

/**
 * Picks a sensible default currency from a BCP 47 locale (e.g. "en-GB"),
 * falling back to USD when the region is unknown or unsupported. The mapping is
 * intentionally small; unmatched locales fall back rather than guess.
 */
const REGION_TO_CURRENCY: Record<string, CurrencyCode> = {
  US: "USD",
  GB: "GBP",
  CA: "CAD",
  AU: "AUD",
  NZ: "NZD",
  IN: "INR",
  SG: "SGD",
  IE: "EUR",
  DE: "EUR",
  FR: "EUR",
  ES: "EUR",
  IT: "EUR",
  NL: "EUR",
};

export function defaultCurrencyForLocale(locale: string | undefined): CurrencyCode {
  if (!locale) {
    return DEFAULT_CURRENCY;
  }
  const region = locale.split("-")[1]?.toUpperCase();
  if (region && REGION_TO_CURRENCY[region]) {
    return REGION_TO_CURRENCY[region];
  }
  return DEFAULT_CURRENCY;
}
