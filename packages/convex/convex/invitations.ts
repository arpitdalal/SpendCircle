import { inviteEmailSchema, MUTATION_ERRORS, mutationErrorData } from "@spend-circle/domain";
import { ConvexError, v } from "convex/values";
import type { Doc } from "./_generated/dataModel.js";
import type { MutationCtx, QueryCtx } from "./_generated/server.js";
import { mutation, query } from "./_generated/server.js";
import { requireCurrentUser } from "./auth.js";
import { requireCircleAccess } from "./guard.js";
import { circleEntity, recordEvent } from "./history.js";
import { generateInvitationToken, hashInvitationToken } from "./invitationToken.js";

const INVITATION_INVALID = "Invitation invalid";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

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

    const token = generateInvitationToken();
    const tokenHash = await hashInvitationToken(token);

    await ctx.db.insert("invitations", {
      circleId: args.circleId,
      emailLower: email,
      tokenHash,
      status: "pending",
      invitedByUserId: access.user._id,
      resendCount: 0,
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
      membership = await ctx.db.get(existingMembership._id);
      if (!membership) {
        throw new Error(INVITATION_INVALID);
      }
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
      membership = await ctx.db.get(memberId);
      if (!membership) {
        throw new Error(INVITATION_INVALID);
      }
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
