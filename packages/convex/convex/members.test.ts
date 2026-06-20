import { MUTATION_ERRORS, mutationErrorData } from "@spend-circle/domain";
import { convexTest } from "convex-test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api.js";
import { resolveCircleAccess } from "./guard.js";
import { circleEntity, listEntityHistory } from "./history.js";
import { setUserDisplayName } from "./model.js";
import schema from "./schema.js";
import { addMember, makeUser, seedCircle } from "./test/seed.js";

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
    mockCurrentUser.mockResolvedValue(maya.user); // Maya is the caller, not the owner

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

describe("removeMember — permissions", () => {
  it("allows the Owner to remove an active non-owner Member", async () => {
    const t = convexTest(schema, modules);
    const { owner, circleId } = await t.run((ctx) => seedCircle(ctx));
    const maya = await t.run((ctx) => addMember(ctx, circleId, "m@example.com", "Maya Member"));
    mockCurrentUser.mockResolvedValue(owner);

    await t.mutation(api.members.removeMember, { circleId, memberId: maya.memberId });

    await t.run(async (ctx) => {
      const row = await ctx.db.get(maya.memberId);
      expect(row?.status).toBe("removed");
      expect(row?.removedAt).toBeTypeOf("number");
      expect(row?.displayName).toBe("Maya Member");
      expect(row?.image).toBeUndefined();
    });
  });

  it("rejects a non-owner Member with member.removeForbidden", async () => {
    const t = convexTest(schema, modules);
    const { circleId } = await t.run((ctx) => seedCircle(ctx));
    const maya = await t.run((ctx) => addMember(ctx, circleId, "m@example.com", "Maya Member"));
    const other = await t.run((ctx) => addMember(ctx, circleId, "o@example.com", "Other Member"));
    mockCurrentUser.mockResolvedValue(maya.user);

    await expect(
      t.mutation(api.members.removeMember, { circleId, memberId: other.memberId }),
    ).rejects.toMatchObject({
      data: mutationErrorData(MUTATION_ERRORS.memberRemoveForbidden),
    });
  });

  it("rejects a Removed Member with Circle not found", async () => {
    const t = convexTest(schema, modules);
    const { circleId } = await t.run((ctx) => seedCircle(ctx));
    const removed = await t.run((ctx) =>
      addMember(ctx, circleId, "r@example.com", "Rex Removed", "removed"),
    );
    const maya = await t.run((ctx) => addMember(ctx, circleId, "m@example.com", "Maya Member"));
    mockCurrentUser.mockResolvedValue(removed.user);

    await expect(
      t.mutation(api.members.removeMember, { circleId, memberId: maya.memberId }),
    ).rejects.toThrow("Circle not found");
  });

  it("rejects a memberId from a different Circle with Member not found", async () => {
    const t = convexTest(schema, modules);
    const { owner, circleId } = await t.run((ctx) => seedCircle(ctx));
    const otherCircle = await t.run((ctx) => seedCircle(ctx));
    const outsider = await t.run((ctx) =>
      addMember(ctx, otherCircle.circleId, "o@example.com", "Other Member"),
    );
    mockCurrentUser.mockResolvedValue(owner);

    await expect(
      t.mutation(api.members.removeMember, { circleId, memberId: outsider.memberId }),
    ).rejects.toThrow("Member not found");
  });

  it("rejects removing the Owner's membership row", async () => {
    const t = convexTest(schema, modules);
    const { owner, ownerMemberId, circleId } = await t.run((ctx) => seedCircle(ctx));
    mockCurrentUser.mockResolvedValue(owner);

    await expect(
      t.mutation(api.members.removeMember, { circleId, memberId: ownerMemberId }),
    ).rejects.toThrow("Cannot remove the Circle owner");
  });

  it("rejects removal from a Personal Circle with Circle not found", async () => {
    const t = convexTest(schema, modules);
    const { owner, ownerMemberId, circleId } = await t.run((ctx) =>
      seedCircle(ctx, { kind: "personal" }),
    );
    mockCurrentUser.mockResolvedValue(owner);

    await expect(
      t.mutation(api.members.removeMember, { circleId, memberId: ownerMemberId }),
    ).rejects.toThrow("Circle not found");
  });

  it("rejects removal from an archived Circle with circle.archived", async () => {
    const t = convexTest(schema, modules);
    const { owner, circleId } = await t.run((ctx) => seedCircle(ctx, { archived: true }));
    const maya = await t.run((ctx) => addMember(ctx, circleId, "m@example.com", "Maya Member"));
    mockCurrentUser.mockResolvedValue(owner);

    await expect(
      t.mutation(api.members.removeMember, { circleId, memberId: maya.memberId }),
    ).rejects.toMatchObject({
      data: mutationErrorData(MUTATION_ERRORS.circleArchived),
    });
  });

  it("rejects a missing memberId with Member not found", async () => {
    const t = convexTest(schema, modules);
    const { owner, circleId } = await t.run((ctx) => seedCircle(ctx));
    const ghost = await t.run(async (ctx) => {
      const maya = await addMember(ctx, circleId, "m@example.com", "Maya Member");
      await ctx.db.delete(maya.memberId);
      return maya.memberId;
    });
    mockCurrentUser.mockResolvedValue(owner);

    await expect(
      t.mutation(api.members.removeMember, { circleId, memberId: ghost }),
    ).rejects.toThrow("Member not found");
  });

  it("rejects removing an already-removed Member", async () => {
    const t = convexTest(schema, modules);
    const { owner, circleId } = await t.run((ctx) => seedCircle(ctx));
    const removed = await t.run((ctx) =>
      addMember(ctx, circleId, "r@example.com", "Rex Removed", "removed"),
    );
    mockCurrentUser.mockResolvedValue(owner);

    await expect(
      t.mutation(api.members.removeMember, { circleId, memberId: removed.memberId }),
    ).rejects.toThrow("Member is already removed");
  });
});

