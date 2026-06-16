import { api } from "@spend-circle/convex";
import { getFunctionName } from "convex/server";
import type { EntityDouble } from "./contract.js";

/** The fields the session model reads off `getCurrentUser` (see `lib/session.ts`).
 * Kept to exactly that surface so the double models the contract the app consumes. */
export interface CurrentUserView {
  _id: string;
  email: string;
  displayName: string;
  image?: string;
}

export interface UsersState {
  /** `getCurrentUser` — `undefined` ≡ auth/user still loading, `null` ≡ authenticated
   * but no Spend Circle User yet (onboarding), an object ≡ a bootstrapped User (ready).
   * Lets a test drive the REAL protected layout's session state machine. */
  currentUser?: CurrentUserView | null;
}

export function usersDouble(state: UsersState): EntityDouble {
  const { currentUser } = state;
  return {
    queries: {
      [getFunctionName(api.users.getCurrentUser)]: () => currentUser,
    },
  };
}

/** Default ready-User fixture for shell tests. */
export function makeCurrentUserView(over: Partial<CurrentUserView> = {}): CurrentUserView {
  return {
    _id: "user-self",
    email: "you@example.com",
    displayName: "You",
    ...over,
  };
}
