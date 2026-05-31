import { useEffect } from "react";
import { useNavigate } from "react-router";
import { reportAppError } from "./report-error.js";
import { useSnackbar } from "./snackbar.js";

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
  /** The canonical path for a resolved value. MUST be stable (module-level or memoized). */
  canonicalPath: (value: T) => string;
  /** Where to send the user when the ref is unparseable or inaccessible. */
  fallback: string;
}

export function useResolvedRef<T extends { ref: string }>(
  options: ResolvedRefOptions<T>,
): Resolution<T> {
  const { rawRef, parsed, value, canonicalPath, fallback } = options;
  const navigate = useNavigate();
  const { showUnavailableLink } = useSnackbar();

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
    showUnavailableLink();
    navigate(fallback, { replace: true });
  }, [unavailable, unparseable, rawRef, fallback, navigate, showUnavailableLink]);

  useEffect(() => {
    if (staleRef && value) {
      navigate(canonicalPath(value), { replace: true });
    }
  }, [staleRef, value, canonicalPath, navigate]);

  if (!value) {
    return { status: "pending" };
  }
  return { status: "ready", value };
}
