import { LEGAL_VERSIONS, createInitialUserProfile } from "@spend-circle/domain";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { circleColors, personalCircleName, type AuthenticatedProfile } from "./domain";

async function upsertUserAndPersonalCircle(
  ctx: MutationCtx,
  profile: AuthenticatedProfile,
  acceptedAt: string
) {
  const existingUser = await ctx.db
    .query("users")
    .withIndex("by_google_subject", (q) => q.eq("googleSubject", profile.googleSubject))
    .unique();

  if (existingUser) {
    const circle = await ensurePersonalCircle(ctx, existingUser);
    return { user: existingUser, circle };
  }

  const userProfile = createInitialUserProfile({
    googleSubject: profile.googleSubject,
    googleAccountEmail: profile.googleAccountEmail,
    displayName: profile.displayName,
    profilePictureUrl: profile.profilePictureUrl,
    acceptedAt
  });
  const userId = await ctx.db.insert("users", userProfile);
  const user = await ctx.db.get(userId);
  if (!user) {
    throw new Error("User creation failed.");
  }

  const circle = await ensurePersonalCircle(ctx, user);
  return { user, circle };
}

async function ensurePersonalCircle(ctx: MutationCtx, user: Doc<"users">) {
  const existingCircle = await ctx.db
    .query("circles")
    .withIndex("by_owner_kind", (q) => q.eq("ownerUserId", user._id).eq("kind", "personal"))
    .unique();

  if (existingCircle) {
    return existingCircle;
  }

  const circleId = await ctx.db.insert("circles", {
    ownerUserId: user._id,
    kind: "personal",
    name: personalCircleName(user.displayName),
    color: circleColors[0],
    mark: "PC",
    currency: "USD",
    archived: false,
    hasTransactions: false
  });
  await ctx.db.insert("members", {
    userId: user._id,
    circleId,
    role: "owner",
    displayNameSnapshot: user.displayName,
    profilePictureUrlSnapshot: user.profilePictureUrl
  });

  const circle = await ctx.db.get(circleId);
  if (!circle) {
    throw new Error("Personal Circle creation failed.");
  }
  return circle;
}

async function currentGoogleProfile(ctx: MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Unauthenticated.");
  }

  return {
    googleSubject: identity.subject,
    googleAccountEmail: identity.email ?? "",
    displayName: identity.name ?? identity.nickname ?? "User",
    profilePictureUrl: identity.pictureUrl ?? null
  };
}

export const completeAuthenticatedSignIn = mutation({
  args: {
    acceptedAt: v.string()
  },
  handler: async (ctx, args) => {
    return upsertUserAndPersonalCircle(ctx, await currentGoogleProfile(ctx), args.acceptedAt);
  }
});

export const completeDevSignIn = mutation({
  args: {
    googleSubject: v.string(),
    googleAccountEmail: v.string(),
    displayName: v.string(),
    profilePictureUrl: v.union(v.string(), v.null()),
    acceptedAt: v.string()
  },
  handler: async (ctx, args) => {
    return upsertUserAndPersonalCircle(ctx, args, args.acceptedAt);
  }
});

export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }
    return ctx.db
      .query("users")
      .withIndex("by_google_subject", (q) => q.eq("googleSubject", identity.subject))
      .unique();
  }
});

export const getUserById = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args): Promise<Doc<"users"> | null> => {
    return ctx.db.get(args.userId);
  }
});

export type UserDocId = Id<"users">;
