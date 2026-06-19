import { MUTATION_ERRORS, mutationErrorData } from "@spend-circle/domain";
import { ConvexError } from "convex/values";
import { convexTest } from "convex-test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api.js";
import type { Id } from "./_generated/dataModel.js";
import type { MutationCtx } from "./_generated/server.js";
import { circleEntity, listEntityHistory } from "./history.js";
import { hashInvitationToken } from "./invitationToken.js";
import { createUserWithPersonalCircle } from "./model.js";
import schema from "./schema.js";
import { addMember, makeUser, seedCircle, seedPersonalCircleOwner } from "./test/seed.js";

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
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

beforeEach(() => {
  mockCurrentUser.mockReset();
});

async function completeSetup(ctx: MutationCtx, circleId: Id<"circles">) {
  await ctx.db.patch(circleId, { setupCompletedAt: Date.now() });
}

describe("createInvitation — happy path", () => {
  it("creates a pending invitation with hashed token and records history", async () => {
    const t = convexTest(schema, modules);
    const { owner, circleId } = await t.run((ctx) => seedCircle(ctx));
    await t.run((ctx) => completeSetup(ctx, circleId));
    mockCurrentUser.mockResolvedValue(owner);

    const { token } = await t.mutation(api.invitations.createInvitation, {
      circleId,
      email: "ada@example.com",
    });

    await t.run(async (ctx) => {
      const invites = await ctx.db
        .query("invitations")
        .withIndex("by_circle", (q) => q.eq("circleId", circleId))
        .collect();
      expect(invites).toHaveLength(1);
      const invite = invites[0];
      expect(invite?.status).toBe("pending");
      expect(invite?.emailLower).toBe("ada@example.com");
      expect(invite?.resendCount).toBe(0);
      expect(invite?.invitedByUserId).toBe(owner._id);
      expect(invite?.tokenHash).not.toBe(token);
      expect(invite?.tokenHash).toBe(await hashInvitationToken(token));
      expect(invite?.expiresAt).toBe((invite?.createdAt ?? 0) + INVITE_TTL_MS);

      const events = await listEntityHistory(ctx, circleEntity(circleId));
      expect(events).toHaveLength(1);
      expect(events[0]?.action).toBe("member invited");
      expect(events[0]?.changes).toEqual([{ field: "email", to: "ada@example.com" }]);
    });
  });
});

describe("createInvitation — permissions", () => {
  it("rejects a non-owner Member", async () => {
    const t = convexTest(schema, modules);
    const { circleId } = await t.run((ctx) => seedCircle(ctx));
    await t.run((ctx) => completeSetup(ctx, circleId));
    const member = await t.run((ctx) => addMember(ctx, circleId, "m@example.com", "Maya"));
    mockCurrentUser.mockResolvedValue(member.user);

    await expect(
      t.mutation(api.invitations.createInvitation, { circleId, email: "new@example.com" }),
    ).rejects.toMatchObject({
      data: mutationErrorData(MUTATION_ERRORS.inviteForbidden),
    });
  });

  it("rejects a removed Member with Circle not found", async () => {
    const t = convexTest(schema, modules);
    const { circleId } = await t.run((ctx) => seedCircle(ctx));
    await t.run((ctx) => completeSetup(ctx, circleId));
    const removed = await t.run((ctx) =>
      addMember(ctx, circleId, "removed@example.com", "Removed", "removed"),
    );
    mockCurrentUser.mockResolvedValue(removed.user);

    await expect(
      t.mutation(api.invitations.createInvitation, { circleId, email: "new@example.com" }),
    ).rejects.toThrow("Circle not found");
  });

  it("rejects a non-member with Circle not found", async () => {
    const t = convexTest(schema, modules);
    const { circleId } = await t.run((ctx) => seedCircle(ctx));
    await t.run((ctx) => completeSetup(ctx, circleId));
    const stranger = await t.run((ctx) => makeUser(ctx, "stranger@example.com", "Stranger"));
    mockCurrentUser.mockResolvedValue(stranger);

    await expect(
      t.mutation(api.invitations.createInvitation, { circleId, email: "new@example.com" }),
    ).rejects.toThrow("Circle not found");
  });

  it("rejects an unauthenticated caller with Circle not found", async () => {
    const t = convexTest(schema, modules);
    const { circleId } = await t.run((ctx) => seedCircle(ctx));
    await t.run((ctx) => completeSetup(ctx, circleId));
    mockCurrentUser.mockResolvedValue(null);

    await expect(
      t.mutation(api.invitations.createInvitation, { circleId, email: "new@example.com" }),
    ).rejects.toThrow("Circle not found");
  });
});

