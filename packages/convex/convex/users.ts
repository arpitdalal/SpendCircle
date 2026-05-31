import { v } from "convex/values";
import { mutation, query } from "./_generated/server.js";
import { getCurrentUserOrNull } from "./auth.js";

/**
 * The current Spend Circle User, or null when the Google session exists but the
 * User record has not propagated yet. The protected layout uses this to choose
 * between the onboarding splash and the app shell (ADR 0017). The User and
 * Personal Circle are created by the `onCreateUser` trigger in auth.ts.
 */
export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    return await getCurrentUserOrNull(ctx);
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
