/**
 * Notion-style canonical refs: a human-readable slug plus the authoritative
 * object ID, e.g. "my-home-c1" or "rent-t1" (ADR 0016). The ID is the only
 * lookup key; the slug exists only to make history and shared links readable.
 *
 * Parsing extracts the final hyphen-delimited segment as the ID and validates
 * it with an *injected* validator, so Convex ID rules never leak into this pure
 * domain package. Raw IDs (no slug) and stale slugs both parse; callers resolve
 * by ID and then canonicalize via replace navigation.
 */
export interface ParsedRef {
  /** The authoritative object ID (the trailing segment). */
  readonly id: string;
  /** The leading slug, or "" when the ref was a bare ID. */
  readonly slug: string;
}

export type IdValidator = (candidate: string) => boolean;

export function parseRef(ref: string, isValidId: IdValidator): ParsedRef | null {
  if (ref === "") {
    return null;
  }
  const lastDash = ref.lastIndexOf("-");
  if (lastDash === -1) {
    // Bare ID, no slug prefix.
    return isValidId(ref) ? { id: ref, slug: "" } : null;
  }
  const id = ref.slice(lastDash + 1);
  const slug = ref.slice(0, lastDash);
  if (!isValidId(id)) {
    return null;
  }
  return { id, slug };
}

/** Converts a human name into a URL-safe slug segment. */
export function slugify(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** Builds the canonical "slug-id" ref from a display name and an ID. */
export function buildRef(name: string, id: string): string {
  const slug = slugify(name);
  return slug === "" ? id : `${slug}-${id}`;
}

/** True when the given ref already matches the canonical ref for name+id. */
export function isCanonicalRef(ref: string, name: string, id: string): boolean {
  return ref === buildRef(name, id);
}
