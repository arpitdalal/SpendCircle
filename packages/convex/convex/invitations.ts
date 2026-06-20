import { inviteEmailSchema, MUTATION_ERRORS, mutationErrorData } from "@spend-circle/domain";
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel.js";
import type { MutationCtx } from "./_generated/server.js";
import { mutation, query } from "./_generated/server.js";
import { requireCircleAccess, resolveCircleAccess } from "./guard.js";
import { circleEntity, recordEvent } from "./history.js";
import { generateInvitationToken, hashInvitationToken } from "./invitationToken.js";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const DAILY_INVITATION_EMAIL_CAP = 100;
const PER_EMAIL_RESEND_CAP = 3;

function countRecentInvitationEmails(
  invitations: Doc<"invitations">[],
  userId: Id<"users">,
  now: number,
): number {
  const windowStart = now - DAY_MS;
  let count = 0;
  for (const invitation of invitations) {
    if (invitation.invitedByUserId !== userId) continue;
    if (invitation.createdAt > windowStart) count++;
    for (const ts of invitation.resendTimestamps ?? []) {
      if (ts > windowStart) count++;
    }
  }
  return count;
}

async function assertUnderDailyInvitationCap(
  ctx: MutationCtx,
  userId: Id<"users">,
  now: number,
): Promise<void> {
  const recentByUser = await ctx.db
    .query("invitations")
    .withIndex("by_invitedByUserId", (q) => q.eq("invitedByUserId", userId))
    .take(DAILY_INVITATION_EMAIL_CAP + 1);
  if (countRecentInvitationEmails(recentByUser, userId, now) >= DAILY_INVITATION_EMAIL_CAP) {
    throw new ConvexError(mutationErrorData(MUTATION_ERRORS.inviteDailyCapReached));
  }
}

/**
 * Creates a hashed, 7-day Invitation for a regular Circle (MEM-2). Returns the
 * plaintext token to the inviting Owner for manual link delivery until EML-2 moves
 * sending server-side — at that point this return should be removed.
 */
export const createInvitation = mutation({
  args: {
    circleId: v.id("circles"),
    email: v.string(),
  },
  handler: async (ctx, args) => {
    const access = await requireCircleAccess(ctx, args.circleId);

    if (!access.isOwner) {
      throw new ConvexError(mutationErrorData(MUTATION_ERRORS.inviteForbidden));
    }

    access.assertWritable();

    if (access.circle.kind === "personal") {
      throw new ConvexError(mutationErrorData(MUTATION_ERRORS.invitePersonalCircle));
    }

    if (access.circle.setupCompletedAt === null) {
      throw new ConvexError(mutationErrorData(MUTATION_ERRORS.inviteSetupIncomplete));
    }

    const { email } = inviteEmailSchema.parse({ email: args.email });

    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
    if (existingUser) {
      const membership = await ctx.db
        .query("members")
        .withIndex("by_circle_and_user", (q) =>
          q.eq("circleId", args.circleId).eq("userId", existingUser._id),
        )
        .unique();
      if (membership?.status === "active") {
        throw new ConvexError(mutationErrorData(MUTATION_ERRORS.inviteAlreadyMember));
      }
    }

    const now = Date.now();
    const existingInvites = await ctx.db
      .query("invitations")
      .withIndex("by_circle_and_email", (q) =>
        q.eq("circleId", args.circleId).eq("emailLower", email),
      )
      .collect();
    const hasPending = existingInvites.some(
      (invite) => invite.status === "pending" && invite.expiresAt > now,
    );
    if (hasPending) {
      throw new ConvexError(mutationErrorData(MUTATION_ERRORS.inviteAlreadyPending));
    }

    await assertUnderDailyInvitationCap(ctx, access.user._id, now);

    const token = generateInvitationToken();
    const tokenHash = await hashInvitationToken(token);

    await ctx.db.insert("invitations", {
      circleId: args.circleId,
      emailLower: email,
      tokenHash,
      status: "pending",
      invitedByUserId: access.user._id,
      resendCount: 0,
      resendTimestamps: [],
      createdAt: now,
      expiresAt: now + INVITE_TTL_MS,
    });

    await recordEvent(ctx, {
      entity: circleEntity(access.circle._id),
      actor: access.membership,
      action: "member invited",
      changes: [{ field: "email", to: email }],
    });

    return { token };
  },
});

