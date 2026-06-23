import type { Doc, Id } from "../convex/_generated/dataModel.js";
import type { MutationCtx, QueryCtx } from "../convex/_generated/server.js";

/** Lists all notification rows for a User (test helper — not a public API). */
export async function listNotificationsForUser(ctx: QueryCtx | MutationCtx, userId: Id<"users">) {
  return await ctx.db
    .query("notifications")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
}

/** Newest unread notification for a User, or null when none. */
export async function latestUnreadNotificationForUser(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
) {
  const rows = await listNotificationsForUser(ctx, userId);
  return rows.filter((row) => !row.read).sort((a, b) => b.createdAt - a.createdAt)[0] ?? null;
}

export type NotificationRow = Doc<"notifications">;
