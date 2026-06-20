import { MUTATION_ERRORS, mutationErrorData } from "@spend-circle/domain";
import { convexTest } from "convex-test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api.js";
import type { Doc, Id } from "./_generated/dataModel.js";
import type { MutationCtx } from "./_generated/server.js";
import { resolveCircleAccess } from "./guard.js";
import { circleEntity, listEntityHistory } from "./history.js";
import { setUserDisplayName } from "./model.js";
import schema from "./schema.js";
import { addMember as seedAddMember, seedCircle as seedSharedCircle } from "./test/seed.js";

// listMembers resolves access through guard.ts, which folds in
// `getCurrentUserOrNull` — backed by Better Auth and unrunnable under
// convex-test. We stub just that seam (as guard.test.ts does).
const { mockCurrentUser } = vi.hoisted(() => ({ mockCurrentUser: vi.fn() }));
vi.mock("./auth.js", () => ({
  getCurrentUserOrNull: mockCurrentUser,
  requireCurrentUser: async (ctx: unknown) => {
    const user = await mockCurrentUser(ctx);
    if (!user) {
      throw new Error("Not authenticated");
    }
    return user;
  },
}));

const modules = import.meta.glob("./**/*.ts");

beforeEach(() => {
  mockCurrentUser.mockReset();
});

async function makeUser(
  ctx: MutationCtx,
  email: string,
  displayName: string,
): Promise<Doc<"users">> {
  const now = Date.now();
  const userId = await ctx.db.insert("users", {
    email,
    displayName,
    acceptedTermsVersion: "2026-05-01",
    acceptedPrivacyVersion: "2026-05-01",
    acceptedAt: now,
    analyticsOptOut: false,
    onboardingCompletedAt: now,
    createdAt: now,
  });
  const user = await ctx.db.get(userId);
  if (!user) {
    throw new Error("seed failed");
  }
  return user;
}

async function seedCircle(
  ctx: MutationCtx,
  opts: { kind?: "personal" | "regular" } = {},
): Promise<{ owner: Doc<"users">; circleId: Id<"circles"> }> {
  const now = Date.now();
  const owner = await makeUser(ctx, "owner@example.com", "Olive Owner");
  const circleId = await ctx.db.insert("circles", {
    name: "Trip",
    kind: opts.kind ?? "regular",
    currency: "USD",
    color: "blue",
    mark: "T",
    ownerUserId: owner._id,
    status: "active",
    setupCompletedAt: now,
    currencyLocked: false,
    createdAt: now,
  });
  await ctx.db.insert("members", {
    circleId,
    userId: owner._id,
    role: "owner",
    status: "active",
    displayName: owner.displayName,
    joinedAt: now,
  });
  return { owner, circleId };
}

async function addMember(
  ctx: MutationCtx,
  circleId: Id<"circles">,
  email: string,
  displayName: string,
  status: "active" | "removed" = "active",
): Promise<Doc<"users">> {
  const user = await makeUser(ctx, email, displayName);
  await ctx.db.insert("members", {
    circleId,
    userId: user._id,
    role: "member",
    status,
    displayName,
    joinedAt: Date.now() + 1, // join after the owner for stable ordering
    ...(status === "removed" ? { removedAt: Date.now() } : {}),
  });
  return user;
}

describe("listMembers — access", () => {
  it("allows an active Member", async () => {
    const t = convexTest(schema, modules);
    const { owner, circleId } = await t.run((ctx) => seedCircle(ctx));
    mockCurrentUser.mockResolvedValue(owner);
    const members = await t.query(api.members.listMembers, { circleId });
    expect(members?.length).toBe(1);
  });

  it("returns null for a non-member (anti-enumeration)", async () => {
    const t = convexTest(schema, modules);
    const { circleId } = await t.run((ctx) => seedCircle(ctx));
    const stranger = await t.run((ctx) => makeUser(ctx, "s@example.com", "Sam Stranger"));
    mockCurrentUser.mockResolvedValue(stranger);
    expect(await t.query(api.members.listMembers, { circleId })).toBeNull();
  });

  it("returns null for an unauthenticated caller", async () => {
    const t = convexTest(schema, modules);
    const { circleId } = await t.run((ctx) => seedCircle(ctx));
    mockCurrentUser.mockResolvedValue(null);
    expect(await t.query(api.members.listMembers, { circleId })).toBeNull();
  });
});

