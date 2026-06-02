import { categoryInputSchema, colorLabel } from "@spend-circle/domain";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel.js";
import { type QueryCtx, mutation, query } from "./_generated/server.js";
import { requireCircleAccess, resolveCircleAccess } from "./guard.js";
import { categoryEntity, recordEvent } from "./history.js";

const transactionType = v.union(v.literal("expense"), v.literal("income"));

/**
 * A Category shaped for the client. The creator is surfaced as a Member
 * reference (Display Name + image) resolved from the materialized membership
 * identity (ADR 0018) — never a raw user id — so the UI can attribute the
 * Category without re-resolving. Categories created by a Removed Member stay
 * active (PRD story 53); the frozen removed-member identity is what shows.
 */
async function toCategoryView(ctx: QueryCtx, category: Doc<"categories">) {
  const creatorMembership = await ctx.db
    .query("members")
    .withIndex("by_circle_and_user", (q) =>
      q.eq("circleId", category.circleId).eq("userId", category.creatorUserId),
    )
    .unique();
  return {
    id: category._id,
    name: category.name,
    type: category.type,
    color: category.color,
    status: category.status,
    creator: {
      displayName: creatorMembership?.displayName ?? "Unknown member",
      image: creatorMembership?.image,
    },
  };
}

export type CategoryView = Awaited<ReturnType<typeof toCategoryView>>;

/**
 * Lists a Circle's Categories for one type, active by default. Resolver query
 * (ADR 0016): an inaccessible or missing Circle returns `null`, identical to a
 * non-member — never leaking whether the Circle exists. When `type` is omitted
 * both types are returned (the form's color/name de-dupe doesn't need it, but a
 * future combined view does); `includeArchived` widens to archived Categories
 * for historical surfaces.
 */
export const listCategories = query({
  args: {
    circleId: v.id("circles"),
    type: v.optional(transactionType),
    includeArchived: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const access = await resolveCircleAccess(ctx, args.circleId);
    if (!access) {
      return null; // missing ≡ inaccessible (ADR 0016)
    }

    const { circleId, type } = args;
    const categories = type
      ? await ctx.db
          .query("categories")
          .withIndex("by_circle_and_type", (q) => q.eq("circleId", circleId).eq("type", type))
          .collect()
      : await ctx.db
          .query("categories")
          .withIndex("by_circle", (q) => q.eq("circleId", circleId))
          .collect();

    const visible = args.includeArchived
      ? categories
      : categories.filter((category) => category.status === "active");

    // Newest first so a freshly created Category surfaces at the top.
    // `_creationTime` breaks ties when two rows share a `createdAt` millisecond.
    visible.sort((a, b) => b.createdAt - a.createdAt || b._creationTime - a._creationTime);

    return await Promise.all(visible.map((category) => toCategoryView(ctx, category)));
  },
});

/**
 * Creates a type-specific Category in a Circle (PRD stories 47–49, 59–61). Any
 * current Member may create — not just the Owner (PRD story 48) — so this gates
 * on `requireCircleAccess` + `assertWritable` only, with no owner check.
 *
 * The hard invariant lives here: names are unique per (Circle, type),
 * case-insensitively, and that uniqueness spans archived names too (PRD stories
 * 49, 54). We compare on the stored `nameLower` via `by_circle_type_name` and do
 * NOT filter by status, so an archived "Gas" still blocks a new "gas".
 */
export const createCategory = mutation({
  args: {
    circleId: v.id("circles"),
    name: v.string(),
    type: transactionType,
    color: v.string(),
  },
  handler: async (ctx, args) => {
    const access = await requireCircleAccess(ctx, args.circleId);
    access.assertWritable(); // an archived Circle is read-only (PRD story 79)

    const input = categoryInputSchema.parse({
      name: args.name,
      type: args.type,
      color: args.color,
    });
    const nameLower = input.name.toLowerCase();

    // Uniqueness across ALL statuses — archived names are still reserved.
    const existing = await ctx.db
      .query("categories")
      .withIndex("by_circle_type_name", (q) =>
        q.eq("circleId", args.circleId).eq("type", input.type).eq("nameLower", nameLower),
      )
      .first();
    if (existing) {
      throw new Error("A category with this name already exists for this type");
    }

    const categoryId = await ctx.db.insert("categories", {
      circleId: args.circleId,
      name: input.name,
      nameLower,
      type: input.type,
      color: input.color,
      creatorUserId: access.user._id,
      status: "active",
      createdAt: Date.now(),
    });

    // Record the create now (ADR 0018) even though the Category History view is
    // CAT-2 — its view needs this row to exist. Values are pre-formatted human
    // strings: the color label, never the raw id.
    await recordEvent(ctx, {
      entity: categoryEntity(categoryId),
      actor: access.membership,
      action: "created",
      changes: [
        { field: "name", to: input.name },
        { field: "color", to: colorLabel(input.color) },
        { field: "type", to: input.type },
      ],
    });

    return categoryId;
  },
});
