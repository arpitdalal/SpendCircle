import {
  currentMonth,
  isValidPlainDate,
  isValidPlainMonth,
  type PlainMonth,
  parseAmountToMinorUnits,
  type TransactionType,
} from "@spend-circle/domain";

export type TypeFilter = "all" | TransactionType;
export type LifecycleFilter = "active" | "archived" | "all";

export interface BaseTransactionFilters {
  q: string;
  type: TypeFilter;
  status: LifecycleFilter;
  categories: string[];
  recordedBy: string[];
  paidBy: string[];
}

export interface LedgerFilters extends BaseTransactionFilters {
  month: PlainMonth;
}

export interface SearchFilters extends BaseTransactionFilters {
  from: string;
  to: string;
  min: string;
  max: string;
}

export const DEFAULT_TYPE: TypeFilter = "all";
export const DEFAULT_STATUS: LifecycleFilter = "active";
export const LEDGER_FILTER_PARAMS = ["q", "type", "status", "categories", "recordedBy", "paidBy"];
export const SEARCH_FILTER_PARAMS = [
  "q",
  "type",
  "status",
  "categories",
  "recordedBy",
  "paidBy",
  "from",
  "to",
  "min",
  "max",
];

function cleanText(value: string | null) {
  return (value ?? "").trim().replace(/\s+/g, " ");
}

function readType(value: string | null): TypeFilter {
  return value === "expense" || value === "income" || value === "all" ? value : DEFAULT_TYPE;
}

function readStatus(value: string | null): LifecycleFilter {
  return value === "active" || value === "archived" || value === "all" ? value : DEFAULT_STATUS;
}

function readIds(value: string | null) {
  const ids = new Set<string>();
  for (const part of (value ?? "").split(",")) {
    const id = part.trim();
    if (id) {
      ids.add(id);
    }
  }
  return [...ids].sort();
}

function writeIds(params: URLSearchParams, key: string, ids: string[]) {
  const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))].sort();
  if (unique.length > 0) {
    params.set(key, unique.join(","));
  } else {
    params.delete(key);
  }
}

function writeBase(params: URLSearchParams, filters: BaseTransactionFilters) {
  params.set("type", filters.type);
  params.set("status", filters.status);
  const q = cleanText(filters.q);
  if (q) {
    params.set("q", q);
  } else {
    params.delete("q");
  }
  writeIds(params, "categories", filters.categories);
  writeIds(params, "recordedBy", filters.recordedBy);
  writeIds(params, "paidBy", filters.paidBy);
}

export function readLedgerFilters(
  searchParams: URLSearchParams,
  fallbackMonth = currentMonth(new Date()),
) {
  const rawMonth = searchParams.get("month");
  const month = isValidPlainMonth(rawMonth) ? rawMonth : fallbackMonth;
  return {
    month,
    q: cleanText(searchParams.get("q")),
    type: readType(searchParams.get("type")),
    status: readStatus(searchParams.get("status")),
    categories: readIds(searchParams.get("categories")),
    recordedBy: readIds(searchParams.get("recordedBy")),
    paidBy: readIds(searchParams.get("paidBy")),
  };
}

export function readSearchFilters(searchParams: URLSearchParams) {
  return {
    q: cleanText(searchParams.get("q")),
    type: readType(searchParams.get("type")),
    status: readStatus(searchParams.get("status")),
    categories: readIds(searchParams.get("categories")),
    recordedBy: readIds(searchParams.get("recordedBy")),
    paidBy: readIds(searchParams.get("paidBy")),
    from: isValidPlainDate(searchParams.get("from")) ? (searchParams.get("from") ?? "") : "",
    to: isValidPlainDate(searchParams.get("to")) ? (searchParams.get("to") ?? "") : "",
    min: validAmountInput(searchParams.get("min")),
    max: validAmountInput(searchParams.get("max")),
  };
}

export function writeLedgerFilters(params: URLSearchParams, filters: LedgerFilters) {
  params.set("month", filters.month);
  writeBase(params, filters);
}

export function writeSearchFilters(params: URLSearchParams, filters: SearchFilters) {
  writeBase(params, filters);
  if (filters.from && isValidPlainDate(filters.from)) {
    params.set("from", filters.from);
  } else {
    params.delete("from");
  }
  if (filters.to && isValidPlainDate(filters.to)) {
    params.set("to", filters.to);
  } else {
    params.delete("to");
  }
  writeAmount(params, "min", filters.min);
  writeAmount(params, "max", filters.max);
}

export function canonicalLedgerParams(filters: LedgerFilters, preserve?: URLSearchParams) {
  const params = new URLSearchParams();
  writeLedgerFilters(params, filters);
  for (const [key, value] of preserve ?? []) {
    if (key !== "month" && !LEDGER_FILTER_PARAMS.includes(key)) {
      params.append(key, value);
    }
  }
  return params;
}

export function canonicalSearchParams(filters: SearchFilters) {
  const params = new URLSearchParams();
  writeSearchFilters(params, filters);
  return params;
}

export function defaultLedgerFilters(month: PlainMonth): LedgerFilters {
  return {
    month,
    q: "",
    type: DEFAULT_TYPE,
    status: DEFAULT_STATUS,
    categories: [],
    recordedBy: [],
    paidBy: [],
  };
}

export function defaultSearchFilters(): SearchFilters {
  return {
    q: "",
    type: DEFAULT_TYPE,
    status: DEFAULT_STATUS,
    categories: [],
    recordedBy: [],
    paidBy: [],
    from: "",
    to: "",
    min: "",
    max: "",
  };
}

export function activeFilterCount(filters: BaseTransactionFilters | SearchFilters) {
  let count = 0;
  if (filters.q) count += 1;
  if (filters.type !== DEFAULT_TYPE) count += 1;
  if (filters.status !== DEFAULT_STATUS) count += 1;
  if (filters.categories.length > 0) count += 1;
  if (filters.recordedBy.length > 0) count += 1;
  if (filters.paidBy.length > 0) count += 1;
  if ("from" in filters && filters.from) count += 1;
  if ("to" in filters && filters.to) count += 1;
  if ("min" in filters && filters.min) count += 1;
  if ("max" in filters && filters.max) count += 1;
  return count;
}

export function toMinorUnits(value: string) {
  if (!value.trim()) {
    return undefined;
  }
  if (value.trim() === "0") {
    return 0;
  }
  const parsed = parseAmountToMinorUnits(value);
  return parsed.ok ? parsed.minorUnits : undefined;
}

export function dropUnknownIds(
  filters: BaseTransactionFilters,
  opts: { categoryIds: string[]; memberIds: string[] },
) {
  const categories = new Set(opts.categoryIds);
  const members = new Set(opts.memberIds);
  return {
    ...filters,
    categories: filters.categories.filter((id) => categories.has(id)),
    recordedBy: filters.recordedBy.filter((id) => members.has(id)),
    paidBy: filters.paidBy.filter((id) => members.has(id)),
  };
}

function validAmountInput(value: string | null) {
  if (!value) {
    return "";
  }
  const trimmed = value.trim();
  if (trimmed === "0") {
    return "0";
  }
  return parseAmountToMinorUnits(trimmed).ok ? trimmed : "";
}

function writeAmount(params: URLSearchParams, key: string, value: string) {
  const clean = validAmountInput(value);
  if (clean) {
    params.set(key, clean);
  } else {
    params.delete(key);
  }
}
