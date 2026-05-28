import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  assertPersonalCircleMutation,
  categoryColors,
  circleColors,
  circleMark,
  resolveCurrency,
  starterCategoryNames,
  validateCurrency
} from "./domain";

type CircleWithCategories = Doc<"circles"> & {
  categories: Doc<"categories">[];
};

async function memberFor(ctx: MutationCtx, userId: Id<"users">, circleId: Id<"circles">) {
  return ctx.db
    .query("members")
    .withIndex("by_user_circle", (q) => q.eq("userId", userId).eq("circleId", circleId))
    .unique();
}

async function requireVisibleCircle(
  ctx: MutationCtx,
  userId: Id<"users">,
  circleId: Id<"circles">
) {
  const circle = await ctx.db.get(circleId);
  if (!circle || !(await memberFor(ctx, userId, circleId))) {
    throw new Error("Circle not visible.");
  }
  return circle;
}

async function requireOwner(ctx: MutationCtx, userId: Id<"users">, circle: Doc<"circles">) {
  const member = await memberFor(ctx, userId, circle._id);
  if (member?.role !== "owner") {
    throw new Error("Owner permission required.");
  }
}

export const listVisible = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args): Promise<CircleWithCategories[]> => {
    const memberDocs = await ctx.db
      .query("members")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    const circles = await Promise.all(
      memberDocs.map(async (member) => {
        const circle = await ctx.db.get(member.circleId);
        if (!circle) {
          return null;
        }
        const categories = await ctx.db
          .query("categories")
          .withIndex("by_circle", (q) => q.eq("circleId", circle._id))
          .collect();
        return { ...circle, categories };
      })
    );

    return circles.filter((circle): circle is CircleWithCategories => circle !== null);
  }
});

export const rename = mutation({
  args: {
    actorUserId: v.id("users"),
    circleId: v.id("circles"),
    name: v.string()
  },
  handler: async (ctx, args) => {
    const circle = await requireVisibleCircle(ctx, args.actorUserId, args.circleId);
    await ctx.db.patch(circle._id, { name: args.name.trim() });
    return ctx.db.get(circle._id);
  }
});

export const createRegular = mutation({
  args: {
    actorUserId: v.id("users"),
    name: v.string(),
    locale: v.string(),
    currency: v.optional(v.string()),
    setup: v.object({
      residenceType: v.optional(v.union(v.literal("leased"), v.literal("owned")))
    })
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.actorUserId);
    if (!user) {
      throw new Error("User required.");
    }

    const existingCircles = await ctx.db.query("circles").collect();
    const circleId = await ctx.db.insert("circles", {
      ownerUserId: user._id,
      kind: "regular",
      name: args.name.trim(),
      color: circleColors[existingCircles.length % circleColors.length],
      mark: circleMark(args.name),
      currency: args.currency === undefined ? resolveCurrency(args.locale) : validateCurrency(args.currency),
      archived: false,
      hasTransactions: false
    });
    await ctx.db.insert("members", {
      userId: user._id,
      circleId,
      role: "owner",
      displayNameSnapshot: user.displayName,
      profilePictureUrlSnapshot: user.profilePictureUrl
    });

    for (const [index, starter] of starterCategoryNames(args.setup).entries()) {
      await ctx.db.insert("categories", {
        circleId,
        name: starter.name,
        type: starter.type,
        color: categoryColors[index % categoryColors.length],
        createdByUserId: user._id,
        archived: false
      });
    }

    return ctx.db.get(circleId);
  }
});

export const updateCurrency = mutation({
  args: {
    actorUserId: v.id("users"),
    circleId: v.id("circles"),
    currency: v.string()
  },
  handler: async (ctx, args) => {
    const circle = await requireVisibleCircle(ctx, args.actorUserId, args.circleId);
    await requireOwner(ctx, args.actorUserId, circle);
    if (circle.hasTransactions) {
      throw new Error("Currency is locked after the first Transaction.");
    }
    await ctx.db.patch(circle._id, { currency: validateCurrency(args.currency) });
    return ctx.db.get(circle._id);
  }
});

export const recordTransactionForTest = mutation({
  args: { circleId: v.id("circles") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.circleId, { hasTransactions: true });
  }
});

export const inviteMember = mutation({
  args: { actorUserId: v.id("users"), circleId: v.id("circles") },
  handler: async (ctx, args) => {
    const circle = await requireVisibleCircle(ctx, args.actorUserId, args.circleId);
    assertPersonalCircleMutation(circle.kind, "invite Members");
  }
});

export const archiveCircle = mutation({
  args: { actorUserId: v.id("users"), circleId: v.id("circles") },
  handler: async (ctx, args) => {
    const circle = await requireVisibleCircle(ctx, args.actorUserId, args.circleId);
    assertPersonalCircleMutation(circle.kind, "be archived");
  }
});

export const deleteCircle = mutation({
  args: { actorUserId: v.id("users"), circleId: v.id("circles") },
  handler: async (ctx, args) => {
    const circle = await requireVisibleCircle(ctx, args.actorUserId, args.circleId);
    assertPersonalCircleMutation(circle.kind, "be deleted");
  }
});

export const leaveCircle = mutation({
  args: { actorUserId: v.id("users"), circleId: v.id("circles") },
  handler: async (ctx, args) => {
    const circle = await requireVisibleCircle(ctx, args.actorUserId, args.circleId);
    assertPersonalCircleMutation(circle.kind, "be left");
  }
});

export const transferOwnership = mutation({
  args: {
    actorUserId: v.id("users"),
    circleId: v.id("circles"),
    newOwnerUserId: v.id("users")
  },
  handler: async (ctx, args) => {
    void args.newOwnerUserId;
    const circle = await requireVisibleCircle(ctx, args.actorUserId, args.circleId);
    assertPersonalCircleMutation(circle.kind, "transfer ownership");
  }
});
