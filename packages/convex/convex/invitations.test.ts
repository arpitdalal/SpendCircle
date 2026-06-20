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
import {
  addMember,
  makeUser,
  seedCircle,
  seedInvitation,
  seedPersonalCircleOwner,
} from "./test/seed.js";

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
        resendTimestamps: [],
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
          resendTimestamps: [],
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

describe("createInvitation — daily cap", () => {
  it("rejects when the owner has sent 100 invitation emails in the last 24 h", async () => {
    const t = convexTest(schema, modules);
    const { owner, circleId } = await t.run((ctx) => seedCircle(ctx));
    await t.run((ctx) => completeSetup(ctx, circleId));
    mockCurrentUser.mockResolvedValue(owner);

    const now = Date.now();
    await t.run(async (ctx) => {
      for (let i = 0; i < 100; i++) {
        await seedInvitation(ctx, circleId, owner._id, {
          email: `cap-${i}@example.com`,
          createdAt: now - 1000,
        });
      }
    });

    await expect(
      t.mutation(api.invitations.createInvitation, { circleId, email: "one-more@example.com" }),
    ).rejects.toMatchObject({
      data: mutationErrorData(MUTATION_ERRORS.inviteDailyCapReached),
    });
  });
});

describe("listPendingInvitations", () => {
  it("returns pending non-expired invitations for the Owner without tokenHash", async () => {
    const t = convexTest(schema, modules);
    const { owner, circleId } = await t.run((ctx) => seedCircle(ctx));
    await t.run((ctx) => completeSetup(ctx, circleId));
    mockCurrentUser.mockResolvedValue(owner);

    const inviteId = await t.run((ctx) =>
      seedInvitation(ctx, circleId, owner._id, { email: "ada@example.com" }),
    );

    const result = await t.query(api.invitations.listPendingInvitations, { circleId });
    expect(result).toHaveLength(1);
    expect(result?.[0]).toEqual({
      id: inviteId,
      email: "ada@example.com",
      createdAt: expect.any(Number),
      expiresAt: expect.any(Number),
      resendCount: 0,
    });
    expect(result?.[0]).not.toHaveProperty("tokenHash");
  });

  it("returns null for a non-owner Member", async () => {
    const t = convexTest(schema, modules);
    const { owner, circleId } = await t.run((ctx) => seedCircle(ctx));
    await t.run((ctx) => completeSetup(ctx, circleId));
    const member = await t.run((ctx) => addMember(ctx, circleId, "m@example.com", "Maya"));
    await t.run((ctx) => seedInvitation(ctx, circleId, owner._id, { email: "ada@example.com" }));
    mockCurrentUser.mockResolvedValue(member.user);

    expect(await t.query(api.invitations.listPendingInvitations, { circleId })).toBeNull();
  });

  it("returns null for a non-member", async () => {
    const t = convexTest(schema, modules);
    const { owner, circleId } = await t.run((ctx) => seedCircle(ctx));
    await t.run((ctx) => completeSetup(ctx, circleId));
    const stranger = await t.run((ctx) => makeUser(ctx, "stranger@example.com", "Stranger"));
    await t.run((ctx) => seedInvitation(ctx, circleId, owner._id, { email: "ada@example.com" }));
    mockCurrentUser.mockResolvedValue(stranger);

    expect(await t.query(api.invitations.listPendingInvitations, { circleId })).toBeNull();
  });

  it("returns null when unauthenticated", async () => {
    const t = convexTest(schema, modules);
    const { owner, circleId } = await t.run((ctx) => seedCircle(ctx));
    await t.run((ctx) => completeSetup(ctx, circleId));
    await t.run((ctx) => seedInvitation(ctx, circleId, owner._id, { email: "ada@example.com" }));
    mockCurrentUser.mockResolvedValue(null);

    expect(await t.query(api.invitations.listPendingInvitations, { circleId })).toBeNull();
  });

  it("excludes expired, revoked, and accepted invitations", async () => {
    const t = convexTest(schema, modules);
    const { owner, circleId } = await t.run((ctx) => seedCircle(ctx));
    await t.run((ctx) => completeSetup(ctx, circleId));
    mockCurrentUser.mockResolvedValue(owner);

    const now = Date.now();
    await t.run(async (ctx) => {
      await seedInvitation(ctx, circleId, owner._id, {
        email: "expired@example.com",
        expiresAt: now - 1,
      });
      await seedInvitation(ctx, circleId, owner._id, {
        email: "revoked@example.com",
        status: "revoked",
      });
      await seedInvitation(ctx, circleId, owner._id, {
        email: "accepted@example.com",
        status: "accepted",
      });
      await seedInvitation(ctx, circleId, owner._id, { email: "pending@example.com" });
    });

    const result = await t.query(api.invitations.listPendingInvitations, { circleId });
    expect(result).toHaveLength(1);
    expect(result?.[0]?.email).toBe("pending@example.com");
  });

  it("returns all pending invitations when multiple exist", async () => {
    const t = convexTest(schema, modules);
    const { owner, circleId } = await t.run((ctx) => seedCircle(ctx));
    await t.run((ctx) => completeSetup(ctx, circleId));
    mockCurrentUser.mockResolvedValue(owner);

    await t.run(async (ctx) => {
      for (const email of ["a@example.com", "b@example.com", "c@example.com"]) {
        await seedInvitation(ctx, circleId, owner._id, { email });
      }
    });

    expect(await t.query(api.invitations.listPendingInvitations, { circleId })).toHaveLength(3);
  });
});

