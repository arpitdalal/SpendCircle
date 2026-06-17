/** The static URL segment that scopes Circle routes (`/circles/…`). Mirrors
 * `prefix("circles", …)` in routes.ts — kept in sync by circle-path.test.ts. */
export const CIRCLES_SEGMENT = "circles";

/** First-segment values under `/circles/` that are STATIC routes, NOT Circle refs:
 * they live ABOVE the Circle guard (siblings of `:circleRef`). Mirrors the static
 * `route("new", …)` in routes.ts. ADR 0016: a canonical slug-id ref is never one of
 * these, so excluding them is safe. */
export const RESERVED_CIRCLE_REFS = ["new"] as const;

const RESERVED_CIRCLE_REF_SET = new Set<string>(RESERVED_CIRCLE_REFS);

/** `/circles/<ref>` as a COMPLETE first segment: ref non-empty, terminated by a path/
 * query/hash delimiter or end-of-string. `[^/?#]+` stops the ref at the first delimiter,
 * so this works for a bare pathname OR a full path+query+hash. */
const CIRCLE_SCOPED_PATH = /^\/circles\/([^/?#]+)(?:[/?#]|$)/;

/** One browser-style percent-decode of a single path segment. Malformed `%` sequences
 * return `null` — the segment cannot be normalized, so the path is not Circle-scoped. */
function decodePathSegment(segment: string) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

/**
 * The Circle ref a path is scoped to (`/circles/<ref>/…` → `<ref>`), or `null` when the
 * path is not Circle-scoped or its first segment is a RESERVED static route (e.g.
 * `/circles/new`, which lives above the Circle guard). The single runtime source of
 * truth for "which Circle does this path belong to" — consumed by the skeleton partition
 * and the returnTo validator so neither re-encodes the structure. Accepts a bare pathname
 * or a full path+query+hash.
 */
export function circleRefOf(path: string) {
  const ref = path.match(CIRCLE_SCOPED_PATH)?.[1];
  if (ref == null) {
    return null;
  }
  const decoded = decodePathSegment(ref);
  if (decoded == null) {
    return null;
  }
  return RESERVED_CIRCLE_REF_SET.has(decoded) ? null : decoded;
}

/** Whether `path` is a real in-Circle object path (`/circles/<ref>/…`, non-reserved ref).
 * The structural half of returnTo validation (return-to-url.ts layers its safety checks
 * on top) and of the skeleton's "is this a Circle route" check. */
export function isCircleScopedPath(path: string) {
  return circleRefOf(path) !== null;
}

/** Build an in-Circle path from a ref and child segments: `circlePath("trip-c1",
 * "transactions") → "/circles/trip-c1/transactions"`. The runtime-built counterpart of
 * RR's typed `href()` for the cases that need a plain string (e.g. returnTo fallbacks). */
export function circlePath(ref: string, ...segments: string[]) {
  return [``, CIRCLES_SEGMENT, ref, ...segments].join("/");
}
