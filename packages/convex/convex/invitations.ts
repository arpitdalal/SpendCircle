import { inviteEmailSchema, MUTATION_ERRORS, mutationErrorData } from "@spend-circle/domain";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api.js";
import type { Doc, Id } from "./_generated/dataModel.js";
import type { MutationCtx, QueryCtx } from "./_generated/server.js";
import { mutation, query } from "./_generated/server.js";
import { requireCurrentUser } from "./auth.js";
import { emailPool } from "./email.js";
import { requireCircleAccess, resolveCircleAccess } from "./guard.js";
import { circleEntity, recordEvent } from "./history.js";
import { generateInvitationToken, hashInvitationToken } from "./invitationToken.js";

const INVITATION_INVALID = "Invitation invalid";

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

/** Creates a hashed, 7-day Invitation for a regular Circle (MEM-2) and enqueues email delivery (EML-2). */
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

    const invitationId = await ctx.db.insert("invitations", {
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

    await emailPool.enqueueAction(
      ctx,
      internal.email.sendInvitationEmail,
      { invitationId, token, resendCount: 0 },
      {
        onComplete: internal.email.onInvitationRunComplete,
        context: { invitationId },
      },
    );
  },
});

async function resolvePendingInvitation(ctx: QueryCtx | MutationCtx, token: string) {
  const tokenHash = await hashInvitationToken(token);
  const invitation = await ctx.db
    .query("invitations")
    .withIndex("by_token_hash", (q) => q.eq("tokenHash", tokenHash))
    .unique();

  if (
    invitation === null ||
    invitation.expiresAt <= Date.now() ||
    invitation.status !== "pending"
  ) {
    return null;
  }

  const circle = await ctx.db.get(invitation.circleId);
  if (circle === null || circle.setupCompletedAt === null) {
    return null;
  }

  return { invitation, circle };
}

/**
 * Public, token-scoped preview for the Invitation landing page (MEM-3). Returns
 * only the four fields the UI renders — no circleId, invitation id, or status
 * (ADR 0016).
 */
export const getInvitationPreview = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const resolved = await resolvePendingInvitation(ctx, args.token);
    if (!resolved) {
      return null;
    }

    const ownerUser = await ctx.db.get(resolved.circle.ownerUserId);
    if (!ownerUser) {
      return null;
    }

    return {
      circleName: resolved.circle.name,
      ownerDisplayName: ownerUser.displayName,
      ownerImage: ownerUser.image ?? null,
      invitedEmail: resolved.invitation.emailLower,
    };
  },
});

/**
 * Accepts a pending Invitation for the signed-in User whose Google Account Email
 * matches the invite (MEM-3). Reactivates a Removed Member's existing row on
 * rejoin (PRD 44); all failure branches return the same generic signal (ADR 0016).
 */
export const acceptInvitation = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);

    const tokenHash = await hashInvitationToken(args.token);
    const invitation = await ctx.db
      .query("invitations")
      .withIndex("by_token_hash", (q) => q.eq("tokenHash", tokenHash))
      .unique();

    if (
      invitation === null ||
      invitation.expiresAt <= Date.now() ||
      invitation.status !== "pending"
    ) {
      throw new Error(INVITATION_INVALID);
    }

    if (invitation.emailLower !== user.email.toLowerCase()) {
      throw new Error(INVITATION_INVALID);
    }

    const circle = await ctx.db.get(invitation.circleId);
    if (circle === null || circle.setupCompletedAt === null) {
      throw new Error(INVITATION_INVALID);
    }

    const existingMembership = await ctx.db
      .query("members")
      .withIndex("by_circle_and_user", (q) => q.eq("circleId", circle._id).eq("userId", user._id))
      .unique();

    if (existingMembership?.status === "active") {
      throw new Error(INVITATION_INVALID);
    }

    let membership: Doc<"members">;
    if (existingMembership?.status === "removed") {
      await ctx.db.patch(existingMembership._id, {
        status: "active",
        displayName: user.displayName,
        image: user.image ?? undefined,
        removedAt: undefined,
      });
      const reactivated = await ctx.db.get(existingMembership._id);
      if (!reactivated) {
        throw new Error(INVITATION_INVALID);
      }
      membership = reactivated;
    } else {
      const memberId = await ctx.db.insert("members", {
        circleId: circle._id,
        userId: user._id,
        role: "member",
        status: "active",
        displayName: user.displayName,
        image: user.image ?? undefined,
        joinedAt: Date.now(),
      });
      const inserted = await ctx.db.get(memberId);
      if (!inserted) {
        throw new Error(INVITATION_INVALID);
      }
      membership = inserted;
    }

    await ctx.db.patch(invitation._id, { status: "accepted" });

    await recordEvent(ctx, {
      entity: circleEntity(circle._id),
      actor: membership,
      action: "member joined",
      changes: [{ field: "member", to: membership.displayName }],
    });

    return { circleId: circle._id };
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
    await emailPool.enqueueAction(
      ctx,
      internal.email.sendInvitationEmail,
      { invitationId: args.invitationId, token, resendCount: invitation.resendCount + 1 },
      {
        onComplete: internal.email.onInvitationRunComplete,
        context: { invitationId: args.invitationId },
      },
    );
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
