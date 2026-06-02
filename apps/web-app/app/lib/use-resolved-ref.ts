import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router";
import { reportAppError } from "./report-error.js";
import { type UnavailableTarget, useSnackbar } from "./snackbar.js";

/**
 * The shared staged-ref-resolution primitive (ADR 0016/0017) — a small state
 * machine with no Convex, no MOCKS, and no knowledge of route-param names, so it
 * is its own test surface. Per-object adapters (the Circle guard, and the
 * upcoming transactions/:transactionRef & categories/:categoryRef object guards)
 * own the subscribe and feed this `parsed` + `value`; this owns the dance every
 * guard shares: show pending UI while loading, canonicalize a stale ref via
 * replace navigation, or fire the generic unavailable-link snackbar and fall back
 * to a safe route.
 *
 * Outcome classes: an unparseable ref and an inaccessible target look IDENTICAL
 * to the user (the same snackbar + fallback — ADR 0016 anti-enumeration), but
 * differ in cause. Unparseable means the app emitted a bad link — a bug we should
 * fix — so it is also reported via `reportAppError` (warning; Sentry later, ADR
 * 0012). Inaccessible is an expected permission outcome and stays silent.
 *
 * Why only the Circle adapter exists today: this primitive is the reusable core
 * the object guards (transactions/:transactionRef, categories/:categoryRef) will
 * share, but those routes are still placeholders, so their adapters are
 * deliberately NOT written yet — a caller-less `useResolvedTransaction` would be
 * untested code that fails the deletion test. Extracting the state machine now
 * (rather than copy-pasting it later) is the payoff; the adapter is a ~15-line
 * shell — see `useResolvedCircle` — and an object adapter additionally reads the
 * resolved Circle from Outlet context (`useCircle`) for its query args and a
 * Circle-route fallback. Build each adapter with the route that needs it.
 */
export type Resolution<T> = { status: "pending" } | { status: "ready"; value: T };

export interface ResolvedRefOptions<T extends { ref: string }> {
  /** The raw URL segment, as the adapter read it from the route params. */
  rawRef: string | undefined;
  /** Whether `rawRef` parsed into a usable id; `false` ⇒ unparseable ⇒ reported. */
  parsed: boolean;
  /** `undefined` while loading, `null` when inaccessible/missing, the object when found. */
  value: T | null | undefined;
  /** Where to send the user when the ref is unparseable or inaccessible. */
  fallback: string;
  /**
   * Which closed-vocabulary snackbar message to fire on an unavailable target
   * (ADR 0016). A token, never free text — the copy lives in `snackbar.tsx`.
   * Defaults to `"link"` (the generic bad-link message).
   */
  unavailableTarget?: UnavailableTarget;
}

/**
 * Builds the canonical URL by rewriting ONLY the stale ref segment in place,
 * preserving the rest of the path (child routes, nested object refs), query, and
 * hash (ADR 0016). This is what keeps the primitive route-agnostic: it never
 * needs the route prefix or any child-route name, because the URL the user is
 * already on carries them — we swap the one segment this guard owns and leave the
 * rest untouched.
 *
 * The match is exact-segment equality, never a substring `replace`: refs are
 * `slug-id` with a globally-unique id baked in, so the stale segment cannot
 * collide with any other segment (e.g. a Circle ref `home-c1` can never equal an
 * object ref `home-t1`), and `home-c1` cannot corrupt a longer `home-c1-x`.
 */
function canonicalizeRefSegment(
  location: { pathname: string; search: string; hash: string },
  staleRef: string,
  canonicalRef: string,
): string {
  const segments = location.pathname.split("/");
  const index = segments.indexOf(staleRef);
  if (index === -1) {
    // The stale segment isn't present (already canonical, or an unexpected
    // shape) — leave the URL exactly as-is rather than guess.
    return location.pathname + location.search + location.hash;
  }
  segments[index] = canonicalRef;
  return segments.join("/") + location.search + location.hash;
}

export function useResolvedRef<T extends { ref: string }>(
  options: ResolvedRefOptions<T>,
): Resolution<T> {
  const { rawRef, parsed, value, fallback, unavailableTarget = "link" } = options;
  const navigate = useNavigate();
  const location = useLocation();
  const { showUnavailable } = useSnackbar();

  const unparseable = !parsed;
  // A resolved query of `null` means missing or inaccessible — indistinguishable.
  const inaccessible = parsed && value === null;
  const unavailable = unparseable || inaccessible;
  // A resolved value whose canonical ref differs from the URL ⇒ stale slug.
  const staleRef = value != null && rawRef != null && value.ref !== rawRef;

  useEffect(() => {
    if (!unavailable) {
      return;
    }
    if (unparseable) {
      reportAppError("Unparseable ref in URL", { rawRef });
    }
    showUnavailable(unavailableTarget);
    navigate(fallback, { replace: true });
  }, [unavailable, unparseable, rawRef, fallback, navigate, showUnavailable, unavailableTarget]);

  useEffect(() => {
    if (staleRef && value && rawRef != null) {
      navigate(canonicalizeRefSegment(location, rawRef, value.ref), {
        replace: true,
      });
    }
  }, [staleRef, value, rawRef, location, navigate]);

  if (!value) {
    return { status: "pending" };
  }
  return { status: "ready", value };
}
