import { convexTest } from "convex-test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api.js";
import { createUserWithPersonalCircle, setUserDisplayName, syncUserEmail } from "./model.js";
import schema from "./schema.js";

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

// Tests the bootstrap invariant directly through the db helper, independent of
// the Better Auth component wiring (which `onCreateUser` calls in production).
const modules = import.meta.glob("./**/*.ts");

beforeEach(() => {
  mockCurrentUser.mockReset();
});

describe("createUserWithPersonalCircle", () => {
  it("creates the User and an always-solo Personal Circle owned by them", async () => {
    const t = convexTest(schema, modules);

    const userId = await t.run((ctx) =>
      createUserWithPersonalCircle(ctx, {
        email: "ada@example.com",
        displayName: "Ada Lovelace",
      }),
    );

    await t.run(async (ctx) => {
      const user = await ctx.db.get(userId);
      expect(user?.email).toBe("ada@example.com");
      expect(user?.onboardingCompletedAt).toBeNull();

      const circles = await ctx.db.query("circles").collect();
      expect(circles).toHaveLength(1);
      expect(circles[0]?.kind).toBe("personal");
      expect(circles[0]?.name).toBe("Ada's Circle");
      expect(circles[0]?.mark).toBe("AC");
      expect(circles[0]?.color).toBe("iris");
      expect(circles[0]?.ownerUserId).toBe(userId);
      expect(circles[0]?.setupCompletedAt).toBeTypeOf("number");

      const members = await ctx.db.query("members").collect();
      expect(members).toHaveLength(1);
      expect(members[0]?.role).toBe("owner");
      expect(members[0]?.userId).toBe(userId);
    });
  });

  it("defaults to USD for an unsupported currency", async () => {
    const t = convexTest(schema, modules);
    await t.run((ctx) =>
      createUserWithPersonalCircle(ctx, {
        email: "grace@example.com",
        displayName: "Grace Hopper",
        currency: "XYZ",
      }),
    );
    await t.run(async (ctx) => {
      const circle = await ctx.db.query("circles").first();
      expect(circle?.currency).toBe("USD");
    });
  });

  it('names the Personal Circle "Personal Circle" with mark "PC" when the display name has no token', async () => {
    const t = convexTest(schema, modules);
    await t.run((ctx) =>
      createUserWithPersonalCircle(ctx, {
        email: "emoji@example.com",
        displayName: "🦊",
      }),
    );
    await t.run(async (ctx) => {
      const circle = await ctx.db.query("circles").first();
      expect(circle?.name).toBe("Personal Circle");
      expect(circle?.mark).toBe("PC");
    });
  });
});

