import { v } from "convex/values";
import { mutation } from "./_generated/server.js";
import { requireCurrentUser } from "./auth.js";
import { hashInvitationToken } from "./invitationToken.js";

/**
 * E2E-only invitation acceptance (ADR 0019). Playwright needs a real non-owner
 * Member to exercise leave-circle flows before MEM-3 ships the public accept path.
 * Gated on `E2E_TEST_AUTH=1` — never enabled in production.
 */
export const acceptInvitationForE2E = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    if (process.env.E2E_TEST_AUTH !== "1") {
      throw new Error("Forbidden");
    }

    const user = await requireCurrentUser(ctx);
    const tokenHash = await hashInvitationToken(args.token);
    const invite = await ctx.db
      .query("invitations")
      .withIndex("by_token_hash", (q) => q.eq("tokenHash", tokenHash))
      .unique();

    const now = Date.now();
    if (invite?.status !== "pending" || (invite?.expiresAt ?? 0) <= now) {
      throw new Error("Invalid invitation");
    }
    if (user.email !== invite.emailLower) {
      throw new Error("Email mismatch");
    }

    const existing = await ctx.db
      .query("members")
      .withIndex("by_circle_and_user", (q) =>
        q.eq("circleId", invite.circleId).eq("userId", user._id),
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        status: "active",
        displayName: user.displayName,
        removedAt: undefined,
      });
    } else {
      await ctx.db.insert("members", {
        circleId: invite.circleId,
        userId: user._id,
        role: "member",
        status: "active",
        displayName: user.displayName,
        joinedAt: now,
      });
    }

    await ctx.db.patch(invite._id, { status: "accepted" });
  },
});
