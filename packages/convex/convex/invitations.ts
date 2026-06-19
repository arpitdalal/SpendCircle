import { inviteEmailSchema, MUTATION_ERRORS, mutationErrorData } from "@spend-circle/domain";
import { ConvexError, v } from "convex/values";
import { mutation } from "./_generated/server.js";
import { requireCircleAccess } from "./guard.js";
import { circleEntity, recordEvent } from "./history.js";
import { generateInvitationToken, hashInvitationToken } from "./invitationToken.js";

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
