import { MUTATION_ERRORS, mutationErrorData } from "@spend-circle/domain";
import { convexTest } from "convex-test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api.js";
import { circleEntity, listEntityHistory } from "./history.js";
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
    expect(members?.[0]?.isSelf).toBe(true);
    expect(members?.[1]?.isSelf).toBe(false);
    for (const member of members ?? []) {
      expect(member).not.toHaveProperty("userId");
    }
  });

  it("flags isSelf relative to the calling Member, not the Owner", async () => {
    const t = convexTest(schema, modules);
    const { circleId } = await t.run((ctx) => seedCircle(ctx));
    const maya = await t.run((ctx) => addMember(ctx, circleId, "m@example.com", "Maya Member"));
    mockCurrentUser.mockResolvedValue(maya.user);

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

describe("transferOwnership — happy path and invariant", () => {
  it("atomically moves ownership on member rows and circles.ownerUserId", async () => {
    const t = convexTest(schema, modules);
    const { owner, ownerMemberId, circleId } = await t.run((ctx) => seedCircle(ctx));
    const maya = await t.run((ctx) => addMember(ctx, circleId, "m@example.com", "Maya Member"));
    mockCurrentUser.mockResolvedValue(owner);

    await t.mutation(api.members.transferOwnership, {
      circleId,
      toMemberId: maya.memberId,
    });

    await t.run(async (ctx) => {
      const circle = await ctx.db.get(circleId);
      const ownerRow = await ctx.db.get(ownerMemberId);
      const targetRow = await ctx.db.get(maya.memberId);
      expect(targetRow?.role).toBe("owner");
      expect(ownerRow?.role).toBe("member");
      expect(circle?.ownerUserId).toBe(maya.user._id);

      const members = await ctx.db
        .query("members")
        .withIndex("by_circle", (q) => q.eq("circleId", circleId))
        .collect();
      const owners = members.filter((member) => member.role === "owner");
      expect(owners).toHaveLength(1);
      expect(owners[0]?.userId).toBe(circle?.ownerUserId);
    });
  });

  it("records ownership transferred history with display names only", async () => {
    const t = convexTest(schema, modules);
    const { owner, ownerMemberId, circleId } = await t.run((ctx) => seedCircle(ctx));
    const maya = await t.run((ctx) => addMember(ctx, circleId, "m@example.com", "Maya Member"));
    mockCurrentUser.mockResolvedValue(owner);

    await t.mutation(api.members.transferOwnership, {
      circleId,
      toMemberId: maya.memberId,
    });

    await t.run(async (ctx) => {
      const events = await listEntityHistory(ctx, circleEntity(circleId));
      expect(events).toHaveLength(1);
      expect(events[0]?.action).toBe("ownership transferred");
      expect(events[0]?.actorMemberId).toBe(ownerMemberId);
      expect(events[0]?.changes).toEqual([
        { field: "owner", from: "Olive Owner", to: "Maya Member" },
      ]);
    });
  });

  it("reorders listMembers with the new owner first and demotes the old owner", async () => {
    const t = convexTest(schema, modules);
    const { owner, circleId } = await t.run((ctx) => seedCircle(ctx));
    const maya = await t.run((ctx) => addMember(ctx, circleId, "m@example.com", "Maya Member"));
    mockCurrentUser.mockResolvedValue(owner);

    await t.mutation(api.members.transferOwnership, {
      circleId,
      toMemberId: maya.memberId,
    });

    mockCurrentUser.mockResolvedValue(maya.user);
    const members = await t.query(api.members.listMembers, { circleId });
    expect(members?.map((m) => m.displayName)).toEqual(["Maya Member", "Olive Owner"]);
    expect(members?.[0]?.role).toBe("owner");
  });
});

describe("transferOwnership — permissions", () => {
  it("rejects a non-owner Member with transfer.forbidden", async () => {
    const t = convexTest(schema, modules);
    const { circleId } = await t.run((ctx) => seedCircle(ctx));
    const maya = await t.run((ctx) => addMember(ctx, circleId, "m@example.com", "Maya Member"));
    const other = await t.run((ctx) => addMember(ctx, circleId, "o@example.com", "Other Member"));
    mockCurrentUser.mockResolvedValue(maya.user);

    await expect(
      t.mutation(api.members.transferOwnership, { circleId, toMemberId: other.memberId }),
    ).rejects.toMatchObject({
      data: mutationErrorData(MUTATION_ERRORS.transferForbidden),
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
      t.mutation(api.members.transferOwnership, { circleId, toMemberId: maya.memberId }),
    ).rejects.toThrow("Circle not found");
  });

  it("rejects an unauthenticated caller with Circle not found", async () => {
    const t = convexTest(schema, modules);
    const { circleId, ownerMemberId } = await t.run((ctx) => seedCircle(ctx));
    const maya = await t.run((ctx) => addMember(ctx, circleId, "m@example.com", "Maya Member"));
    mockCurrentUser.mockResolvedValue(null);

    await expect(
      t.mutation(api.members.transferOwnership, { circleId, toMemberId: maya.memberId }),
    ).rejects.toThrow("Circle not found");

    await t.run(async (ctx) => {
      const ownerRow = await ctx.db.get(ownerMemberId);
      expect(ownerRow?.role).toBe("owner");
    });
  });

  it("rejects a non-member with Circle not found", async () => {
    const t = convexTest(schema, modules);
    const { circleId } = await t.run((ctx) => seedCircle(ctx));
    const maya = await t.run((ctx) => addMember(ctx, circleId, "m@example.com", "Maya Member"));
    const stranger = await t.run((ctx) => makeUser(ctx, "s@example.com", "Sam Stranger"));
    mockCurrentUser.mockResolvedValue(stranger);

    await expect(
      t.mutation(api.members.transferOwnership, { circleId, toMemberId: maya.memberId }),
    ).rejects.toThrow("Circle not found");
  });
});

describe("transferOwnership — target validation", () => {
  it("rejects a memberId from a different Circle with Member not found", async () => {
    const t = convexTest(schema, modules);
    const { owner, circleId } = await t.run((ctx) => seedCircle(ctx));
    const otherCircle = await t.run((ctx) => seedCircle(ctx));
    const outsider = await t.run((ctx) =>
      addMember(ctx, otherCircle.circleId, "o@example.com", "Other Member"),
    );
    mockCurrentUser.mockResolvedValue(owner);

    await expect(
      t.mutation(api.members.transferOwnership, { circleId, toMemberId: outsider.memberId }),
    ).rejects.toThrow("Member not found");
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
      t.mutation(api.members.transferOwnership, { circleId, toMemberId: ghost }),
    ).rejects.toThrow("Member not found");
  });

  it("rejects a removed target in this Circle with transfer.targetNotMember", async () => {
    const t = convexTest(schema, modules);
    const { owner, circleId } = await t.run((ctx) => seedCircle(ctx));
    const removed = await t.run((ctx) =>
      addMember(ctx, circleId, "r@example.com", "Rex Removed", "removed"),
    );
    mockCurrentUser.mockResolvedValue(owner);

    await expect(
      t.mutation(api.members.transferOwnership, { circleId, toMemberId: removed.memberId }),
    ).rejects.toMatchObject({
      data: mutationErrorData(MUTATION_ERRORS.transferTargetNotMember),
    });
  });

  it("rejects self-transfer with transfer.toSelf", async () => {
    const t = convexTest(schema, modules);
    const { owner, ownerMemberId, circleId } = await t.run((ctx) => seedCircle(ctx));
    mockCurrentUser.mockResolvedValue(owner);

    await expect(
      t.mutation(api.members.transferOwnership, { circleId, toMemberId: ownerMemberId }),
    ).rejects.toMatchObject({
      data: mutationErrorData(MUTATION_ERRORS.transferToSelf),
    });
  });
});

describe("transferOwnership — lifecycle", () => {
  it("rejects an archived Circle with circle.archived", async () => {
    const t = convexTest(schema, modules);
    const { owner, circleId } = await t.run((ctx) => seedCircle(ctx, { archived: true }));
    const maya = await t.run((ctx) => addMember(ctx, circleId, "m@example.com", "Maya Member"));
    mockCurrentUser.mockResolvedValue(owner);

    await expect(
      t.mutation(api.members.transferOwnership, { circleId, toMemberId: maya.memberId }),
    ).rejects.toMatchObject({
      data: mutationErrorData(MUTATION_ERRORS.circleArchived),
    });
  });

  it("rejects a Personal Circle with transfer.personalCircle", async () => {
    const t = convexTest(schema, modules);
    const { owner, ownerMemberId, circleId } = await t.run((ctx) =>
      seedCircle(ctx, { kind: "personal" }),
    );
    mockCurrentUser.mockResolvedValue(owner);

    await expect(
      t.mutation(api.members.transferOwnership, { circleId, toMemberId: ownerMemberId }),
    ).rejects.toMatchObject({
      data: mutationErrorData(MUTATION_ERRORS.transferPersonalCircle),
    });
  });
});

describe("transferOwnership — cross-slice", () => {
  it("lets the new owner rename and blocks the old owner", async () => {
    const t = convexTest(schema, modules);
    const { owner, circleId } = await t.run((ctx) => seedCircle(ctx));
    const maya = await t.run((ctx) => addMember(ctx, circleId, "m@example.com", "Maya Member"));
    mockCurrentUser.mockResolvedValue(owner);

    await t.mutation(api.members.transferOwnership, {
      circleId,
      toMemberId: maya.memberId,
    });

    mockCurrentUser.mockResolvedValue(maya.user);
    await t.mutation(api.circles.renameCircle, { circleId, name: "Renamed Trip" });

    mockCurrentUser.mockResolvedValue(owner);
    await expect(
      t.mutation(api.circles.renameCircle, { circleId, name: "Blocked" }),
    ).rejects.toThrow("Only the owner can rename this circle");
  });
});
