/**
 * Byte-identical URL primitives shared by the filter URL codecs
 * (`transaction-filter-url.ts`, `categories-filter-url.ts`). Per-surface
 * vocabulary (`readType`, omit-defaults policy, preserve loops) stays in those
 * modules — do not fold differing policies in here.
 */

/** Single source of truth for lifecycle clamping; type derives from this array. */
const LIFECYCLE_STATUSES = ["active", "archived", "all"] as const; // This use of `as` is fine because it's a const array
export type LifecycleFilterStatus = (typeof LIFECYCLE_STATUSES)[number];

export function cleanText(value: string | null) {
  return (value ?? "").trim().replace(/\s+/g, " ");
}

export function readLifecycleStatus(value: string | null, defaultStatus: LifecycleFilterStatus) {
  if (value === null) {
    return defaultStatus;
  }
  for (const status of LIFECYCLE_STATUSES) {
    if (value === status) {
      return status;
    }
  }
  return defaultStatus;
}

export function readIds(value: string | null) {
  const ids = new Set<string>();
  for (const part of (value ?? "").split(",")) {
    const id = part.trim();
    if (id) {
      ids.add(id);
    }
  }
  return [...ids].sort();
}

export function writeIds(params: URLSearchParams, key: string, ids: string[]) {
  const unique = [
    ...new Set(
      ids.flatMap((id) => {
        const trimmed = id.trim();
        return trimmed ? [trimmed] : [];
      }),
    ),
  ].sort();
  if (unique.length > 0) {
    params.set(key, unique.join(","));
  } else {
    params.delete(key);
  }
}

/** 1-based page index from a URL param; invalid or out-of-range → 1. */
export function readPositiveIntPageParam(value: string | null, maxPage: number) {
  const raw = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(raw) || raw < 1) {
    return 1;
  }
  return Math.min(maxPage, Math.floor(raw));
}

/** Writes `page` only when >1; clamps to `maxPage`. */
export function writePositiveIntPageParam(
  params: URLSearchParams,
  key: string,
  page: number,
  maxPage: number,
) {
  const clamped = Math.min(maxPage, Math.max(1, Math.floor(page)));
  if (clamped <= 1) {
    params.delete(key);
  } else {
    params.set(key, String(clamped));
  }
}
