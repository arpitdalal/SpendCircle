import { parseNotificationLinkPath } from "@spend-circle/domain";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel.js";
import { mutation, type QueryCtx, query } from "./_generated/server.js";
import { requireCurrentUser } from "./auth.js";
import { resolveCircleAccess } from "./guard.js";

/** Badge cap — scan at most CAP+1 unread rows so the UI can render `99+`. */
export const UNREAD_COUNT_CAP = 99;

function isConvexIdSegment(candidate: string) {
  return /^[a-z0-9]+$/i.test(candidate);
}

const NOT_FOUND = "Notification not found";

/**
 * Re-resolves a stored notification link at read time (NTF-1). Returns the link
 * when the caller still has Circle access and the referenced object exists in that
 * Circle; otherwise `undefined` (text-only, indistinguishable from never-linked).
 */
export async function resolveNotificationLink(
  ctx: QueryCtx,
  link: string | undefined,
): Promise<string | undefined> {
  if (!link) {
    return undefined;
  }

  const parsed = parseNotificationLinkPath(link, isConvexIdSegment);
  if (!parsed) {
    return undefined;
  }

  const circleId = ctx.db.normalizeId("circles", parsed.circleId);
  if (!circleId) {
    return undefined;
  }

  const access = await resolveCircleAccess(ctx, circleId);
  if (!access) {
    return undefined;
  }

  if (parsed.kind === "circle") {
    return link;
  }

  if (parsed.kind === "transaction") {
    const objectId = ctx.db.normalizeId("transactions", parsed.objectId ?? "");
    if (!objectId) {
      return undefined;
    }
    const transaction = await ctx.db.get(objectId);
    if (!transaction || transaction.circleId !== circleId) {
      return undefined;
    }
    return link;
  }

  const categoryId = ctx.db.normalizeId("categories", parsed.objectId ?? "");
  if (!categoryId) {
    return undefined;
  }
  const category = await ctx.db.get(categoryId);
  if (!category || category.circleId !== circleId) {
    return undefined;
  }
  return link;
}

async function toNotificationView(ctx: QueryCtx, row: Doc<"notifications">) {
  const link = await resolveNotificationLink(ctx, row.link);
  return {
    id: row._id,
    type: row.type,
    title: row.title,
    body: row.body,
    link,
    read: row.read,
    createdAt: row.createdAt,
  };
}

/** The caller's notifications, newest first, with links re-resolved for access. */
export const listNotifications = query({
  args: {
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const result = await ctx.db
      .query("notifications")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .paginate(args.paginationOpts);

    const page = await Promise.all(result.page.map((row) => toNotificationView(ctx, row)));
    return { ...result, page };
  },
});

/** Unread count for the header badge, capped so the scan stays bounded. */
export const getUnreadCount = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireCurrentUser(ctx);
    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_user_and_read", (q) => q.eq("userId", user._id).eq("read", false))
      .take(UNREAD_COUNT_CAP + 1);
    return {
      count: Math.min(unread.length, UNREAD_COUNT_CAP),
      hasMore: unread.length > UNREAD_COUNT_CAP,
    };
  },
});

/** Marks one notification read for the current User; no-op when already read. */
export const markNotificationRead = mutation({
  args: {
    notificationId: v.id("notifications"),
  },
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const row = await ctx.db.get(args.notificationId);
    if (!row || row.userId !== user._id) {
      throw new Error(NOT_FOUND);
    }
    if (!row.read) {
      await ctx.db.patch(args.notificationId, { read: true });
    }
  },
});

/** Marks every unread notification read for the current User. */
export const markAllRead = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireCurrentUser(ctx);
    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_user_and_read", (q) => q.eq("userId", user._id).eq("read", false))
      .collect();
    for (const row of unread) {
      await ctx.db.patch(row._id, { read: true });
    }
  },
});
