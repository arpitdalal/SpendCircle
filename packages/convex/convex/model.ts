import { DEFAULT_COLOR_ID, DEFAULT_CURRENCY, isSupportedCurrency } from "@spend-circle/domain";
import type { Id } from "./_generated/dataModel.js";
import type { MutationCtx } from "./_generated/server.js";

/**
 * Bootstrap helpers for new User creation. These hold no dependency on the
 * Better Auth wiring (that lives in auth.ts), so they are easy to unit-test
 * with convex-test. Permission and lifecycle checks live in guard.ts (ADR 0015).
 */

// Versions of the legal documents accepted via the sign-in wrap (ADR 0014).
const CURRENT_TERMS_VERSION = "2026-05-01";
const CURRENT_PRIVACY_VERSION = "2026-05-01";

export interface NewUserProfile {
  email: string;
  displayName: string;
  image?: string;
  currency?: string;
}

/**
 * Creates the Spend Circle User and their always-solo Personal Circle (PRD
 * stories 1, 3, 4). Invoked by the Better Auth `onCreateUser` trigger on first
 * sign-in, and reusable as the bootstrap invariant in tests.
 */
export async function createUserWithPersonalCircle(
  ctx: MutationCtx,
  profile: NewUserProfile,
): Promise<Id<"users">> {
  const now = Date.now();

  const userId = await ctx.db.insert("users", {
    email: profile.email,
    displayName: profile.displayName,
    image: profile.image,
    acceptedTermsVersion: CURRENT_TERMS_VERSION,
    acceptedPrivacyVersion: CURRENT_PRIVACY_VERSION,
    acceptedAt: now,
    analyticsOptOut: false,
    createdAt: now,
  });

  const currency =
    profile.currency && isSupportedCurrency(profile.currency) ? profile.currency : DEFAULT_CURRENCY;

  const circleId = await ctx.db.insert("circles", {
    name: "Personal",
    kind: "personal",
    currency,
    color: DEFAULT_COLOR_ID,
    mark: "P",
    ownerUserId: userId,
    status: "active",
    currencyLocked: false,
    createdAt: now,
  });

  await ctx.db.insert("members", {
    circleId,
    userId,
    role: "owner",
    status: "active",
    displayName: profile.displayName,
    image: profile.image,
    joinedAt: now,
  });

  return userId;
}

/**
 * Mirrors a User's current Google profile onto their Spend Circle User row and
 * every ACTIVE membership's materialized identity (ADR 0018). This is the single
 * propagation path for member `displayName`/`image`: removed memberships are left
 * untouched so they stay frozen at the name they showed when the Member left, and
 * refresh again only when the row is reactivated on rejoin.
 *
 * Invoked by the Better Auth `onUpdateUser` trigger (auth.ts) and reusable as the
 * propagation invariant in tests. No-ops when the User has not been bootstrapped.
 */
export async function propagateUserProfile(
  ctx: MutationCtx,
  userId: Id<"users">,
  profile: { displayName: string; image?: string },
): Promise<void> {
  const user = await ctx.db.get(userId);
  if (!user) {
    return;
  }

  await ctx.db.patch(userId, { displayName: profile.displayName, image: profile.image });

  const memberships = await ctx.db
    .query("members")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  for (const membership of memberships) {
    if (membership.status === "active") {
      await ctx.db.patch(membership._id, {
        displayName: profile.displayName,
        image: profile.image,
      });
    }
  }
}