describe("createInvitation — circle constraints", () => {
  it("rejects a Personal Circle", async () => {
    const t = convexTest(schema, modules);
    const { owner, personalCircleId } = await t.run((ctx) =>
      seedPersonalCircleOwner(ctx, {
        email: "owner@example.com",
        displayName: "Owner",
        currency: "USD",
      }),
    );
    mockCurrentUser.mockResolvedValue(owner);

    await expect(
      t.mutation(api.invitations.createInvitation, {
        circleId: personalCircleId,
        email: "new@example.com",
      }),
    ).rejects.toMatchObject({
      data: mutationErrorData(MUTATION_ERRORS.invitePersonalCircle),
    });
  });

  it("rejects an incomplete regular Circle", async () => {
    const t = convexTest(schema, modules);
    const { owner, circleId } = await t.run((ctx) => seedCircle(ctx));
    mockCurrentUser.mockResolvedValue(owner);

    await expect(
      t.mutation(api.invitations.createInvitation, { circleId, email: "new@example.com" }),
    ).rejects.toMatchObject({
      data: mutationErrorData(MUTATION_ERRORS.inviteSetupIncomplete),
    });
  });

  it("succeeds once setup is complete", async () => {
    const t = convexTest(schema, modules);
    const { owner, circleId } = await t.run((ctx) => seedCircle(ctx));
    await t.run((ctx) => completeSetup(ctx, circleId));
    mockCurrentUser.mockResolvedValue(owner);

    const { token } = await t.mutation(api.invitations.createInvitation, {
      circleId,
      email: "new@example.com",
    });
    expect(token).toBeTruthy();
  });

  it("rejects an archived Circle", async () => {
    const t = convexTest(schema, modules);
    const { owner, circleId } = await t.run((ctx) => seedCircle(ctx, { archived: true }));
    await t.run((ctx) => completeSetup(ctx, circleId));
    mockCurrentUser.mockResolvedValue(owner);

    await expect(
      t.mutation(api.invitations.createInvitation, { circleId, email: "new@example.com" }),
    ).rejects.toMatchObject({
      data: mutationErrorData(MUTATION_ERRORS.circleArchived),
    });
  });
});

