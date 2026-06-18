import { useEffect, useState } from "react";
import { useLocation, useNavigation } from "react-router";
import { circleRefOf } from "./circle-path.js";

/**
 * The flicker guard (issue #121). Warm/cached navigations settle in <1 frame; a
 * skeleton shown then would flash. Hold the shell skeleton back until a route has
 * been loading longer than this, so only genuinely slow chunk downloads display it.
 */
export const SKELETON_DELAY_MS = 120;

/**
 * The route-tree partition between the two shell layouts (issue #121). The Circle
 * layout covers a navigation ONLY when it stays within the SAME Circle: there the
 * layout stays mounted and its chrome (header, tabs, bottom bar) is still correct,
 * so only the child outlet need skeleton. The protected layout covers everything
 * else — its direct children (Home/Settings/Onboarding/Create Circle), crossing
 * into/out of a Circle, AND switching BETWEEN Circles. A cross-Circle switch must
 * fall through to the shell: the Circle chrome is derived from the params, which RR
 * has not committed yet during the pending nav, so leaving the Circle layout in
 * charge would render the SOURCE Circle's name/nav over the destination's slow
 * load. The two predicates are complementary, so exactly one layout ever swaps.
 */
export function coversCircleNavigation(from: string, to: string) {
  const ref = circleRefOf(from);
  return ref !== null && ref === circleRefOf(to);
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

  // Identify the SPECIFIC pending navigation, not just "is something pending". React
  // Router collapses a second navigation started mid-flight into the same `"loading"`
  // state, so an `active` boolean stays `true` across two different targets and the
  // debounce below would never restart — a fast chained nav would inherit the previous
  // navigation's already-elapsed timer and could flash the skeleton. `location.key` is
  // the pending target's history-entry id (unique per navigation, even to the same
  // pathname); fall back to the pathname if a router build omits it.
  const pendingKey = active ? (navigation.location?.key ?? to) : null;

  // `armed` flips after the flicker delay. The returned value ANDs it with `pendingKey`
  // so a timer that fires after the navigation settles cannot leave the skeleton stuck
  // over the outlet (pathname can commit before `navigation.state` idles).
  const [armed, setArmed] = useState(false);
  const [prevPendingKey, setPrevPendingKey] = useState(pendingKey);
  if (pendingKey !== prevPendingKey) {
    setPrevPendingKey(pendingKey);
    setArmed(false);
  }

  useEffect(() => {
    if (pendingKey === null) {
      return;
    }
    const handle = setTimeout(() => setArmed(true), delayMs);
    return () => clearTimeout(handle);
  }, [pendingKey, delayMs]);

  return pendingKey !== null && armed;
}
