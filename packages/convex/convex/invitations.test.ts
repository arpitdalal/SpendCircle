import { MUTATION_ERRORS, mutationErrorData } from "@spend-circle/domain";
import { ConvexError } from "convex/values";
import { convexTest } from "convex-test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api.js";
import type { Id } from "./_generated/dataModel.js";
import type { MutationCtx } from "./_generated/server.js";
import { circleEntity, listEntityHistory } from "./history.js";
import { generateInvitationToken, hashInvitationToken } from "./invitationToken.js";
import { createUserWithPersonalCircle } from "./model.js";
import schema from "./schema.js";
import {
  addMember,
  makeUser,
  seedCircle,
  seedFixture,
  seedPersonalCircleOwner,
  seedTransaction,
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
const INVITATION_INVALID = "Invitation invalid";

async function seedPendingInvitation(
  ctx: MutationCtx,
  opts: {
    circleId: Id<"circles">;
    email: string;
    invitedByUserId: Id<"users">;
    token?: string;
    expiresAt?: number;
    status?: "pending" | "accepted" | "revoked" | "expired";
  },
) {
  const token = opts.token ?? generateInvitationToken();
  const tokenHash = await hashInvitationToken(token);
  const now = Date.now();
  await ctx.db.insert("invitations", {
    circleId: opts.circleId,
    emailLower: opts.email.toLowerCase(),
    tokenHash,
    status: opts.status ?? "pending",
    invitedByUserId: opts.invitedByUserId,
    resendCount: 0,
    createdAt: now,
    expiresAt: opts.expiresAt ?? now + INVITE_TTL_MS,
  });
  return token;
}

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

describe("getInvitationPreview", () => {
  it("returns the four preview fields for a pending, unexpired invitation", async () => {
    const t = convexTest(schema, modules);
    const { owner, circleId } = await t.run((ctx) => seedCircle(ctx));
    await t.run((ctx) => completeSetup(ctx, circleId));
    const token = await t.run((ctx) =>
      seedPendingInvitation(ctx, {
        circleId,
        email: "ada@example.com",
        invitedByUserId: owner._id,
      }),
    );

    const preview = await t.query(api.invitations.getInvitationPreview, { token });
    expect(preview).toEqual({
      circleName: "Trip",
      ownerDisplayName: "Olive Owner",
      ownerImage: null,
      invitedEmail: "ada@example.com",
    });
    expect(Object.keys(preview ?? {}).sort()).toEqual(
      ["circleName", "invitedEmail", "ownerDisplayName", "ownerImage"].sort(),
    );
  });

  it("returns null for a missing token", async () => {
    const t = convexTest(schema, modules);
    expect(await t.query(api.invitations.getInvitationPreview, { token: "missing" })).toBeNull();
  });

  it("returns null for an expired invitation", async () => {
    const t = convexTest(schema, modules);
    const { owner, circleId } = await t.run((ctx) => seedCircle(ctx));
    await t.run((ctx) => completeSetup(ctx, circleId));
    const token = await t.run((ctx) =>
      seedPendingInvitation(ctx, {
        circleId,
        email: "ada@example.com",
        invitedByUserId: owner._id,
        expiresAt: Date.now() - 1,
      }),
    );
    expect(await t.query(api.invitations.getInvitationPreview, { token })).toBeNull();
  });

  it.each([
    "accepted",
    "revoked",
  ] as const)("returns null when the invitation is %s", async (status) => {
    const t = convexTest(schema, modules);
    const { owner, circleId } = await t.run((ctx) => seedCircle(ctx));
    await t.run((ctx) => completeSetup(ctx, circleId));
    const token = await t.run((ctx) =>
      seedPendingInvitation(ctx, {
        circleId,
        email: "ada@example.com",
        invitedByUserId: owner._id,
        status,
      }),
    );
    expect(await t.query(api.invitations.getInvitationPreview, { token })).toBeNull();
  });

  it("returns null for an incomplete Circle", async () => {
    const t = convexTest(schema, modules);
    const { owner, circleId } = await t.run((ctx) => seedCircle(ctx));
    const token = await t.run((ctx) =>
      seedPendingInvitation(ctx, {
        circleId,
        email: "ada@example.com",
        invitedByUserId: owner._id,
      }),
    );
    expect(await t.query(api.invitations.getInvitationPreview, { token })).toBeNull();
  });
});

describe("acceptInvitation — happy path", () => {
  it("inserts an active member, marks the invitation accepted, and records history", async () => {
    const t = convexTest(schema, modules);
    const { owner, circleId } = await t.run((ctx) => seedCircle(ctx));
    await t.run((ctx) => completeSetup(ctx, circleId));
    const ada = await t.run((ctx) => makeUser(ctx, "ada@example.com", "Ada Lovelace"));
    const token = await t.run((ctx) =>
      seedPendingInvitation(ctx, {
        circleId,
        email: ada.email,
        invitedByUserId: owner._id,
      }),
    );
    mockCurrentUser.mockResolvedValue(ada);

    const { circleId: returnedCircleId } = await t.mutation(api.invitations.acceptInvitation, {
      token,
    });
    expect(returnedCircleId).toBe(circleId);

    await t.run(async (ctx) => {
      const tokenHash = await hashInvitationToken(token);
      const invite = await ctx.db
        .query("invitations")
        .withIndex("by_token_hash", (q) => q.eq("tokenHash", tokenHash))
        .unique();
      expect(invite?.status).toBe("accepted");

      const membership = await ctx.db
        .query("members")
        .withIndex("by_circle_and_user", (q) => q.eq("circleId", circleId).eq("userId", ada._id))
        .unique();
      expect(membership?.status).toBe("active");
      expect(membership?.displayName).toBe("Ada Lovelace");

      const events = await listEntityHistory(ctx, circleEntity(circleId));
      const joined = events.find((event) => event.action === "member joined");
      expect(joined?.changes).toEqual([{ field: "member", to: "Ada Lovelace" }]);
      expect(JSON.stringify(joined?.changes)).not.toMatch(/[a-z0-9]{20,}/i);
    });

    mockCurrentUser.mockResolvedValue(ada);
    await expect(t.mutation(api.invitations.acceptInvitation, { token })).rejects.toThrow(
      INVITATION_INVALID,
    );
  });
});

describe("acceptInvitation — rejoin", () => {
  it("reactivates the same member row and preserves transaction references", async () => {
    const t = convexTest(schema, modules);
    const fixture = await t.run((ctx) => seedFixture(ctx));
    await t.run((ctx) => completeSetup(ctx, fixture.circleId));
    const removed = await t.run((ctx) =>
      addMember(ctx, fixture.circleId, "ada@example.com", "Ada Lovelace", "removed"),
    );
    const originalJoinedAt = await t.run(async (ctx) => {
      const row = await ctx.db.get(removed.memberId);
      return row?.joinedAt;
    });
    await t.run(async (ctx) => {
      await seedTransaction(ctx, fixture, {
        recordedByMemberId: removed.memberId,
        paidByMemberId: removed.memberId,
        title: "Ada expense",
      });
    });
    const token = await t.run((ctx) =>
      seedPendingInvitation(ctx, {
        circleId: fixture.circleId,
        email: removed.user.email,
        invitedByUserId: fixture.owner._id,
      }),
    );
    mockCurrentUser.mockResolvedValue(removed.user);

    await t.mutation(api.invitations.acceptInvitation, { token });

    await t.run(async (ctx) => {
      const membership = await ctx.db.get(removed.memberId);
      expect(membership?.status).toBe("active");
      expect(membership?.joinedAt).toBe(originalJoinedAt);
      expect(membership?.displayName).toBe("Ada Lovelace");
      expect(membership?.removedAt).toBeUndefined();

      const txn = await ctx.db
        .query("transactions")
        .withIndex("by_circle", (q) => q.eq("circleId", fixture.circleId))
        .first();
      expect(txn?.recordedByMemberId).toBe(removed.memberId);
      expect(txn?.paidByMemberId).toBe(removed.memberId);
    });
  });
});

describe("acceptInvitation — failures", () => {
  it("rejects an unauthenticated caller before token validation", async () => {
    const t = convexTest(schema, modules);
    mockCurrentUser.mockResolvedValue(null);

    await expect(
      t.mutation(api.invitations.acceptInvitation, { token: "any-token" }),
    ).rejects.toThrow("Not authenticated");
  });

  it.each([
    "missing-token",
    "wrong-email",
    "expired",
    "accepted",
    "revoked",
    "incomplete-circle",
  ] as const)("returns the generic invalid signal for %s with no writes", async (caseName) => {
    const t = convexTest(schema, modules);
    const { owner, circleId } = await t.run((ctx) => seedCircle(ctx));
    const ada = await t.run((ctx) => makeUser(ctx, "ada@example.com", "Ada"));
    const wrong = await t.run((ctx) => makeUser(ctx, "wrong@example.com", "Wrong"));
    let token = "missing-token";

    await t.run(async (ctx) => {
      if (caseName === "incomplete-circle") {
        token = await seedPendingInvitation(ctx, {
          circleId,
          email: ada.email,
          invitedByUserId: owner._id,
        });
        return;
      }
      await completeSetup(ctx, circleId);
      if (caseName === "wrong-email") {
        token = await seedPendingInvitation(ctx, {
          circleId,
          email: ada.email,
          invitedByUserId: owner._id,
        });
        return;
      }
      if (caseName === "expired") {
        token = await seedPendingInvitation(ctx, {
          circleId,
          email: ada.email,
          invitedByUserId: owner._id,
          expiresAt: Date.now() - 1,
        });
        return;
      }
      if (caseName === "accepted") {
        token = await seedPendingInvitation(ctx, {
          circleId,
          email: ada.email,
          invitedByUserId: owner._id,
          status: "accepted",
        });
        return;
      }
      if (caseName === "revoked") {
        token = await seedPendingInvitation(ctx, {
          circleId,
          email: ada.email,
          invitedByUserId: owner._id,
          status: "revoked",
        });
      }
    });

    mockCurrentUser.mockResolvedValue(caseName === "wrong-email" ? wrong : ada);

    await expect(t.mutation(api.invitations.acceptInvitation, { token })).rejects.toThrow(
      INVITATION_INVALID,
    );

    await t.run(async (ctx) => {
      const membership = await ctx.db
        .query("members")
        .withIndex("by_circle_and_user", (q) => q.eq("circleId", circleId).eq("userId", ada._id))
        .unique();
      expect(membership).toBeNull();

      if (caseName !== "missing-token" && caseName !== "incomplete-circle") {
        const tokenHash = await hashInvitationToken(token);
        const invite = await ctx.db
          .query("invitations")
          .withIndex("by_token_hash", (q) => q.eq("tokenHash", tokenHash))
          .unique();
        if (caseName === "accepted") {
          expect(invite?.status).toBe("accepted");
        } else if (caseName === "revoked") {
          expect(invite?.status).toBe("revoked");
        } else {
          expect(invite?.status).toBe("pending");
        }
      }
    });
  });

  it("allows exactly one member row when accept is attempted twice concurrently", async () => {
    const t = convexTest(schema, modules);
    const { owner, circleId } = await t.run((ctx) => seedCircle(ctx));
    await t.run((ctx) => completeSetup(ctx, circleId));
    const ada = await t.run((ctx) => makeUser(ctx, "ada@example.com", "Ada"));
    const token = await t.run((ctx) =>
      seedPendingInvitation(ctx, {
        circleId,
        email: ada.email,
        invitedByUserId: owner._id,
      }),
    );
    mockCurrentUser.mockResolvedValue(ada);

    const results = await Promise.allSettled([
      t.mutation(api.invitations.acceptInvitation, { token }),
      t.mutation(api.invitations.acceptInvitation, { token }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);

    await t.run(async (ctx) => {
      const memberships = await ctx.db
        .query("members")
        .withIndex("by_circle_and_user", (q) => q.eq("circleId", circleId).eq("userId", ada._id))
        .collect();
      expect(memberships).toHaveLength(1);
      expect(memberships[0]?.status).toBe("active");
    });
  });
});