describe("removeMember — frozen identity and live list", () => {
  it("leaves displayName/image unchanged and skips setUserDisplayName on the removed row", async () => {
    const t = convexTest(schema, modules);
    const { owner, circleId } = await t.run((ctx) => seedCircle(ctx));
    const maya = await t.run(async (ctx) => {
      const seeded = await addMember(ctx, circleId, "m@example.com", "Maya Member");
      await ctx.db.patch(seeded.memberId, { image: "https://example.com/maya.png" });
      return seeded;
    });
    mockCurrentUser.mockResolvedValue(owner);

    await t.mutation(api.members.removeMember, { circleId, memberId: maya.memberId });
    await t.run((ctx) => setUserDisplayName(ctx, maya.user._id, "New Name"));

    await t.run(async (ctx) => {
      const row = await ctx.db.get(maya.memberId);
      expect(row?.displayName).toBe("Maya Member");
      expect(row?.image).toBe("https://example.com/maya.png");
    });
  });

  it("collapses resolveCircleAccess for the removed user", async () => {
    const t = convexTest(schema, modules);
    const { owner, circleId } = await t.run((ctx) => seedCircle(ctx));
    const maya = await t.run((ctx) => addMember(ctx, circleId, "m@example.com", "Maya Member"));
    mockCurrentUser.mockResolvedValue(owner);

    await t.mutation(api.members.removeMember, { circleId, memberId: maya.memberId });
    mockCurrentUser.mockResolvedValue(maya.user);

    const access = await t.run((ctx) => resolveCircleAccess(ctx, circleId));
    expect(access).toBeNull();
  });

  it("drops the removed member from the default list and includes them when asked", async () => {
    const t = convexTest(schema, modules);
    const { owner, circleId } = await t.run((ctx) => seedCircle(ctx));
    const maya = await t.run((ctx) => addMember(ctx, circleId, "m@example.com", "Maya Member"));
    mockCurrentUser.mockResolvedValue(owner);

    await t.mutation(api.members.removeMember, { circleId, memberId: maya.memberId });

    const active = await t.query(api.members.listMembers, { circleId });
    expect(active?.map((m) => m.displayName)).toEqual(["Olive Owner"]);

    const all = await t.query(api.members.listMembers, { circleId, includeRemoved: true });
    const removedView = all?.find((m) => m.id === maya.memberId);
    expect(removedView?.status).toBe("removed");
    expect(removedView?.displayName).toBe("Maya Member");
  });

  it("records exactly one member removed history event with the frozen display name", async () => {
    const t = convexTest(schema, modules);
    const { owner, ownerMemberId, circleId } = await t.run((ctx) => seedCircle(ctx));
    const maya = await t.run((ctx) => addMember(ctx, circleId, "m@example.com", "Maya Member"));
    mockCurrentUser.mockResolvedValue(owner);

    await t.mutation(api.members.removeMember, { circleId, memberId: maya.memberId });

    await t.run(async (ctx) => {
      const events = await listEntityHistory(ctx, circleEntity(circleId));
      expect(events).toHaveLength(1);
      expect(events[0]?.action).toBe("member removed");
      expect(events[0]?.actorMemberId).toBe(ownerMemberId);
      expect(events[0]?.changes).toEqual([{ field: "member", from: "Maya Member" }]);
    });
  });
});