describe("listMembers — content", () => {
  it("lists active Members Owner-first with materialized identity and no userId", async () => {
    const t = convexTest(schema, modules);
    const { owner, circleId } = await t.run((ctx) => seedCircle(ctx));
    await t.run((ctx) => addMember(ctx, circleId, "m@example.com", "Maya Member"));
    mockCurrentUser.mockResolvedValue(owner);

    const members = await t.query(api.members.listMembers, { circleId });
    expect(members?.map((m) => m.displayName)).toEqual(["Olive Owner", "Maya Member"]);
    expect(members?.[0]?.role).toBe("owner");
    // The caller (the owner here) is flagged self; the other Member is not.
    expect(members?.[0]?.isSelf).toBe(true);
    expect(members?.[1]?.isSelf).toBe(false);
    // No raw userId surfaces to the client.
    for (const member of members ?? []) {
      expect(member).not.toHaveProperty("userId");
    }
  });

  it("flags isSelf relative to the calling Member, not the Owner", async () => {
    const t = convexTest(schema, modules);
    const { circleId } = await t.run((ctx) => seedCircle(ctx));
    const maya = await t.run((ctx) => addMember(ctx, circleId, "m@example.com", "Maya Member"));
    mockCurrentUser.mockResolvedValue(maya); // Maya is the caller, not the owner

    const members = await t.query(api.members.listMembers, { circleId });
    expect(members?.find((m) => m.displayName === "Maya Member")?.isSelf).toBe(true);
    expect(members?.find((m) => m.displayName === "Olive Owner")?.isSelf).toBe(false);
  });

  it("excludes Removed Members by default and includes them with the frozen name when asked", async () => {
    const t = convexTest(schema, modules);
    const { owner, circleId } = await t.run((ctx) => seedCircle(ctx));
    await t.run((ctx) => addMember(ctx, circleId, "r@example.com", "Rex Removed", "removed"));
    mockCurrentUser.mockResolvedValue(owner);

    const active = await t.query(api.members.listMembers, { circleId });
    expect(active?.map((m) => m.displayName)).toEqual(["Olive Owner"]);

    const all = await t.query(api.members.listMembers, { circleId, includeRemoved: true });
    expect(all?.map((m) => m.displayName)).toContain("Rex Removed");
  });

  it("returns exactly one Member for a Personal Circle", async () => {
    const t = convexTest(schema, modules);
    const { owner, circleId } = await t.run((ctx) => seedCircle(ctx, { kind: "personal" }));
    mockCurrentUser.mockResolvedValue(owner);
    expect((await t.query(api.members.listMembers, { circleId }))?.length).toBe(1);
  });
});

async function completeSetup(ctx: MutationCtx, circleId: Id<"circles">) {
  await ctx.db.patch(circleId, { setupCompletedAt: Date.now() });
}

describe("leaveCircle — happy path", () => {
  it("flips the caller's member row to removed with frozen identity and records history", async () => {
    const t = convexTest(schema, modules);
    const { circleId } = await t.run((ctx) => seedSharedCircle(ctx));
    await t.run((ctx) => completeSetup(ctx, circleId));
    const maya = await t.run((ctx) => seedAddMember(ctx, circleId, "m@example.com", "Maya Member"));
    mockCurrentUser.mockResolvedValue(maya.user);

    const beforeLeave = Date.now();
    await t.mutation(api.members.leaveCircle, { circleId });

    await t.run(async (ctx) => {
      const row = await ctx.db
        .query("members")
        .withIndex("by_circle_and_user", (q) =>
          q.eq("circleId", circleId).eq("userId", maya.user._id),
        )
        .unique();
      expect(row?.status).toBe("removed");
      expect(row?.removedAt).toBeGreaterThanOrEqual(beforeLeave);
      expect(row?.displayName).toBe("Maya Member");
      expect(row?.image).toBeUndefined();

      const events = await listEntityHistory(ctx, circleEntity(circleId));
      const event = events.find((entry) => entry.action === "member left");
      expect(event?.actorMemberId).toBe(maya.memberId);
      expect(event?.changes).toEqual([{ field: "member", from: "Maya Member" }]);
      for (const change of event?.changes ?? []) {
        expect(JSON.stringify(change)).not.toMatch(/[a-z0-9]{20,}/i);
      }
    });
  });

  it("drops the Circle from listMyCircles and revokes access reactively", async () => {
    const t = convexTest(schema, modules);
    const { circleId } = await t.run((ctx) => seedSharedCircle(ctx));
    await t.run((ctx) => completeSetup(ctx, circleId));
    const maya = await t.run((ctx) => seedAddMember(ctx, circleId, "m@example.com", "Maya Member"));
    mockCurrentUser.mockResolvedValue(maya.user);

    await t.mutation(api.members.leaveCircle, { circleId });

    mockCurrentUser.mockResolvedValue(maya.user);
    const circles = await t.query(api.circles.listMyCircles, {});
    expect(circles?.some((circle) => circle.id === circleId)).toBe(false);

    await t.run(async (ctx) => {
      mockCurrentUser.mockResolvedValue(maya.user);
      expect(await resolveCircleAccess(ctx, circleId)).toBeNull();
    });
  });
});