describe("createInvitation — duplicates", () => {
  it("rejects an active Member's email", async () => {
    const t = convexTest(schema, modules);
    const { owner, circleId } = await t.run((ctx) => seedCircle(ctx));
    await t.run((ctx) => completeSetup(ctx, circleId));
    const member = await t.run((ctx) => addMember(ctx, circleId, "m@example.com", "Maya"));
    mockCurrentUser.mockResolvedValue(owner);

    await expect(
      t.mutation(api.invitations.createInvitation, { circleId, email: member.user.email }),
    ).rejects.toMatchObject({
      data: mutationErrorData(MUTATION_ERRORS.inviteAlreadyMember),
    });
  });

  it("rejects an active member when the invite email differs only by case", async () => {
    const t = convexTest(schema, modules);
    const { owner, circleId } = await t.run((ctx) => seedCircle(ctx));
    await t.run((ctx) => completeSetup(ctx, circleId));
    const memberUserId = await t.run((ctx) =>
      createUserWithPersonalCircle(ctx, {
        email: "Ada@Example.com",
        displayName: "Ada",
        currency: "USD",
      }),
    );
    await t.run((ctx) =>
      ctx.db.insert("members", {
        circleId,
        userId: memberUserId,
        role: "member",
        status: "active",
        displayName: "Ada",
        joinedAt: Date.now(),
      }),
    );
    mockCurrentUser.mockResolvedValue(owner);

    await expect(
      t.mutation(api.invitations.createInvitation, { circleId, email: "ada@example.com" }),
    ).rejects.toMatchObject({
      data: mutationErrorData(MUTATION_ERRORS.inviteAlreadyMember),
    });
  });

  it("rejects a pending unexpired invite for the same email", async () => {
    const t = convexTest(schema, modules);
    const { owner, circleId } = await t.run((ctx) => seedCircle(ctx));
    await t.run((ctx) => completeSetup(ctx, circleId));
    mockCurrentUser.mockResolvedValue(owner);

    await t.mutation(api.invitations.createInvitation, { circleId, email: "ada@example.com" });
    await expect(
      t.mutation(api.invitations.createInvitation, { circleId, email: "ada@example.com" }),
    ).rejects.toMatchObject({
      data: mutationErrorData(MUTATION_ERRORS.inviteAlreadyPending),
    });

    await t.run(async (ctx) => {
      const invites = await ctx.db
        .query("invitations")
        .withIndex("by_circle", (q) => q.eq("circleId", circleId))
        .collect();
      expect(invites).toHaveLength(1);
    });
  });

  it("allows re-inviting a removed Member's email", async () => {
    const t = convexTest(schema, modules);
    const { owner, circleId } = await t.run((ctx) => seedCircle(ctx));
    await t.run((ctx) => completeSetup(ctx, circleId));
    const removed = await t.run((ctx) =>
      addMember(ctx, circleId, "removed@example.com", "Removed", "removed"),
    );
    mockCurrentUser.mockResolvedValue(owner);

    const { token } = await t.mutation(api.invitations.createInvitation, {
      circleId,
      email: removed.user.email,
    });
    expect(token).toBeTruthy();
  });

  it("allows a fresh invite when the prior one is expired", async () => {
    const t = convexTest(schema, modules);
    const { owner, circleId } = await t.run((ctx) => seedCircle(ctx));
    await t.run((ctx) => completeSetup(ctx, circleId));
    mockCurrentUser.mockResolvedValue(owner);

    const now = Date.now();
    await t.run(async (ctx) => {
      await ctx.db.insert("invitations", {
        circleId,
        emailLower: "ada@example.com",
        tokenHash: "old-hash",
        status: "pending",
        invitedByUserId: owner._id,
        resendCount: 0,
        createdAt: now - INVITE_TTL_MS - 1,
        expiresAt: now - 1,
      });
    });

    const { token } = await t.mutation(api.invitations.createInvitation, {
      circleId,
      email: "ada@example.com",
    });
    expect(token).toBeTruthy();

    await t.run(async (ctx) => {
      const invites = await ctx.db
        .query("invitations")
        .withIndex("by_circle_and_email", (q) =>
          q.eq("circleId", circleId).eq("emailLower", "ada@example.com"),
        )
        .collect();
      expect(invites).toHaveLength(2);
    });
  });

  it("allows a fresh invite when the prior one is revoked or accepted", async () => {
    const t = convexTest(schema, modules);
    const { owner, circleId } = await t.run((ctx) => seedCircle(ctx));
    await t.run((ctx) => completeSetup(ctx, circleId));
    mockCurrentUser.mockResolvedValue(owner);

    const now = Date.now();
    for (const status of ["revoked", "accepted"] as const) {
      await t.run(async (ctx) => {
        await ctx.db.insert("invitations", {
          circleId,
          emailLower: `${status}@example.com`,
          tokenHash: `hash-${status}`,
          status,
          invitedByUserId: owner._id,
          resendCount: 0,
          createdAt: now,
          expiresAt: now + INVITE_TTL_MS,
        });
      });

      const { token } = await t.mutation(api.invitations.createInvitation, {
        circleId,
        email: `${status}@example.com`,
      });
      expect(token).toBeTruthy();
    }
  });
});

describe("createInvitation — email normalization", () => {
  it("normalizes email and rejects a pending duplicate on emailLower", async () => {
    const t = convexTest(schema, modules);
    const { owner, circleId } = await t.run((ctx) => seedCircle(ctx));
    await t.run((ctx) => completeSetup(ctx, circleId));
    mockCurrentUser.mockResolvedValue(owner);

    await t.mutation(api.invitations.createInvitation, {
      circleId,
      email: "  Ada@Example.COM ",
    });

    await expect(
      t.mutation(api.invitations.createInvitation, { circleId, email: "ada@example.com" }),
    ).rejects.toMatchObject({
      data: mutationErrorData(MUTATION_ERRORS.inviteAlreadyPending),
    });

    await t.run(async (ctx) => {
      const invite = await ctx.db
        .query("invitations")
        .withIndex("by_circle_and_email", (q) =>
          q.eq("circleId", circleId).eq("emailLower", "ada@example.com"),
        )
        .first();
      expect(invite?.emailLower).toBe("ada@example.com");
    });
  });
});

describe("createInvitation — coded errors", () => {
  it("throws ConvexError for owner-facing validation failures", async () => {
    const t = convexTest(schema, modules);
    const { circleId } = await t.run((ctx) => seedCircle(ctx));
    await t.run((ctx) => completeSetup(ctx, circleId));
    const member = await t.run((ctx) => addMember(ctx, circleId, "m@example.com", "Maya"));
    mockCurrentUser.mockResolvedValue(member.user);

    try {
      await t.mutation(api.invitations.createInvitation, { circleId, email: "x@example.com" });
      expect.unreachable("expected forbidden");
    } catch (error) {
      expect(error).toBeInstanceOf(ConvexError);
    }
  });
});