/** Owner-only pending invitations for a Circle (MEM-4). */
export const listPendingInvitations = query({
  args: { circleId: v.id("circles") },
  handler: async (ctx, args) => {
    const access = await resolveCircleAccess(ctx, args.circleId);
    if (!access?.isOwner) {
      return null;
    }

    const now = Date.now();
    // Pending invitations per Circle are bounded: at most one non-expired pending row
    // per email (create rejects duplicates; revoked/accepted rows are filtered out).
    const invitations = await ctx.db
      .query("invitations")
      .withIndex("by_circle", (q) => q.eq("circleId", args.circleId))
      .collect();

    return invitations
      .filter((invitation) => invitation.status === "pending" && invitation.expiresAt > now)
      .map((invitation) => ({
        id: invitation._id,
        email: invitation.emailLower,
        createdAt: invitation.createdAt,
        expiresAt: invitation.expiresAt,
        resendCount: invitation.resendCount,
      }));
  },
});

/** Rotates a pending invitation's token and refreshes its expiry (MEM-4). */
export const resendInvitation = mutation({
  args: { invitationId: v.id("invitations") },
  handler: async (ctx, args) => {
    const invitation = await ctx.db.get(args.invitationId);
    if (!invitation) {
      throw new Error("Invitation not found");
    }

    const access = await requireCircleAccess(ctx, invitation.circleId);

    if (!access.isOwner) {
      throw new ConvexError(mutationErrorData(MUTATION_ERRORS.inviteForbidden));
    }

    access.assertWritable();

    if (invitation.circleId !== access.circle._id) {
      throw new Error("Invitation not found");
    }

    const now = Date.now();
    if (invitation.status !== "pending" || invitation.expiresAt <= now) {
      throw new Error("Invitation not found");
    }

    if (access.circle.setupCompletedAt === null) {
      throw new ConvexError(mutationErrorData(MUTATION_ERRORS.inviteSetupIncomplete));
    }

    const recentResends = (invitation.resendTimestamps ?? []).filter((ts) => ts > now - DAY_MS);
    if (recentResends.length >= PER_EMAIL_RESEND_CAP) {
      throw new ConvexError(mutationErrorData(MUTATION_ERRORS.inviteResendCapReached));
    }

    await assertUnderDailyInvitationCap(ctx, access.user._id, now);

    const token = generateInvitationToken();
    const tokenHash = await hashInvitationToken(token);

    await ctx.db.patch(args.invitationId, {
      tokenHash,
      expiresAt: now + INVITE_TTL_MS,
      resendCount: invitation.resendCount + 1,
      resendTimestamps: [...(invitation.resendTimestamps ?? []), now],
    });

    await recordEvent(ctx, {
      entity: circleEntity(access.circle._id),
      actor: access.membership,
      action: "invitation resent",
      changes: [{ field: "email", to: invitation.emailLower }],
    });

    return { token };
  },
});

/** Revokes a pending invitation (MEM-4). */
export const revokeInvitation = mutation({
  args: { invitationId: v.id("invitations") },
  handler: async (ctx, args) => {
    const invitation = await ctx.db.get(args.invitationId);
    if (!invitation) {
      throw new Error("Invitation not found");
    }

    const access = await requireCircleAccess(ctx, invitation.circleId);

    if (!access.isOwner) {
      throw new ConvexError(mutationErrorData(MUTATION_ERRORS.inviteForbidden));
    }

    access.assertWritable();

    if (invitation.circleId !== access.circle._id) {
      throw new Error("Invitation not found");
    }

    if (invitation.status !== "pending") {
      throw new Error("Invitation not found");
    }

    await ctx.db.patch(args.invitationId, { status: "revoked" });

    await recordEvent(ctx, {
      entity: circleEntity(access.circle._id),
      actor: access.membership,
      action: "invitation revoked",
      changes: [{ field: "email", from: invitation.emailLower }],
    });
  },
});
