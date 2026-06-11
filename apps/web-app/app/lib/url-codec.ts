/**
 * Byte-identical URL primitives shared by the filter URL codecs
 * (`transaction-filter-url.ts`, `categories-filter-url.ts`). Per-surface
 * vocabulary (`readType`, omit-defaults policy, preserve loops) stays in those
 * modules — do not fold differing policies in here.
 */

/** Single source of truth for lifecycle clamping; type derives from this array. */
export const LIFECYCLE_STATUSES = ["active", "archived", "all"] as const; // This use of `as` is fine because it's a const array
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
  const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))].sort();
  if (unique.length > 0) {
    params.set(key, unique.join(","));
  } else {
    params.delete(key);
  }
}
