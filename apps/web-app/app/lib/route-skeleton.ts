import { useEffect, useState } from "react";
import { useLocation, useNavigation } from "react-router";

/**
 * The flicker guard (issue #121). Warm/cached navigations settle in <1 frame; a
 * skeleton shown then would flash. Hold the shell skeleton back until a route has
 * been loading longer than this, so only genuinely slow chunk downloads display it.
 */
export const SKELETON_DELAY_MS = 120;

/** Whether a pathname is a Circle-scoped route (`/circles/:ref…`). The static
 * `/circles/new` create flow lives ABOVE the Circle guard, so it is NOT one — it is
 * a direct child of the protected layout like Home/Settings. */
export function isCircleRoute(pathname: string) {
  return /^\/circles\/(?!new(?:\/|$))[^/]+/.test(pathname);
}

/**
 * The route-tree partition between the two shell layouts (issue #121). When BOTH
 * sides of a navigation are Circle routes, the Circle layout stays mounted and owns
 * the content swap (chrome — header, tabs, bottom bar — stays put); so the Circle
 * layout covers exactly those, and the protected layout covers everything else
 * (its direct children — Home/Settings/Onboarding/Create Circle — and crossing
 * into/out of a Circle). The two are complementary, so a single navigation is ever
 * covered by exactly one layout — they never both swap to a skeleton at once.
 */
export function coversCircleNavigation(from: string, to: string) {
  return isCircleRoute(from) && isCircleRoute(to);
}

export function coversShellNavigation(from: string, to: string) {
  return !coversCircleNavigation(from, to);
}

/**
 * Drives a layout's Phase-1 shell skeleton from the router's pending navigation.
 * With no RR loaders/actions in this app (all data is reactive Convex), a navigation
 * sits in `state === "loading"` purely while the destination route MODULE downloads —
 * exactly the uncovered slow-connection window this issue targets.
 *
 * `shouldCover(from, to)` is the caller's predicate for "this navigation is mine to
 * cover", so each layout owns its slice of the route tree while the debounce lives
 * here once (CLAUDE.md: encode the contract in one place). The pathname compare it
 * builds on also guards same-route search-param changes (e.g. the dashboard
 * `month`/`paidBy` filters): those keep the pathname, so they never blow the page
 * away to a skeleton.
 */
export function usePendingRouteSkeleton(
  shouldCover: (from: string, to: string) => boolean,
  delayMs = SKELETON_DELAY_MS,
) {
  const navigation = useNavigation();
  const location = useLocation();
  const to = navigation.location?.pathname ?? null;
  const active =
    navigation.state === "loading" &&
    to !== null &&
    to !== location.pathname &&
    shouldCover(location.pathname, to);

  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!active) {
      setShown(false);
      return;
    }
    const handle = setTimeout(() => setShown(true), delayMs);
    return () => clearTimeout(handle);
  }, [active, delayMs]);

  return shown;
}