describe("resendInvitation", () => {
  it("rotates the token, refreshes expiry, and records history", async () => {
    const t = convexTest(schema, modules);
    const { owner, circleId } = await t.run((ctx) => seedCircle(ctx));
    await t.run((ctx) => completeSetup(ctx, circleId));
    mockCurrentUser.mockResolvedValue(owner);

    const oldToken = "old-plaintext-token";
    const oldHash = await hashInvitationToken(oldToken);
    const inviteId = await t.run((ctx) =>
      seedInvitation(ctx, circleId, owner._id, {
        email: "ada@example.com",
        tokenHash: oldHash,
        expiresAt: Date.now() + 1000,
      }),
    );

    const before = Date.now();
    const { token } = await t.mutation(api.invitations.resendInvitation, {
      invitationId: inviteId,
    });
    expect(token).toBeTruthy();
    expect(token).not.toBe(oldToken);

    await t.run(async (ctx) => {
      const invite = await ctx.db.get(inviteId);
      expect(invite?.tokenHash).not.toBe(oldHash);
      expect(invite?.tokenHash).toBe(await hashInvitationToken(token));
      expect(invite?.resendCount).toBe(1);
      expect(invite?.resendTimestamps).toHaveLength(1);
      expect(invite?.expiresAt).toBeGreaterThanOrEqual(before + INVITE_TTL_MS - 1000);

      const events = await listEntityHistory(ctx, circleEntity(circleId));
      expect(events.some((event) => event.action === "invitation resent")).toBe(true);
      const resent = events.find((event) => event.action === "invitation resent");
      expect(resent?.changes).toEqual([{ field: "email", to: "ada@example.com" }]);
    });
  });

  it("rejects an archived Circle", async () => {
    const t = convexTest(schema, modules);
    const { owner, circleId } = await t.run((ctx) => seedCircle(ctx, { archived: true }));
    await t.run((ctx) => completeSetup(ctx, circleId));
    mockCurrentUser.mockResolvedValue(owner);

    const inviteId = await t.run((ctx) =>
      seedInvitation(ctx, circleId, owner._id, { email: "ada@example.com" }),
    );

    await expect(
      t.mutation(api.invitations.resendInvitation, { invitationId: inviteId }),
    ).rejects.toMatchObject({
      data: mutationErrorData(MUTATION_ERRORS.circleArchived),
    });
  });

  it("rejects a non-owner Member", async () => {
    const t = convexTest(schema, modules);
    const { owner, circleId } = await t.run((ctx) => seedCircle(ctx));
    await t.run((ctx) => completeSetup(ctx, circleId));
    const member = await t.run((ctx) => addMember(ctx, circleId, "m@example.com", "Maya"));
    const inviteId = await t.run((ctx) =>
      seedInvitation(ctx, circleId, owner._id, { email: "ada@example.com" }),
    );
    mockCurrentUser.mockResolvedValue(member.user);

    await expect(
      t.mutation(api.invitations.resendInvitation, { invitationId: inviteId }),
    ).rejects.toMatchObject({
      data: mutationErrorData(MUTATION_ERRORS.inviteForbidden),
    });
  });

  it("rejects a non-member with a generic error", async () => {
    const t = convexTest(schema, modules);
    const { owner, circleId } = await t.run((ctx) => seedCircle(ctx));
    await t.run((ctx) => completeSetup(ctx, circleId));
    const stranger = await t.run((ctx) => makeUser(ctx, "stranger@example.com", "Stranger"));
    const inviteId = await t.run((ctx) =>
      seedInvitation(ctx, circleId, owner._id, { email: "ada@example.com" }),
    );
    mockCurrentUser.mockResolvedValue(stranger);

    await expect(
      t.mutation(api.invitations.resendInvitation, { invitationId: inviteId }),
    ).rejects.toThrow("Circle not found");
  });

  it("rejects an invitation from a different Circle", async () => {
    const t = convexTest(schema, modules);
    const { owner, circleId } = await t.run((ctx) => seedCircle(ctx));
    const { circleId: otherCircleId } = await t.run((ctx) => seedCircle(ctx));
    await t.run((ctx) => completeSetup(ctx, circleId));
    await t.run((ctx) => completeSetup(ctx, otherCircleId));
    mockCurrentUser.mockResolvedValue(owner);

    const inviteId = await t.run((ctx) =>
      seedInvitation(ctx, otherCircleId, owner._id, { email: "ada@example.com" }),
    );

    await expect(
      t.mutation(api.invitations.resendInvitation, { invitationId: inviteId }),
    ).rejects.toThrow("Circle not found");
  });

  it("rejects revoked and expired invitations with a generic error", async () => {
    const t = convexTest(schema, modules);
    const { owner, circleId } = await t.run((ctx) => seedCircle(ctx));
    await t.run((ctx) => completeSetup(ctx, circleId));
    mockCurrentUser.mockResolvedValue(owner);

    const revokedId = await t.run((ctx) =>
      seedInvitation(ctx, circleId, owner._id, {
        email: "revoked@example.com",
        status: "revoked",
      }),
    );
    const expiredId = await t.run((ctx) =>
      seedInvitation(ctx, circleId, owner._id, {
        email: "expired@example.com",
        expiresAt: Date.now() - 1,
      }),
    );

    for (const invitationId of [revokedId, expiredId]) {
      await expect(t.mutation(api.invitations.resendInvitation, { invitationId })).rejects.toThrow(
        "Invitation not found",
      );
    }
  });

  it("rejects setup-incomplete Circles", async () => {
    const t = convexTest(schema, modules);
    const { owner, circleId } = await t.run((ctx) => seedCircle(ctx));
    mockCurrentUser.mockResolvedValue(owner);

    const inviteId = await t.run((ctx) =>
      seedInvitation(ctx, circleId, owner._id, { email: "ada@example.com" }),
    );

    await expect(
      t.mutation(api.invitations.resendInvitation, { invitationId: inviteId }),
    ).rejects.toMatchObject({
      data: mutationErrorData(MUTATION_ERRORS.inviteSetupIncomplete),
    });
  });

  it("enforces the per-email resend cap within 24 h", async () => {
    const t = convexTest(schema, modules);
    const { owner, circleId } = await t.run((ctx) => seedCircle(ctx));
    await t.run((ctx) => completeSetup(ctx, circleId));
    mockCurrentUser.mockResolvedValue(owner);

    const now = Date.now();
    const inviteId = await t.run((ctx) =>
      seedInvitation(ctx, circleId, owner._id, {
        email: "ada@example.com",
        resendTimestamps: [now - 1000, now - 2000, now - 3000],
      }),
    );

    await expect(
      t.mutation(api.invitations.resendInvitation, { invitationId: inviteId }),
    ).rejects.toMatchObject({
      data: mutationErrorData(MUTATION_ERRORS.inviteResendCapReached),
    });
  });

  it("allows resend when prior timestamps are outside the 24 h window", async () => {
    const t = convexTest(schema, modules);
    const { owner, circleId } = await t.run((ctx) => seedCircle(ctx));
    await t.run((ctx) => completeSetup(ctx, circleId));
    mockCurrentUser.mockResolvedValue(owner);

    const now = Date.now();
    const inviteId = await t.run((ctx) =>
      seedInvitation(ctx, circleId, owner._id, {
        email: "ada@example.com",
        resendTimestamps: [now - INVITE_TTL_MS, now - INVITE_TTL_MS - 1, now - INVITE_TTL_MS - 2],
      }),
    );

    const { token } = await t.mutation(api.invitations.resendInvitation, {
      invitationId: inviteId,
    });
    expect(token).toBeTruthy();
  });

  it("counts only in-window resend timestamps toward the cap", async () => {
    const t = convexTest(schema, modules);
    const { owner, circleId } = await t.run((ctx) => seedCircle(ctx));
    await t.run((ctx) => completeSetup(ctx, circleId));
    mockCurrentUser.mockResolvedValue(owner);

    const now = Date.now();
    const inviteId = await t.run((ctx) =>
      seedInvitation(ctx, circleId, owner._id, {
        email: "ada@example.com",
        resendTimestamps: [now - 1000, now - 2000, now - INVITE_TTL_MS],
      }),
    );

    const { token } = await t.mutation(api.invitations.resendInvitation, {
      invitationId: inviteId,
    });
    expect(token).toBeTruthy();
  });

  it("increments resendCount across multiple resends", async () => {
    const t = convexTest(schema, modules);
    const { owner, circleId } = await t.run((ctx) => seedCircle(ctx));
    await t.run((ctx) => completeSetup(ctx, circleId));
    mockCurrentUser.mockResolvedValue(owner);

    const inviteId = await t.run((ctx) =>
      seedInvitation(ctx, circleId, owner._id, { email: "ada@example.com" }),
    );

    await t.mutation(api.invitations.resendInvitation, { invitationId: inviteId });
    await t.mutation(api.invitations.resendInvitation, { invitationId: inviteId });

    await t.run(async (ctx) => {
      const invite = await ctx.db.get(inviteId);
      expect(invite?.resendCount).toBe(2);
    });
  });

  it("enforces the daily user cap on resend", async () => {
    const t = convexTest(schema, modules);
    const { owner, circleId } = await t.run((ctx) => seedCircle(ctx));
    await t.run((ctx) => completeSetup(ctx, circleId));
    mockCurrentUser.mockResolvedValue(owner);

    const now = Date.now();
    await t.run(async (ctx) => {
      for (let i = 0; i < 100; i++) {
        await seedInvitation(ctx, circleId, owner._id, {
          email: `daily-${i}@example.com`,
          createdAt: now - 1000,
        });
      }
    });

    const inviteId = await t.run((ctx) =>
      seedInvitation(ctx, circleId, owner._id, {
        email: "target@example.com",
        createdAt: now - INVITE_TTL_MS,
      }),
    );

    await expect(
      t.mutation(api.invitations.resendInvitation, { invitationId: inviteId }),
    ).rejects.toMatchObject({
      data: mutationErrorData(MUTATION_ERRORS.inviteDailyCapReached),
    });
  });

  it("allows resend when 99 emails are in-window and one is outside", async () => {
    const t = convexTest(schema, modules);
    const { owner, circleId } = await t.run((ctx) => seedCircle(ctx));
    await t.run((ctx) => completeSetup(ctx, circleId));
    mockCurrentUser.mockResolvedValue(owner);

    const now = Date.now();
    await t.run(async (ctx) => {
      for (let i = 0; i < 99; i++) {
        await seedInvitation(ctx, circleId, owner._id, {
          email: `daily-${i}@example.com`,
          createdAt: now - 1000,
        });
      }
      await seedInvitation(ctx, circleId, owner._id, {
        email: "old@example.com",
        createdAt: now - INVITE_TTL_MS,
      });
    });

    const inviteId = await t.run((ctx) =>
      seedInvitation(ctx, circleId, owner._id, {
        email: "target@example.com",
        createdAt: now - INVITE_TTL_MS,
      }),
    );

    const { token } = await t.mutation(api.invitations.resendInvitation, {
      invitationId: inviteId,
    });
    expect(token).toBeTruthy();
  });
});

