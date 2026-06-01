import { type ParsedRef, parseRef } from "@spend-circle/domain";

/**
 * Client-side ID validator injected into the domain ref parser. It only rejects
 * obviously malformed segments; the authoritative check is server-side
 * (`ctx.db.normalizeId`), which returns null for invalid IDs (ADR 0016).
 */
function isConvexId(candidate: string): boolean {
  return /^[a-z0-9]+$/i.test(candidate);
}

/**
 * Parses a Circle ref from the URL. The Circle-scoped object guards
 * (transactions/:transactionRef, categories/:categoryRef) parse identically —
 * same `isConvexId` validator, differing only in the route param read and the
 * query subscribed — so when they land they reuse `parseRef(ref, isConvexId)`
 * directly (ADR 0016); only the resolution adapter varies, not the parser. No
 * object-specific wrapper is added until an object guard actually exists.
 */
export function parseCircleRef(ref: string | undefined): ParsedRef | null {
  if (!ref) {
    return null;
  }
  return parseRef(ref, isConvexId);
}
