import { v } from "convex/values";
import { mutation } from "./_generated/server.js";
import { requireCircleAccess } from "./guard.js";

/**
 * E2E-only helpers (ADR 0019). Gated by `E2E_TEST_AUTH=1` on the backend — absent
 * in production. Playwright uses these until MEM-3's accept-invitation flow ships.
 */
export const seedActiveMember = mutation({
  args: {
    circleId: v.id("circles"),
    email: v.string(),
    displayName: v.string(),
  },
  handler: async (ctx, args) => {
    if (process.env.E2E_TEST_AUTH !== "1") {
      throw new Error("Not found");
    }

    const access = await requireCircleAccess(ctx, args.circleId);
    if (!access.isOwner || access.circle.kind === "personal") {
      throw new Error("Circle not found");
    }
    access.assertWritable();

    const email = args.email.trim().toLowerCase();
    let user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();

    if (!user) {
      const now = Date.now();
      const userId = await ctx.db.insert("users", {
        email,
        displayName: args.displayName,
        acceptedTermsVersion: "2026-05-01",
        acceptedPrivacyVersion: "2026-05-01",
        acceptedAt: now,
        analyticsOptOut: false,
        onboardingCompletedAt: now,
        createdAt: now,
      });
      user = await ctx.db.get(userId);
    }

    if (!user) {
      throw new Error("seed failed");
    }

    const existing = await ctx.db
      .query("members")
      .withIndex("by_circle_and_user", (q) =>
        q.eq("circleId", args.circleId).eq("userId", user._id),
      )
      .unique();

    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        status: "active",
        displayName: args.displayName,
        removedAt: undefined,
      });
      return { memberId: existing._id };
    }

    const memberId = await ctx.db.insert("members", {
      circleId: args.circleId,
      userId: user._id,
      role: "member",
      status: "active",
      displayName: args.displayName,
      joinedAt: now,
    });

    return { memberId };
  },
});