describe("leaveCircle — guards", () => {
  it("rejects the Owner with a coded error", async () => {
    const t = convexTest(schema, modules);
    const { owner, circleId } = await t.run((ctx) => seedSharedCircle(ctx));
    await t.run((ctx) => completeSetup(ctx, circleId));
    mockCurrentUser.mockResolvedValue(owner);

    await expect(t.mutation(api.members.leaveCircle, { circleId })).rejects.toMatchObject({
      data: mutationErrorData(MUTATION_ERRORS.ownerMustTransfer),
    });
  });

  it("rejects a Personal Circle with a coded error", async () => {
    const t = convexTest(schema, modules);
    const { owner, circleId } = await t.run((ctx) => seedSharedCircle(ctx, { kind: "personal" }));
    mockCurrentUser.mockResolvedValue(owner);

    await expect(t.mutation(api.members.leaveCircle, { circleId })).rejects.toMatchObject({
      data: mutationErrorData(MUTATION_ERRORS.leavePersonalCircle),
    });
  });

  it("rejects a non-member with Circle not found", async () => {
    const t = convexTest(schema, modules);
    const { circleId } = await t.run((ctx) => seedSharedCircle(ctx));
    await t.run((ctx) => completeSetup(ctx, circleId));
    const stranger = await t.run((ctx) => makeUser(ctx, "s@example.com", "Sam Stranger"));
    mockCurrentUser.mockResolvedValue(stranger);

    await expect(t.mutation(api.members.leaveCircle, { circleId })).rejects.toThrow(
      "Circle not found",
    );
  });

  it("rejects an unauthenticated caller with Circle not found", async () => {
    const t = convexTest(schema, modules);
    const { circleId } = await t.run((ctx) => seedSharedCircle(ctx));
    await t.run((ctx) => completeSetup(ctx, circleId));
    mockCurrentUser.mockResolvedValue(null);

    await expect(t.mutation(api.members.leaveCircle, { circleId })).rejects.toThrow(
      "Circle not found",
    );
  });

  it("rejects a removed member with Circle not found", async () => {
    const t = convexTest(schema, modules);
    const { circleId } = await t.run((ctx) => seedSharedCircle(ctx));
    await t.run((ctx) => completeSetup(ctx, circleId));
    const removed = await t.run((ctx) =>
      seedAddMember(ctx, circleId, "removed@example.com", "Rex Removed", "removed"),
    );
    mockCurrentUser.mockResolvedValue(removed.user);

    await expect(t.mutation(api.members.leaveCircle, { circleId })).rejects.toThrow(
      "Circle not found",
    );
  });
});

describe("leaveCircle — frozen identity and rejoin", () => {
  it("keeps displayName frozen after a profile update", async () => {
    const t = convexTest(schema, modules);
    const { circleId } = await t.run((ctx) => seedSharedCircle(ctx));
    await t.run((ctx) => completeSetup(ctx, circleId));
    const maya = await t.run((ctx) => seedAddMember(ctx, circleId, "m@example.com", "Maya Member"));
    mockCurrentUser.mockResolvedValue(maya.user);

    await t.mutation(api.members.leaveCircle, { circleId });

    await t.run(async (ctx) => {
      await setUserDisplayName(ctx, maya.user._id, "New Name");
      const row = await ctx.db
        .query("members")
        .withIndex("by_circle_and_user", (q) =>
          q.eq("circleId", circleId).eq("userId", maya.user._id),
        )
        .unique();
      expect(row?.displayName).toBe("Maya Member");
    });
  });

  it("reactivates the same member row on rejoin", async () => {
    const t = convexTest(schema, modules);
    const { circleId } = await t.run((ctx) => seedSharedCircle(ctx));
    await t.run((ctx) => completeSetup(ctx, circleId));
    const maya = await t.run((ctx) => seedAddMember(ctx, circleId, "m@example.com", "Maya Member"));
    mockCurrentUser.mockResolvedValue(maya.user);

    await t.mutation(api.members.leaveCircle, { circleId });

    await t.run(async (ctx) => {
      const removed = await ctx.db
        .query("members")
        .withIndex("by_circle_and_user", (q) =>
          q.eq("circleId", circleId).eq("userId", maya.user._id),
        )
        .unique();
      expect(removed?._id).toBe(maya.memberId);

      await ctx.db.patch(maya.memberId, { status: "active", removedAt: undefined });
      const reactivated = await ctx.db.get(maya.memberId);
      expect(reactivated?._id).toBe(maya.memberId);
      expect(reactivated?.status).toBe("active");
    });
  });
});
