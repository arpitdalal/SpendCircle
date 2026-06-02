import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel.js";
import { query } from "./_generated/server.js";
import { resolveCircleAccess } from "./guard.js";

/**
 * A Member shaped for the client. Reads the per-Circle MATERIALIZED identity
 * (`members.displayName`/`image`) — current for an active Member, frozen for a
 * Removed Member (ADR 0018, PRD story 43) — so callers never join to live User
 * rows and a removed Member renders with their frozen name automatically. The
 * raw `userId` is deliberately NOT surfaced; selectors and lists key on the
 * Member id. `isSelf` flags the caller's own Member so a selector can default to
 * them and label them distinctly without leaking ids.
 */
function toMemberView(member: Doc<"members">, currentMemberId: Doc<"members">["_id"]) {
  return {
    id: member._id,
    displayName: member.displayName,
    image: member.image,
    role: member.role,
    status: member.status,
    joinedAt: member.joinedAt,
    isSelf: member._id === currentMemberId,
  };
}

export type MemberView = ReturnType<typeof toMemberView>;

/**
 * Lists a Circle's Members, active-only by default, Owner first (PRD story 43).
 * Resolver query (ADR 0016): an inaccessible or missing Circle returns `null`,
 * identical to a non-member — never leaking whether the Circle exists.
 * `includeRemoved` widens to Removed Members for history/search/Paid-By-filter
 * contexts where frozen identities still matter.
 */
export const listMembers = query({
  args: {
    circleId: v.id("circles"),
    includeRemoved: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const access = await resolveCircleAccess(ctx, args.circleId);
    if (!access) {
      return null; // missing ≡ inaccessible (ADR 0016)
    }

    const members = await ctx.db
      .query("members")
      .withIndex("by_circle", (q) => q.eq("circleId", args.circleId))
      .collect();

    const visible = args.includeRemoved
      ? members
      : members.filter((member) => member.status === "active");

    // Owner first, then stable by join time — a fixed anchor for the management
    // surfaces and the Paid By selector that consume this.
    visible.sort((a, b) => {
      if (a.role !== b.role) {
        return a.role === "owner" ? -1 : 1;
      }
      return a.joinedAt - b.joinedAt;
    });

    return visible.map((member) => toMemberView(member, access.membership._id));
  },
});
