import { api } from "@spend-circle/convex";
import { useConvexAuth, useQuery } from "convex/react";
import { useParams } from "react-router";
import type { Circle } from "./data.js";
import { MOCKS } from "./env.js";
import { mockCircle } from "./fixtures.js";
import { parseCircleRef } from "./refs.js";
import { type Resolution, useResolvedRef } from "./use-resolved-ref.js";

export type { Circle };

/** Stable canonical path for a Circle, fed to the resolution primitive's deps. */
const circleCanonicalPath = (circle: Circle): string => `/circles/${circle.ref}`;

/**
 * The Circle adapter over the shared resolution primitive (ADR 0016/0017): read
 * `circleRef`, parse it, subscribe by id (synthesizing in mock mode), then hand
 * `parsed` + `value` to {@link useResolvedRef}, which owns the pending /
 * canonicalize / fall-back state machine. The upcoming object guards
 * (transactions/:transactionRef, categories/:categoryRef) are the same adapter
 * shape, additionally reading the resolved Circle from Outlet context (useCircle)
 * for their Circle-scoped query args and a Circle-route fallback.
 *
 * The fallback for an inaccessible Circle is the User's default safe route ("/").
 * Because resolution is staged, an inaccessible Circle means object guards never
 * mount, so object existence cannot leak.
 */
export function useResolvedCircle(fallback = "/"): Resolution<Circle> {
  const { circleRef } = useParams();
  const { isAuthenticated } = useConvexAuth();

  const parsed = parseCircleRef(circleRef);
  const queried = useQuery(
    api.circles.getCircle,
    parsed && !MOCKS && isAuthenticated ? { circleId: parsed.id } : "skip",
  );
  // Mock mode synthesizes the Circle from the ref so E2E can render Circle routes
  // without a live backend; real mode uses the reactive query (ADR 0006).
  const value = MOCKS && parsed ? mockCircle(parsed.id) : queried;

  return useResolvedRef<Circle>({
    rawRef: circleRef,
    parsed: parsed != null,
    value,
    canonicalPath: circleCanonicalPath,
    fallback,
  });
}