describe("setUserDisplayName", () => {
  it("mirrors a new display name onto the User and active members, leaving removed members frozen", async () => {
    const t = convexTest(schema, modules);

    const userId = await t.run((ctx) =>
      createUserWithPersonalCircle(ctx, {
        email: "ada@example.com",
        displayName: "Ada Lovelace",
        image: "https://img/old.png",
      }),
    );

    const removedMemberId = await t.run(async (ctx) => {
      const now = Date.now();
      const activeCircle = await ctx.db.insert("circles", {
        name: "Team",
        kind: "regular",
        currency: "USD",
        color: "blue",
        mark: "T",
        ownerUserId: userId,
        status: "active",
        setupCompletedAt: now,
        currencyLocked: false,
        createdAt: now,
      });
      await ctx.db.insert("members", {
        circleId: activeCircle,
        userId,
        role: "member",
        status: "active",
        displayName: "Ada Lovelace",
        image: "https://img/old.png",
        joinedAt: now,
      });
      const removedCircle = await ctx.db.insert("circles", {
        name: "Old Club",
        kind: "regular",
        currency: "USD",
        color: "blue",
        mark: "O",
        ownerUserId: userId,
        status: "active",
        setupCompletedAt: now,
        currencyLocked: false,
        createdAt: now,
      });
      return await ctx.db.insert("members", {
        circleId: removedCircle,
        userId,
        role: "member",
        status: "removed",
        displayName: "Ada Lovelace",
        image: "https://img/old.png",
        joinedAt: now,
        removedAt: now,
      });
    });

    await t.run((ctx) => setUserDisplayName(ctx, userId, "Ada King"));

    await t.run(async (ctx) => {
      const user = await ctx.db.get(userId);
      expect(user?.displayName).toBe("Ada King");
      expect(user?.image).toBe("https://img/old.png");

      const members = await ctx.db
        .query("members")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect();
      const active = members.filter((m) => m.status === "active");
      expect(active).toHaveLength(2);
      for (const member of active) {
        expect(member.displayName).toBe("Ada King");
        expect(member.image).toBe("https://img/old.png");
      }

      const removed = await ctx.db.get(removedMemberId);
      expect(removed?.displayName).toBe("Ada Lovelace");
    });
  });

  it("no-ops for a User that has not been bootstrapped", async () => {
    const t = convexTest(schema, modules);
    const missing =
      "k0000000000000000000000000000000" as import("./_generated/dataModel.js").Id<"users">;
    const completed = await t.run(async (ctx) => {
      await setUserDisplayName(ctx, missing, "Nobody");
      return "ok";
    });
    expect(completed).toBe("ok");
  });
});

describe("syncUserEmail", () => {
  it("patches only the User email", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run((ctx) =>
      createUserWithPersonalCircle(ctx, {
        email: "ada@example.com",
        displayName: "Ada Lovelace",
        image: "https://img/old.png",
      }),
    );

    await t.run((ctx) => syncUserEmail(ctx, userId, "ada.king@example.com"));

    await t.run(async (ctx) => {
      const user = await ctx.db.get(userId);
      expect(user?.email).toBe("ada.king@example.com");
      expect(user?.displayName).toBe("Ada Lovelace");
      expect(user?.image).toBe("https://img/old.png");
    });
  });
});

describe("completeOnboarding", () => {
  it("marks onboarding complete, reconciles the Personal Circle, and records no history", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run((ctx) =>
      createUserWithPersonalCircle(ctx, {
        email: "ada@example.com",
        displayName: "Ada Lovelace",
      }),
    );

    await t.run(async (ctx) => {
      const user = await ctx.db.get(userId);
      if (!user) {
        throw new Error("missing user");
      }
      mockCurrentUser.mockResolvedValue(user);
    });

    await t.mutation(api.users.completeOnboarding, { displayName: "Ada King" });

    await t.run(async (ctx) => {
      const user = await ctx.db.get(userId);
      expect(user?.displayName).toBe("Ada King");
      expect(user?.onboardingCompletedAt).toBeTypeOf("number");

      const circle = await ctx.db.query("circles").first();
      expect(circle?.name).toBe("Ada's Circle");
      expect(circle?.mark).toBe("AC");

      const ownerMembership = await ctx.db
        .query("members")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .first();
      expect(ownerMembership?.displayName).toBe("Ada King");

      const history = await ctx.db.query("histories").collect();
      expect(history).toHaveLength(0);
    });
  });

  it("reconciles the Personal Circle even when the user owns other Circles", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run((ctx) =>
      createUserWithPersonalCircle(ctx, {
        email: "ada@example.com",
        displayName: "Ada Lovelace",
      }),
    );

    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("circles", {
        name: "Trip",
        kind: "regular",
        currency: "USD",
        color: "blue",
        mark: "T",
        ownerUserId: userId,
        status: "active",
        setupCompletedAt: now,
        currencyLocked: false,
        createdAt: now,
      });
    });

    await t.run(async (ctx) => {
      const user = await ctx.db.get(userId);
      if (!user) {
        throw new Error("missing user");
      }
      mockCurrentUser.mockResolvedValue(user);
    });

    await t.mutation(api.users.completeOnboarding, { displayName: "Ada King" });

    await t.run(async (ctx) => {
      const personal = await ctx.db
        .query("circles")
        .withIndex("by_owner_and_kind", (q) => q.eq("ownerUserId", userId).eq("kind", "personal"))
        .first();
      expect(personal?.name).toBe("Ada's Circle");
    });
  });

  it("skips the Personal Circle rename when the confirmed name matches", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run((ctx) =>
      createUserWithPersonalCircle(ctx, {
        email: "madonna@example.com",
        displayName: "Madonna",
      }),
    );

    await t.run(async (ctx) => {
      const user = await ctx.db.get(userId);
      if (!user) {
        throw new Error("missing user");
      }
      mockCurrentUser.mockResolvedValue(user);
    });

    await t.mutation(api.users.completeOnboarding, { displayName: "Madonna" });

    await t.run(async (ctx) => {
      const circle = await ctx.db.query("circles").first();
      expect(circle?.name).toBe("Madonna's Circle");
    });
  });

  it("rejects a second completion", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run((ctx) =>
      createUserWithPersonalCircle(ctx, {
        email: "ada@example.com",
        displayName: "Ada Lovelace",
      }),
    );

    await t.run(async (ctx) => {
      const user = await ctx.db.get(userId);
      if (!user) {
        throw new Error("missing user");
      }
      mockCurrentUser.mockResolvedValue(user);
    });

    await t.mutation(api.users.completeOnboarding, { displayName: "Ada Lovelace" });

    await t.run(async (ctx) => {
      const user = await ctx.db.get(userId);
      if (!user) {
        throw new Error("missing user");
      }
      mockCurrentUser.mockResolvedValue(user);
    });

    await expect(
      t.mutation(api.users.completeOnboarding, { displayName: "Ada Lovelace" }),
    ).rejects.toThrow(/already completed/i);
  });
});

