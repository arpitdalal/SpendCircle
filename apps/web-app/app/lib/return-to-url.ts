import { withQuery } from "./ledger-url.js";

/**
 * The app-wide `returnTo` codec (issue #123): the single, route-agnostic home for the
 * "where did this object route open FROM" origin, so no two call sites can drift on how
 * it is encoded or — critically — how it is validated.
 *
 * `returnTo` is a user-controllable string handed to client-side `navigate()`, i.e. an
 * open-redirect surface (the GHSA-2j2x-hqr9-3h42 / CVE-2026-22029 class). The router
 * version does not absolve us: that patch hardens the framework `redirect()` util, not
 * `navigate(<arbitrary user string>)`. Validating the value is the app's job — see
 * {@link parseReturnTo}, the `safeRedirect` allowlist-by-shape hardened with ADR 0016's
 * anti-enumeration scope: a valid `returnTo` is ALWAYS an in-Circle object path, and a
 * malformed / cross-origin / out-of-scope one is indistinguishable from an absent one
 * (both fall to the caller's safe route).
 */
export const RETURN_TO_PARAM = "returnTo";

/**
 * Appends `returnTo` (the current origin URL — pathname + search) onto an object-route
 * link so the route's close/back can return to the EXACT origin (ledger month, search
 * filters + page, dashboard scope, etc.). A falsy origin yields the bare path. `path`
 * carries no query of its own (object routes own only their `returnTo`), so the existing
 * {@link withQuery} join is the single encoding seam.
 */
export function withReturnTo(path: string, returnTo?: string) {
  if (!returnTo) {
    return path;
  }
  const params = new URLSearchParams();
  params.set(RETURN_TO_PARAM, returnTo);
  return withQuery(path, params.toString());
}

/** Cap absurd `returnTo` values (incl. pathological nesting) before any other work. */
const MAX_RETURN_TO_LENGTH = 2048;

/**
 * Control chars (NUL, TAB, CR, LF, … and DEL). A legitimately percent-encoded URL never
 * carries a literal control char once decoded, so their presence means a hand-crafted
 * value smuggling `\t`/`\n` past the shape checks (`/\t/evil.com`) — reject outright.
 */
// biome-ignore lint/suspicious/noControlCharactersInRegex: matching control chars is the point.
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

/**
 * A Circle-scoped object path: `/circles/<ref>` as a COMPLETE first segment, followed by
 * a path/query/hash delimiter or the end of the string. `[^/?#]+` forbids an empty ref
 * (`/circles//…`, `/circles/?…`). This is what encodes ADR 0016's "self-scoping" rule —
 * the `returnTo` carries its own Circle in the prefix, so the check is purely structural
 * and never compares against the current route's Circle.
 */
const CIRCLE_SCOPED_PATH = /^\/circles\/[^/?#]+(?:[/?#]|$)/;

/**
 * A `..` traversal segment in any of the forms the browser collapses to `..` during the
 * single percent-decode it applies while normalizing a path: literal `..`, or either dot
 * percent-encoded (`%2e.`, `.%2e`, `%2e%2e`, any case). The literal check alone misses the
 * encoded forms — `URLSearchParams` hands us `%2e%2e` undecoded, the segment string is not
 * `".."`, yet `navigate()` normalizes it to a climb out of the Circle scope. (Double
 * encoding like `%252e` decodes only to `%2e`, not `.`, in that one pass, so it never forms
 * a traversal segment and the shape checks already reject it.)
 */
const DOT_SEGMENT = /^(?:\.|%2e){2}$/i;

/**
 * Validates a raw `returnTo` query value, returning it only when it is a safe in-Circle
 * destination, else the caller's `fallback`. The `fallback` (a route the caller already
 * trusts — typically the Circle's ledger) covers every reject path, so a tampered value
 * never reaches `navigate()` and missing-vs-inaccessible stay indistinguishable (ADR
 * 0016). The value is only a navigation HINT — the destination route still resolves
 * through its own guard (`useResolvedRef`), so a well-formed but inaccessible path still
 * ejects via the normal fallback.
 */
export function parseReturnTo(raw: string | null, { fallback }: { fallback: string }) {
  if (!raw) {
    return fallback;
  }
  if (raw.length > MAX_RETURN_TO_LENGTH) {
    return fallback;
  }
  if (CONTROL_CHARS.test(raw)) {
    return fallback;
  }
  // Backslashes have no place in our URLs, and some browsers normalize `\` to `/` — so
  // `/\evil.com` would become a protocol-relative escape. Reject any, anywhere.
  if (raw.includes("\\")) {
    return fallback;
  }
  // Must be an app-internal absolute path, never protocol-relative (`//evil.com`).
  if (!raw.startsWith("/") || raw.startsWith("//")) {
    return fallback;
  }
  // Self-scoping (ADR 0016): only an in-Circle object path is a valid return origin —
  // not a top-level `/settings`, not another app area.
  if (!CIRCLE_SCOPED_PATH.test(raw)) {
    return fallback;
  }
  // Reject `..` traversal that could climb out of the Circle scope after the browser
  // normalizes the path — in literal OR percent-encoded form (`/circles/c1/../settings`,
  // `/circles/c1/%2e%2e/settings`). See {@link DOT_SEGMENT}.
  const [pathname = raw] = raw.split(/[?#]/, 1);
  if (pathname.split("/").some((segment) => DOT_SEGMENT.test(segment))) {
    return fallback;
  }
  return raw;
}