describe("revokeInvitation", () => {
  it("sets status to revoked and records history", async () => {
    const t = convexTest(schema, modules);
    const { owner, circleId } = await t.run((ctx) => seedCircle(ctx));
    await t.run((ctx) => completeSetup(ctx, circleId));
    mockCurrentUser.mockResolvedValue(owner);

    const inviteId = await t.run((ctx) =>
      seedInvitation(ctx, circleId, owner._id, { email: "ada@example.com" }),
    );

    await t.mutation(api.invitations.revokeInvitation, { invitationId: inviteId });

    await t.run(async (ctx) => {
      const invite = await ctx.db.get(inviteId);
      expect(invite?.status).toBe("revoked");

      const events = await listEntityHistory(ctx, circleEntity(circleId));
      const revoked = events.find((event) => event.action === "invitation revoked");
      expect(revoked?.changes).toEqual([{ field: "email", from: "ada@example.com" }]);
    });
  });

  it("rejects an archived Circle", async () => {
    const t = convexTest(schema, modules);
    const { owner, circleId } = await t.run((ctx) => seedCircle(ctx, { archived: true }));
    await t.run((ctx) => completeSetup(ctx, circleId));
    mockCurrentUser.mockResolvedValue(owner);

    const inviteId = await t.run((ctx) =>
      seedInvitation(ctx, circleId, owner._id, { email: "ada@example.com" }),
    );

    await expect(
      t.mutation(api.invitations.revokeInvitation, { invitationId: inviteId }),
    ).rejects.toMatchObject({
      data: mutationErrorData(MUTATION_ERRORS.circleArchived),
    });
  });

  it("rejects a non-owner Member", async () => {
    const t = convexTest(schema, modules);
    const { owner, circleId } = await t.run((ctx) => seedCircle(ctx));
    await t.run((ctx) => completeSetup(ctx, circleId));
    const member = await t.run((ctx) => addMember(ctx, circleId, "m@example.com", "Maya"));
    const inviteId = await t.run((ctx) =>
      seedInvitation(ctx, circleId, owner._id, { email: "ada@example.com" }),
    );
    mockCurrentUser.mockResolvedValue(member.user);

    await expect(
      t.mutation(api.invitations.revokeInvitation, { invitationId: inviteId }),
    ).rejects.toMatchObject({
      data: mutationErrorData(MUTATION_ERRORS.inviteForbidden),
    });
  });

  it("rejects a non-member with a generic error", async () => {
    const t = convexTest(schema, modules);
    const { owner, circleId } = await t.run((ctx) => seedCircle(ctx));
    await t.run((ctx) => completeSetup(ctx, circleId));
    const stranger = await t.run((ctx) => makeUser(ctx, "stranger@example.com", "Stranger"));
    const inviteId = await t.run((ctx) =>
      seedInvitation(ctx, circleId, owner._id, { email: "ada@example.com" }),
    );
    mockCurrentUser.mockResolvedValue(stranger);

    await expect(
      t.mutation(api.invitations.revokeInvitation, { invitationId: inviteId }),
    ).rejects.toThrow("Circle not found");
  });

  it("rejects already-revoked and accepted invitations", async () => {
    const t = convexTest(schema, modules);
    const { owner, circleId } = await t.run((ctx) => seedCircle(ctx));
    await t.run((ctx) => completeSetup(ctx, circleId));
    mockCurrentUser.mockResolvedValue(owner);

    const revokedId = await t.run((ctx) =>
      seedInvitation(ctx, circleId, owner._id, {
        email: "revoked@example.com",
        status: "revoked",
      }),
    );
    const acceptedId = await t.run((ctx) =>
      seedInvitation(ctx, circleId, owner._id, {
        email: "accepted@example.com",
        status: "accepted",
      }),
    );

    for (const invitationId of [revokedId, acceptedId]) {
      await expect(t.mutation(api.invitations.revokeInvitation, { invitationId })).rejects.toThrow(
        "Invitation not found",
      );
    }
  });

  it("rejects an invitation from a different Circle", async () => {
    const t = convexTest(schema, modules);
    const { owner, circleId } = await t.run((ctx) => seedCircle(ctx));
    const { circleId: otherCircleId } = await t.run((ctx) => seedCircle(ctx));
    await t.run((ctx) => completeSetup(ctx, circleId));
    await t.run((ctx) => completeSetup(ctx, otherCircleId));
    mockCurrentUser.mockResolvedValue(owner);

    const inviteId = await t.run((ctx) =>
      seedInvitation(ctx, otherCircleId, owner._id, { email: "ada@example.com" }),
    );

    await expect(
      t.mutation(api.invitations.revokeInvitation, { invitationId: inviteId }),
    ).rejects.toThrow("Circle not found");
  });
});
