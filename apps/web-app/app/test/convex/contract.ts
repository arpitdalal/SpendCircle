import type { Mock } from "vitest";
import type { PaginationStatus } from "~/lib/data.js";

export interface PaginatedPage {
  results: unknown[];
  status: PaginationStatus;
  loadMore: (n?: number) => void;
}

/**
 * One entity's contribution to the Convex double, keyed by stable function name
 * (`getFunctionName`) — each module computes its own names from `api`.
 */
export interface EntityDouble {
  queries?: Record<string, (args: Record<string, unknown>) => unknown>;
  paginatedQueries?: Record<string, (args: Record<string, unknown>) => PaginatedPage>;
  mutations?: Record<string, Mock | undefined>;
}

function isQueryResolver<R>(
  value: R | ((args: Record<string, unknown>) => R),
): value is (args: Record<string, unknown>) => R {
  return typeof value === "function";
}

/** The repeated `typeof x === "function" ? x(args) : x` pattern, once. */
export function resolveWith<R>(
  value: R | undefined | ((args: Record<string, unknown>) => R),
  args: Record<string, unknown>,
) {
  if (value === undefined) return undefined;
  if (isQueryResolver(value)) {
    return value(args);
  }
  return value;
}
