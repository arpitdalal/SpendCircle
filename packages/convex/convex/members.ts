import { MUTATION_ERRORS, mutationErrorData } from "@spend-circle/domain";
import { ConvexError, v } from "convex/values";
import type { Doc } from "./_generated/dataModel.js";
import { mutation, query } from "./_generated/server.js";
import { requireCircleAccess, resolveCircleAccess } from "./guard.js";
import { circleEntity, recordEvent } from "./history.js";

/**
 * A Member shaped for the client. Reads the per-Circle MATERIALIZED identity
 * (`members.displayName`/`image`) — current for an active Member, frozen for a
 * Removed Member (ADR 0018, PRD story 43) — so callers never join to live User
 * rows and a removed Member renders with their frozen name automatically. The
 * raw `userId` is deliberately NOT surfaced; selectors and lists key on the
 * Member id. `isSelf` flags the caller's own Member so a selector can default to
 * them and label them distinctly without leaking ids.
 */
export function toMemberView(member: Doc<"members">, currentMemberId: Doc<"members">["_id"]) {
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

/**
 * Removes an active non-owner Member from a regular Circle (MEM-5). Status flip
 * only — the row stays so frozen identity and rejoin (MEM-3) keep working.
 */
export const removeMember = mutation({
  args: {
    circleId: v.id("circles"),
    memberId: v.id("members"),
  },
  handler: async (ctx, args) => {
    const access = await requireCircleAccess(ctx, args.circleId);

    if (!access.isOwner) {
      throw new ConvexError(mutationErrorData(MUTATION_ERRORS.memberRemoveForbidden));
    }

    access.assertWritable();

    if (access.circle.kind === "personal") {
      throw new Error("Circle not found");
    }

    const target = await ctx.db.get(args.memberId);
    if (!target || target.circleId !== args.circleId) {
      throw new Error("Member not found");
    }

    if (target.role === "owner") {
      throw new Error("Cannot remove the Circle owner — transfer ownership first (MEM-7)");
    }

    if (target.status === "removed") {
      throw new Error("Member is already removed");
    }

    const now = Date.now();
    await ctx.db.patch(args.memberId, { status: "removed", removedAt: now });

    await recordEvent(ctx, {
      entity: circleEntity(access.circle._id),
      actor: access.membership,
      action: "member removed",
      changes: [{ field: "member", from: target.displayName }],
    });
  },
});
