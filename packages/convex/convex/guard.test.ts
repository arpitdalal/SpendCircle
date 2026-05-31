import { convexTest } from "convex-test";
import { describe, expect, it, vi } from "vitest";
import type { Doc, Id } from "./_generated/dataModel.js";
import type { MutationCtx } from "./_generated/server.js";
import schema from "./schema.js";

// `resolveCircleAccess` folds in `getCurrentUserOrNull`, which is backed by the
// Better Auth component and cannot run under convex-test. We stub just that auth
// seam so the rest of the module — the missing≡inaccessible collapse and the
// capability derivation — is exercised against a real simulated db.
const { mockCurrentUser } = vi.hoisted(() => ({ mockCurrentUser: vi.fn() }));
vi.mock("./auth.js", () => ({ getCurrentUserOrNull: mockCurrentUser }));

const { getActiveMembership, requireCircleAccess, resolveCircleAccess } = await import(
  "./guard.js"
);

const modules = import.meta.glob("./**/*.ts");

interface Seed {
  user: Doc<"users">;
  circleId: Id<"circles">;
  ownerMemberId: Id<"members">;
}

/** Seeds a User who owns an active Circle. `role`/`status`/circle `status` are tunable. */
async function seed(
  ctx: MutationCtx,
  opts: { role?: "owner" | "member"; status?: "active" | "removed"; archived?: boolean } = {},
): Promise<Seed> {
  const now = Date.now();
  const userId = await ctx.db.insert("users", {
    email: "ada@example.com",
    displayName: "Ada Lovelace",
    acceptedTermsVersion: "2026-05-01",
    acceptedPrivacyVersion: "2026-05-01",
    acceptedAt: now,
    analyticsOptOut: false,
    createdAt: now,
  });
  const circleId = await ctx.db.insert("circles", {
    name: "Personal",
    kind: "personal",
    currency: "USD",
    color: "blue",
    mark: "P",
    ownerUserId: userId,
    status: opts.archived ? "archived" : "active",
    currencyLocked: false,
    createdAt: now,
  });
  const ownerMemberId = await ctx.db.insert("members", {
    circleId,
    userId,
    role: opts.role ?? "owner",
    status: opts.status ?? "active",
    displayName: "Ada Lovelace",
    joinedAt: now,
  });
  const user = await ctx.db.get(userId);
  if (!user) {
    throw new Error("seed failed");
  }
  return { user, circleId, ownerMemberId };
}

describe("getActiveMembership", () => {
  it("returns the membership when active, null when removed or absent", async () => {
    const t = convexTest(schema, modules);
    const { user, circleId } = await t.run((ctx) => seed(ctx, { status: "active" }));

    const active = await t.run((ctx) => getActiveMembership(ctx, circleId, user._id));
    expect(active?.role).toBe("owner");

    // A removed membership reads as no access.
    await t.run(async (ctx) => {
      const m = await ctx.db
        .query("members")
        .withIndex("by_circle_and_user", (q) => q.eq("circleId", circleId).eq("userId", user._id))
        .unique();
      if (m) {
        await ctx.db.patch(m._id, { status: "removed" });
      }
    });
    const removed = await t.run((ctx) => getActiveMembership(ctx, circleId, user._id));
    expect(removed).toBeNull();

    const stranger = "k0000000000000000000000000000000" as Id<"users">;
    const none = await t.run((ctx) => getActiveMembership(ctx, circleId, stranger));
    expect(none).toBeNull();
  });
});

describe("resolveCircleAccess", () => {
  it("returns null for an unauthenticated caller", async () => {
    const t = convexTest(schema, modules);
    const { circleId } = await t.run((ctx) => seed(ctx));
    mockCurrentUser.mockResolvedValue(null);

    const access = await t.run((ctx) => resolveCircleAccess(ctx, circleId));
    expect(access).toBeNull();
  });

  it("returns null when the Circle is missing (indistinguishable from inaccessible)", async () => {
    const t = convexTest(schema, modules);
    const { user } = await t.run((ctx) => seed(ctx));
    mockCurrentUser.mockResolvedValue(user);
    const ghost = "k0000000000000000000000000000000" as Id<"circles">;

    const access = await t.run((ctx) => resolveCircleAccess(ctx, ghost));
    expect(access).toBeNull();
  });

  it("returns null when the caller is not an active member", async () => {
    const t = convexTest(schema, modules);
    const { user, circleId } = await t.run((ctx) => seed(ctx, { status: "removed" }));
    mockCurrentUser.mockResolvedValue(user);

    const access = await t.run((ctx) => resolveCircleAccess(ctx, circleId));
    expect(access).toBeNull();
  });

  // The AuthorizedCircle carries a method (assertWritable), which is not a
  // serializable Convex value, so capabilities are asserted INSIDE t.run and only
  // primitives are returned.
  it("derives owner + writable capabilities for an active Circle's owner", async () => {
    const t = convexTest(schema, modules);
    const { user, circleId } = await t.run((ctx) => seed(ctx, { role: "owner" }));
    mockCurrentUser.mockResolvedValue(user);

    const result = await t.run(async (ctx) => {
      const access = await resolveCircleAccess(ctx, circleId);
      let threw = false;
      try {
        access?.assertWritable();
      } catch {
        threw = true;
      }
      return {
        found: access !== null,
        isOwner: access?.isOwner,
        isWritable: access?.isWritable,
        threw,
      };
    });
    expect(result).toEqual({ found: true, isOwner: true, isWritable: true, threw: false });
  });

  it("derives non-owner for a regular member", async () => {
    const t = convexTest(schema, modules);
    const { user, circleId } = await t.run((ctx) => seed(ctx, { role: "member" }));
    mockCurrentUser.mockResolvedValue(user);

    const isOwner = await t.run(async (ctx) => {
      const access = await resolveCircleAccess(ctx, circleId);
      return access?.isOwner ?? null;
    });
    expect(isOwner).toBe(false);
  });

  it("marks an archived Circle read-only and makes assertWritable throw", async () => {
    const t = convexTest(schema, modules);
    const { user, circleId } = await t.run((ctx) => seed(ctx, { archived: true }));
    mockCurrentUser.mockResolvedValue(user);

    const result = await t.run(async (ctx) => {
      const access = await resolveCircleAccess(ctx, circleId);
      let message: string | null = null;
      try {
        access?.assertWritable();
      } catch (error) {
        message = (error as Error).message;
      }
      return { isWritable: access?.isWritable, message };
    });
    expect(result.isWritable).toBe(false);
    expect(result.message).toBe("Circle is archived");
  });
});

describe("requireCircleAccess", () => {
  it("throws a generic 'Circle not found' when there is no access", async () => {
    const t = convexTest(schema, modules);
    const { circleId } = await t.run((ctx) => seed(ctx));
    mockCurrentUser.mockResolvedValue(null);

    await expect(t.run((ctx) => requireCircleAccess(ctx, circleId))).rejects.toThrow(
      "Circle not found",
    );
  });

  it("returns the AuthorizedCircle when access resolves", async () => {
    const t = convexTest(schema, modules);
    const { user, circleId } = await t.run((ctx) => seed(ctx));
    mockCurrentUser.mockResolvedValue(user);

    const result = await t.run(async (ctx) => {
      const access = await requireCircleAccess(ctx, circleId);
      return { circleId: access.circle._id, userId: access.membership.userId };
    });
    expect(result.circleId).toBe(circleId);
    expect(result.userId).toBe(user._id);
  });
});
