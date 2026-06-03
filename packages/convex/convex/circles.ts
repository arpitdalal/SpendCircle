import { buildRef, circleInputSchema, DEFAULT_COLOR_ID } from "@spend-circle/domain";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel.js";
import { mutation, query } from "./_generated/server.js";
import { requireCurrentUser } from "./auth.js";
import { requireCircleAccess, resolveCircleAccess } from "./guard.js";
import { circleEntity, recordEvent } from "./history.js";

/** A Circle plus its canonical ref, shaped for the client. */
function toCircleView(circle: Doc<"circles">) {
  return {
    id: circle._id,
    ref: buildRef(circle.name, circle._id),
    name: circle.name,
    kind: circle.kind,
    currency: circle.currency,
    color: circle.color,
    mark: circle.mark,
    status: circle.status,
    currencyLocked: circle.currencyLocked,
  };
}

/** Circles the current User is an active Member of, Personal Circle first. */
export const listMyCircles = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireCurrentUser(ctx);
    const memberships = await ctx.db
      .query("members")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    const circles: Doc<"circles">[] = [];
    for (const membership of memberships) {
      if (membership.status !== "active") {
        continue;
      }
      const circle = await ctx.db.get(membership.circleId);
      if (circle) {
        circles.push(circle);
      }
    }

    circles.sort((a, b) => {
      if (a.kind !== b.kind) {
        return a.kind === "personal" ? -1 : 1;
      }
      return a.createdAt - b.createdAt;
    });

    return circles.map(toCircleView);
  },
});

/**
 * Resolves a single Circle by its authoritative ID for the staged route guard
 * (ADR 0016/0017). Returns null when missing or inaccessible without
 * distinguishing the two cases.
 */
export const getCircle = query({
  // Accepts the raw trailing-segment ID from the route ref. A malformed ID
  // normalizes to null (treated as unavailable) rather than throwing, so the
  // guard's fallback path stays uniform (ADR 0016).
  args: { circleId: v.string() },
  handler: async (ctx, args) => {
    const circleId = ctx.db.normalizeId("circles", args.circleId);
    if (!circleId) {
      return null;
    }
    const access = await resolveCircleAccess(ctx, circleId);
    return access ? toCircleView(access.circle) : null;
  },
});

/** Creates a regular Circle owned by the current User (PRD story 6). */
export const createCircle = mutation({
  args: {
    name: v.string(),
    currency: v.string(),
    color: v.string(),
    mark: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const input = circleInputSchema.parse(args);
    const now = Date.now();

    const circleId = await ctx.db.insert("circles", {
      name: input.name,
      kind: "regular",
      currency: input.currency,
      color: input.color || DEFAULT_COLOR_ID,
      mark: input.mark,
      ownerUserId: user._id,
      status: "active",
      currencyLocked: false,
      createdAt: now,
    });

    const memberId = await ctx.db.insert("members", {
      circleId,
      userId: user._id,
      role: "owner",
      status: "active",
      displayName: user.displayName,
      image: user.image,
      joinedAt: now,
    });

    const ownerMembership = await ctx.db.get(memberId);
    await recordEvent(ctx, {
      entity: circleEntity(circleId),
      actor: ownerMembership,
      action: "created",
      changes: [{ field: "name", to: input.name }], // no `from` on create
    });

    return circleId;
  },
});

/** Renames a Circle the caller owns (PRD stories 5, 79). */
export const renameCircle = mutation({
  args: { circleId: v.id("circles"), name: v.string() },
  handler: async (ctx, args) => {
    const access = await requireCircleAccess(ctx, args.circleId);
    if (!access.isOwner) {
      throw new Error("Only the owner can rename this circle");
    }
    access.assertWritable(); // an archived Circle is read-only (PRD story 79)

    const name = args.name.trim();
    if (name === "") {
      throw new Error("Name is required");
    }
    if (name === access.circle.name) {
      return; // no-op: nothing changed, so nothing to record
    }

    await ctx.db.patch(access.circle._id, { name });
    await recordEvent(ctx, {
      entity: circleEntity(access.circle._id),
      actor: access.membership,
      action: "renamed",
      changes: [{ field: "name", from: access.circle.name, to: name }],
    });
  },
});
