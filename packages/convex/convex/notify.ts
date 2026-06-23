import {
  buildCategoryNotificationLink,
  buildCircleNotificationLink,
  buildRef,
  buildTransactionNotificationLink,
} from "@spend-circle/domain";
import type { Doc, Id } from "./_generated/dataModel.js";
import type { MutationCtx } from "./_generated/server.js";

/** Closed set of v1 notification types — a typo can't create an unknown type. */
export const NOTIFICATION_TYPES = [
  "invitation.accepted",
  "invitation.revoked",
  "member.removed",
  "ownership.transferred",
  "circle.archived",
  "circle.restored",
  "transaction.paid_by",
  "transaction.archived",
  "transaction.restored",
  "category.archived",
  "category.restored",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

interface NotifyUserArgs {
  recipientUserId: Id<"users">;
  actorUserId: Id<"users">;
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
}

/**
 * The sole writer of `notifications` (NTF-2). Centralizes row shape, type set,
 * and the actor-skip rule: when recipient === actor, no row is inserted.
 */
export async function notifyUser(ctx: MutationCtx, args: NotifyUserArgs) {
  if (args.recipientUserId === args.actorUserId) {
    return;
  }
  await ctx.db.insert("notifications", {
    userId: args.recipientUserId,
    type: args.type,
    title: args.title,
    body: args.body,
    link: args.link,
    read: false,
    createdAt: Date.now(),
  });
}

function circleRef(circle: Doc<"circles">) {
  return buildRef(circle.name, circle._id);
}

export async function notifyInvitationAccepted(
  ctx: MutationCtx,
  opts: {
    inviterUserId: Id<"users">;
    acceptorUserId: Id<"users">;
    acceptorDisplayName: string;
    circle: Doc<"circles">;
  },
) {
  await notifyUser(ctx, {
    recipientUserId: opts.inviterUserId,
    actorUserId: opts.acceptorUserId,
    type: "invitation.accepted",
    title: "Invitation accepted",
    body: `${opts.acceptorDisplayName} joined ${opts.circle.name}.`,
    link: buildCircleNotificationLink(circleRef(opts.circle)),
  });
}

export async function notifyInvitationRevoked(
  ctx: MutationCtx,
  opts: {
    inviteeUserId: Id<"users">;
    actorUserId: Id<"users">;
    circleName: string;
  },
) {
  await notifyUser(ctx, {
    recipientUserId: opts.inviteeUserId,
    actorUserId: opts.actorUserId,
    type: "invitation.revoked",
    title: "Invitation revoked",
    body: `Your invitation to ${opts.circleName} was revoked.`,
  });
}

export async function notifyRemovedFromCircle(
  ctx: MutationCtx,
  opts: {
    removedUserId: Id<"users">;
    actorUserId: Id<"users">;
    circle: Doc<"circles">;
  },
) {
  await notifyUser(ctx, {
    recipientUserId: opts.removedUserId,
    actorUserId: opts.actorUserId,
    type: "member.removed",
    title: "Removed from Circle",
    body: `You were removed from ${opts.circle.name}.`,
    link: buildCircleNotificationLink(circleRef(opts.circle)),
  });
}

export async function notifyOwnershipTransferred(
  ctx: MutationCtx,
  opts: {
    newOwnerUserId: Id<"users">;
    actorUserId: Id<"users">;
    circle: Doc<"circles">;
  },
) {
  await notifyUser(ctx, {
    recipientUserId: opts.newOwnerUserId,
    actorUserId: opts.actorUserId,
    type: "ownership.transferred",
    title: "Ownership transferred",
    body: `You are now the Owner of ${opts.circle.name}.`,
    link: buildCircleNotificationLink(circleRef(opts.circle)),
  });
}

export async function notifyCircleLifecycleChange(
  ctx: MutationCtx,
  opts: {
    circle: Doc<"circles">;
    actorUserId: Id<"users">;
    actorDisplayName: string;
    action: "archived" | "restored";
  },
) {
  const members = await ctx.db
    .query("members")
    .withIndex("by_circle_and_status", (q) =>
      q.eq("circleId", opts.circle._id).eq("status", "active"),
    )
    .collect();

  const link = buildCircleNotificationLink(circleRef(opts.circle));
  const archived = opts.action === "archived";
  const type = archived ? "circle.archived" : "circle.restored";
  const title = archived ? "Circle archived" : "Circle restored";
  const body = archived
    ? `${opts.actorDisplayName} archived ${opts.circle.name}.`
    : `${opts.actorDisplayName} restored ${opts.circle.name}.`;

  for (const member of members) {
    await notifyUser(ctx, {
      recipientUserId: member.userId,
      actorUserId: opts.actorUserId,
      type,
      title,
      body,
      link,
    });
  }
}

export async function notifyPaidBySet(
  ctx: MutationCtx,
  opts: {
    paidByUserId: Id<"users">;
    actorUserId: Id<"users">;
    actorDisplayName: string;
    circle: Doc<"circles">;
    transaction: Doc<"transactions">;
  },
) {
  await notifyUser(ctx, {
    recipientUserId: opts.paidByUserId,
    actorUserId: opts.actorUserId,
    type: "transaction.paid_by",
    title: "Paid By updated",
    body: `${opts.actorDisplayName} set you as Paid By on ${opts.transaction.title}.`,
    link: buildTransactionNotificationLink(
      circleRef(opts.circle),
      buildRef(opts.transaction.title, opts.transaction._id),
    ),
  });
}

export async function notifyTransactionLifecycleChange(
  ctx: MutationCtx,
  opts: {
    recorderUserId: Id<"users">;
    actorUserId: Id<"users">;
    actorDisplayName: string;
    circle: Doc<"circles">;
    transaction: Doc<"transactions">;
    action: "archived" | "restored";
  },
) {
  const archived = opts.action === "archived";
  await notifyUser(ctx, {
    recipientUserId: opts.recorderUserId,
    actorUserId: opts.actorUserId,
    type: archived ? "transaction.archived" : "transaction.restored",
    title: archived ? "Transaction archived" : "Transaction restored",
    body: archived
      ? `${opts.actorDisplayName} archived ${opts.transaction.title}.`
      : `${opts.actorDisplayName} restored ${opts.transaction.title}.`,
    link: buildTransactionNotificationLink(
      circleRef(opts.circle),
      buildRef(opts.transaction.title, opts.transaction._id),
    ),
  });
}

export async function notifyCategoryLifecycleChange(
  ctx: MutationCtx,
  opts: {
    creatorUserId: Id<"users">;
    actorUserId: Id<"users">;
    actorDisplayName: string;
    circle: Doc<"circles">;
    category: Doc<"categories">;
    action: "archived" | "restored";
  },
) {
  const archived = opts.action === "archived";
  await notifyUser(ctx, {
    recipientUserId: opts.creatorUserId,
    actorUserId: opts.actorUserId,
    type: archived ? "category.archived" : "category.restored",
    title: archived ? "Category archived" : "Category restored",
    body: archived
      ? `${opts.actorDisplayName} archived ${opts.category.name}.`
      : `${opts.actorDisplayName} restored ${opts.category.name}.`,
    link: buildCategoryNotificationLink(
      circleRef(opts.circle),
      buildRef(opts.category.name, opts.category._id),
    ),
  });
}
