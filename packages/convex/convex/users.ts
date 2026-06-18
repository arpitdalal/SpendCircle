import { initials, parseProfileUpdate, personalCircleName } from "@spend-circle/domain";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel.js";
import { mutation, query } from "./_generated/server.js";
import { getCurrentUserOrNull, requireCurrentUser } from "./auth.js";
import { getPersonalCircleForOwner, setUserDisplayName } from "./model.js";

/**
 * The current-user view the protected layout and settings read (ADR 0003). Derived
 * from the User row so the client cannot drift from the backend contract.
 */
export function toCurrentUserView(user: Doc<"users">) {
  return {
    id: user._id,
    email: user.email,
    displayName: user.displayName,
    image: user.image,
    onboardingComplete: user.onboardingCompletedAt !== null,
  };
}

/**
 * The current Spend Circle User, or null when the Google session exists but the
 * User record has not propagated yet. The protected layout uses this to choose
 * between the bootstrap splash and the app shell (ADR 0017). The User and
 * Personal Circle are created by the `onCreateUser` trigger in auth.ts.
 */
export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUserOrNull(ctx);
    return user ? toCurrentUserView(user) : null;
  },
});

/** One-time Onboarding confirmation: owned Display Name + Personal Circle reconcile (USR-1). */
export const completeOnboarding = mutation({
  args: { displayName: v.string() },
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    if (user.onboardingCompletedAt !== null) {
      throw new Error("Onboarding already completed");
    }

    const parsed = parseProfileUpdate({ displayName: args.displayName });
    if (!parsed.ok) {
      throw new Error(parsed.error);
    }
    const confirmedName = parsed.value.displayName;

    if (confirmedName !== user.displayName) {
      await setUserDisplayName(ctx, user._id, confirmedName);
    }

    const personalCircle = await getPersonalCircleForOwner(ctx, user._id);
    if (personalCircle) {
      const reconciledName = personalCircleName(confirmedName);
      if (personalCircle.name !== reconciledName) {
        await ctx.db.patch(personalCircle._id, {
          name: reconciledName,
          mark: initials(reconciledName),
        });
      }
    }

    const now = Date.now();
    await ctx.db.patch(user._id, { onboardingCompletedAt: now });
  },
});

/**
 * Post-onboarding Display Name edit (Settings). Updates member materialized identity
 * only — the Personal Circle name/mark were reconciled once in `completeOnboarding`
 * and are intentionally not renamed here (USR-1 one-shot reconcile).
 */
export const updateProfile = mutation({
  args: { displayName: v.string() },
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const parsed = parseProfileUpdate({ displayName: args.displayName });
    if (!parsed.ok) {
      throw new Error(parsed.error);
    }
    await setUserDisplayName(ctx, user._id, parsed.value.displayName);
  },
});

/** Toggles the product-analytics opt-out preference (ADR 0013). */
export const setAnalyticsOptOut = mutation({
  args: { optOut: v.boolean() },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrNull(ctx);
    if (!user) {
      throw new Error("Not authenticated");
    }
    await ctx.db.patch(user._id, { analyticsOptOut: args.optOut });
  },
});
