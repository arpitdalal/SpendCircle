import type { FeedbackType } from "@spend-circle/domain";

import type { LifecycleFilter, TypeFilter } from "./transaction-filter-url.js";

/** Transaction / ledger filter type values allowed in analytics payloads. */
export type AnalyticsTransactionType = Extract<TypeFilter, "expense" | "income" | "all">;

/** Lifecycle filter values allowed in analytics payloads. */
export type AnalyticsLifecycleStatus = LifecycleFilter;

export type AnalyticsCategorySource = "standalone" | "transaction_inline";

export type AnalyticsExportResult = "downloaded" | "too_many" | "inaccessible" | "failed";

export type AnalyticsFeedbackType = FeedbackType;

export const FORBIDDEN_ANALYTICS_PROP_KEYS = [
  "amount",
  "amountMinorUnits",
  "min",
  "max",
  "title",
  "note",
  "message",
  "feedback",
  "feedbackText",
  "query",
  "q",
  "search",
  "email",
  "displayName",
  "name",
  "circleName",
  "categoryName",
  "memberName",
  "id",
  "ids",
  "circleId",
  "categoryId",
  "memberId",
  "transactionId",
  "ref",
  "url",
  "returnTo",
] as const;

const FORBIDDEN_KEY_SET = new Set<string>(FORBIDDEN_ANALYTICS_PROP_KEYS);

export type AnalyticsEventMap = {
  circle_created: { currency: string };
  transaction_added: {
    type: AnalyticsTransactionType;
    paidBySelf: boolean;
    categoryCount: number;
  };
  category_created: {
    type: Extract<AnalyticsTransactionType, "expense" | "income">;
    source: AnalyticsCategorySource;
  };
  ledger_filter_applied: {
    type: AnalyticsTransactionType;
    status: AnalyticsLifecycleStatus;
    hasQuery: boolean;
    categoryCount: number;
    recordedByCount: number;
    paidByCount: number;
    monthOffset: number;
  };
  transaction_search_submitted: {
    type: AnalyticsTransactionType;
    status: AnalyticsLifecycleStatus;
    hasQuery: boolean;
    hasDateRange: boolean;
    hasAmountRange: boolean;
    categoryCount: number;
    recordedByCount: number;
    paidByCount: number;
  };
  transaction_search_page_changed: { page: number };
  export_performed: {
    status: AnalyticsLifecycleStatus;
    result: AnalyticsExportResult;
    hasQuery: boolean;
    hasDateRange: boolean;
    hasAmountRange: boolean;
  };
  feedback_submitted: { type: AnalyticsFeedbackType };
};

export type AnalyticsEvent = keyof AnalyticsEventMap;

const EVENT_ALLOWLISTS: Record<AnalyticsEvent, ReadonlySet<string>> = {
  circle_created: new Set(["currency"]),
  transaction_added: new Set(["type", "paidBySelf", "categoryCount"]),
  category_created: new Set(["type", "source"]),
  ledger_filter_applied: new Set([
    "type",
    "status",
    "hasQuery",
    "categoryCount",
    "recordedByCount",
    "paidByCount",
    "monthOffset",
  ]),
  transaction_search_submitted: new Set([
    "type",
    "status",
    "hasQuery",
    "hasDateRange",
    "hasAmountRange",
    "categoryCount",
    "recordedByCount",
    "paidByCount",
  ]),
  transaction_search_page_changed: new Set(["page"]),
  export_performed: new Set(["status", "result", "hasQuery", "hasDateRange", "hasAmountRange"]),
  feedback_submitted: new Set(["type"]),
};

const TRANSACTION_TYPES = new Set<AnalyticsTransactionType>(["expense", "income", "all"]);
const CATEGORY_TYPES = new Set(["expense", "income"] as const);
const LIFECYCLE_STATUSES = new Set<AnalyticsLifecycleStatus>(["active", "archived", "all"]);
const CATEGORY_SOURCES = new Set<AnalyticsCategorySource>(["standalone", "transaction_inline"]);
const EXPORT_RESULTS = new Set<AnalyticsExportResult>([
  "downloaded",
  "too_many",
  "inaccessible",
  "failed",
]);
const FEEDBACK_TYPES = new Set<AnalyticsFeedbackType>(["bug", "feature", "currency"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasForbiddenKey(key: string) {
  return FORBIDDEN_KEY_SET.has(key);
}

function validatePropValue(event: AnalyticsEvent, key: string, value: unknown) {
  if (value === undefined) {
    return false;
  }
  switch (event) {
    case "circle_created":
      return key === "currency" && typeof value === "string" && value.length > 0;
    case "transaction_added":
      if (key === "type") return TRANSACTION_TYPES.has(value as AnalyticsTransactionType);
      if (key === "paidBySelf") return typeof value === "boolean";
      if (key === "categoryCount")
        return typeof value === "number" && Number.isInteger(value) && value >= 0;
      return false;
    case "category_created":
      if (key === "type") return CATEGORY_TYPES.has(value as "expense" | "income");
      if (key === "source") return CATEGORY_SOURCES.has(value as AnalyticsCategorySource);
      return false;
    case "ledger_filter_applied":
    case "transaction_search_submitted":
      if (key === "type") return TRANSACTION_TYPES.has(value as AnalyticsTransactionType);
      if (key === "status") return LIFECYCLE_STATUSES.has(value as AnalyticsLifecycleStatus);
      if (key === "hasQuery" || key === "hasDateRange" || key === "hasAmountRange") {
        return typeof value === "boolean";
      }
      if (key === "categoryCount" || key === "recordedByCount" || key === "paidByCount") {
        return typeof value === "number" && Number.isInteger(value) && value >= 0;
      }
      if (key === "monthOffset" && event === "ledger_filter_applied") {
        return typeof value === "number" && Number.isInteger(value);
      }
      return false;
    case "transaction_search_page_changed":
      return key === "page" && typeof value === "number" && Number.isInteger(value) && value > 0;
    case "export_performed":
      if (key === "status") return LIFECYCLE_STATUSES.has(value as AnalyticsLifecycleStatus);
      if (key === "result") return EXPORT_RESULTS.has(value as AnalyticsExportResult);
      if (key === "hasQuery" || key === "hasDateRange" || key === "hasAmountRange") {
        return typeof value === "boolean";
      }
      return false;
    case "feedback_submitted":
      return key === "type" && FEEDBACK_TYPES.has(value as AnalyticsFeedbackType);
    default:
      return false;
  }
}

export function sanitizeAnalyticsProps<E extends AnalyticsEvent>(
  event: E,
  props: AnalyticsEventMap[E] | undefined,
) {
  if (props === undefined) {
    return null;
  }
  if (!isRecord(props)) {
    return null;
  }

  const allowlist = EVENT_ALLOWLISTS[event];
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(props)) {
    if (hasForbiddenKey(key) || !allowlist.has(key)) {
      continue;
    }
    if (!validatePropValue(event, key, value)) {
      continue;
    }
    sanitized[key] = value;
  }

  for (const required of allowlist) {
    if (!(required in sanitized)) {
      return null;
    }
  }

  return sanitized as AnalyticsEventMap[E];
}

export function isAnalyticsEvent(event: string): event is AnalyticsEvent {
  return event in EVENT_ALLOWLISTS;
}
