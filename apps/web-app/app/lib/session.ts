import { api } from "@spend-circle/convex";
import { useConvexAuth, useQuery } from "convex/react";
import { MOCKS } from "./env.js";

/**
 * The three-state auth model the protected layout gates on (ADR 0017):
 *  - loading: auth is still resolving → show splash
 *  - unauthenticated: no Google session → redirect to /signin
 *  - onboarding: Google session exists but no Spend Circle User yet → bootstrap
 *  - ready: bootstrapped User → render the app shell
 */
export type AppSession =
  | { state: "loading" }
  | { state: "unauthenticated" }
  | { state: "onboarding" }
  | { state: "ready"; user: SessionUser };

export interface SessionUser {
  id: string;
  email: string;
  displayName: string;
  image?: string;
}

function useRealSession(): AppSession {
  const { isLoading, isAuthenticated } = useConvexAuth();
  // Only subscribe to the User once authenticated; `"skip"` avoids an
  // unauthenticated query that would always error.
  const user = useQuery(api.users.getCurrentUser, isAuthenticated ? {} : "skip");

  if (isLoading) {
    return { state: "loading" };
  }
  if (!isAuthenticated) {
    return { state: "unauthenticated" };
  }
  if (user === undefined) {
    return { state: "loading" };
  }
  if (user === null) {
    return { state: "onboarding" };
  }
  return {
    state: "ready",
    user: {
      id: user._id,
      email: user.email,
      displayName: user.displayName,
      image: user.image,
    },
  };
}

/**
 * Mock-mode session: the dev auth bypass injects a ready User without touching
 * Google or the backend, so Playwright never drives the OAuth flow (ADR 0006).
 */
function useMockSession(): AppSession {
  return {
    state: "ready",
    user: {
      id: "mock-user",
      email: "mock@spend-circle.test",
      displayName: "Mock Member",
    },
  };
}

// Selected once at module load — MOCKS is a build-time constant, so the chosen
// hook is stable across renders and the production build drops the mock path.
export const useAppSession: () => AppSession = MOCKS ? useMockSession : useRealSession;
