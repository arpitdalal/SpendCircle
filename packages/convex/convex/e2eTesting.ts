import { v } from "convex/values";
import { mutation } from "./_generated/server.js";
import { requireCircleAccess } from "./guard.js";

/**
 * E2E-only helper (ADR 0019): marks a non-owner Member removed so Playwright can
 * exercise rejoin before MEM-5 ships. Eliminated in production (`E2E_TEST_AUTH` unset).
 */
export const markMemberRemovedForE2E = mutation({
  args: {
    circleId: v.id("circles"),
    memberId: v.id("members"),
  },
  handler: async (ctx, args) => {
    if (process.env.E2E_TEST_AUTH !== "1") {
      throw new Error("Not found");
    }

    const access = await requireCircleAccess(ctx, args.circleId);
    if (!access.isOwner) {
      throw new Error("Not found");
    }

    const target = await ctx.db.get(args.memberId);
    if (!target || target.circleId !== args.circleId || target.role === "owner") {
      throw new Error("Not found");
    }
    if (target.status === "removed") {
      return;
    }

    await ctx.db.patch(args.memberId, {
      status: "removed",
      removedAt: Date.now(),
    });
  },
});
