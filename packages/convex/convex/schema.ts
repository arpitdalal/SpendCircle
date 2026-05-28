import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    googleSubject: v.string(),
    googleAccountEmail: v.string(),
    displayName: v.string(),
    profilePictureUrl: v.string(),
    acceptedTermsVersion: v.string(),
    acceptedPrivacyVersion: v.string(),
    acceptedAt: v.string()
  })
    .index("by_google_subject", ["googleSubject"])
    .index("by_google_account_email", ["googleAccountEmail"]),

  circles: defineTable({
    ownerUserId: v.id("users"),
    kind: v.union(v.literal("personal"), v.literal("regular")),
    name: v.string(),
    color: v.string(),
    mark: v.string(),
    currency: v.union(v.literal("CAD"), v.literal("USD")),
    archived: v.boolean(),
    hasTransactions: v.boolean()
  }).index("by_owner_kind", ["ownerUserId", "kind"]),

  members: defineTable({
    userId: v.id("users"),
    circleId: v.id("circles"),
    role: v.union(v.literal("owner"), v.literal("member")),
    displayNameSnapshot: v.string(),
    profilePictureUrlSnapshot: v.string()
  })
    .index("by_user", ["userId"])
    .index("by_circle", ["circleId"])
    .index("by_user_circle", ["userId", "circleId"]),

  categories: defineTable({
    circleId: v.id("circles"),
    name: v.string(),
    type: v.union(v.literal("expense"), v.literal("income")),
    color: v.string(),
    createdByUserId: v.id("users"),
    archived: v.boolean()
  }).index("by_circle", ["circleId"])
});