describe("updateProfile", () => {
  it("updates the display name on active memberships and reconciles the Personal Circle", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run(async (ctx) => {
      const id = await createUserWithPersonalCircle(ctx, {
        email: "ada@example.com",
        displayName: "Ada Lovelace",
      });
      const user = await ctx.db.get(id);
      if (!user) {
        throw new Error("missing user");
      }
      await ctx.db.patch(id, { onboardingCompletedAt: user.createdAt });
      return id;
    });

    const removedMemberId = await t.run(async (ctx) => {
      const now = Date.now();
      const removedCircle = await ctx.db.insert("circles", {
        name: "Old Club",
        kind: "regular",
        currency: "USD",
        color: "blue",
        mark: "O",
        ownerUserId: userId,
        status: "active",
        setupCompletedAt: now,
        currencyLocked: false,
        createdAt: now,
      });
      return await ctx.db.insert("members", {
        circleId: removedCircle,
        userId,
        role: "member",
        status: "removed",
        displayName: "Ada Lovelace",
        joinedAt: now,
        removedAt: now,
      });
    });

    await t.run(async (ctx) => {
      const user = await ctx.db.get(userId);
      if (!user) {
        throw new Error("missing user");
      }
      mockCurrentUser.mockResolvedValue(user);
    });

    await t.mutation(api.users.updateProfile, { displayName: "Bob Builder" });

    await t.run(async (ctx) => {
      const user = await ctx.db.get(userId);
      expect(user?.displayName).toBe("Bob Builder");

      const circle = await ctx.db.query("circles").first();
      expect(circle?.name).toBe("Bob's Circle");
      expect(circle?.mark).toBe("BC");

      const ownerMembership = await ctx.db
        .query("members")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .filter((q) => q.eq(q.field("status"), "active"))
        .first();
      expect(ownerMembership?.displayName).toBe("Bob Builder");

      const removed = await ctx.db.get(removedMemberId);
      expect(removed?.displayName).toBe("Ada Lovelace");

      const history = await ctx.db.query("histories").collect();
      expect(history).toHaveLength(0);
    });
  });
});
