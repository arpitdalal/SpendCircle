import { NEW_CIRCLE_COLOR } from "@spend-circle/domain";
import { convexTest } from "convex-test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api.js";
import schema from "./schema.js";
import {
  addMember,
  makeCategory,
  makeUser,
  seedCircle,
  seedFixture,
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

beforeEach(() => {
  mockCurrentUser.mockReset();
});

describe("completeCircleSetup", () => {
  it("lets the owner persist setup answers and create starter categories", async () => {
    const t = convexTest(schema, modules);
    const { owner, circleId } = await t.run((ctx) => seedCircle(ctx));
    mockCurrentUser.mockResolvedValue(owner);

    const result = await t.mutation(api.circles.completeCircleSetup, {
      circleId,
      answers: { purpose: "residence", residenceType: "leased" },
    });

    expect(result.createdCategoryIds).toHaveLength(10);
    await t.run(async (ctx) => {
      const circle = await ctx.db.get(circleId);
      expect(circle?.currency).toBe("USD");
      expect(circle?.setupAnswers).toEqual({ purpose: "residence", residenceType: "leased" });
      expect(circle?.setupCompletedAt).toBeTypeOf("number");

      const categories = await ctx.db
        .query("categories")
        .withIndex("by_circle_type_createdAt", (q) =>
          q.eq("circleId", circleId).eq("type", "expense"),
        )
        .collect();
      expect(categories.map((category) => category.name).sort()).toEqual([
        "Dining",
        "Education",
        "Entertainment",
        "Groceries",
        "Health",
        "Rent",
        "Shopping",
        "Transport",
        "Travel",
        "Utilities",
      ]);

      const circleEvents = await ctx.db
        .query("histories")
        .withIndex("by_entity", (q) => q.eq("entityId", circleId))
        .collect();
      expect(circleEvents).toHaveLength(1);
      expect(circleEvents[0]?.action).toBe("setup_completed");
      expect(circleEvents[0]?.changes).toEqual([
        { field: "setup.purpose", to: "residence" },
        { field: "setup.residenceType", to: "leased" },
      ]);

      const rent = categories.find((category) => category.name === "Rent");
      expect(rent).toBeTruthy();
      const rentEvents = rent
        ? await ctx.db
            .query("histories")
            .withIndex("by_entity", (q) => q.eq("entityId", rent._id))
            .collect()
        : [];
      expect(rentEvents[0]?.changes).toContainEqual({ field: "name", to: "Rent" });
    });
  });

  it("seeds the nine shared starters when the owner finishes with default answers", async () => {
    const t = convexTest(schema, modules);
    const { owner, circleId } = await t.run((ctx) => seedCircle(ctx));
    mockCurrentUser.mockResolvedValue(owner);

    const result = await t.mutation(api.circles.completeCircleSetup, {
      circleId,
      answers: {},
    });

    expect(result.createdCategoryIds).toHaveLength(9);
    await t.run(async (ctx) => {
      const circle = await ctx.db.get(circleId);
      expect(circle?.setupAnswers).toEqual({});
      expect(circle?.setupCompletedAt).toBeTypeOf("number");

      const categories = await ctx.db
        .query("categories")
        .withIndex("by_circle_type_createdAt", (q) =>
          q.eq("circleId", circleId).eq("type", "expense"),
        )
        .collect();
      expect(categories.map((category) => category.name).sort()).toEqual([
        "Dining",
        "Education",
        "Entertainment",
        "Groceries",
        "Health",
        "Shopping",
        "Transport",
        "Travel",
        "Utilities",
      ]);

      const circleEvents = await ctx.db
        .query("histories")
        .withIndex("by_entity", (q) => q.eq("entityId", circleId))
        .collect();
      expect(circleEvents).toHaveLength(1);
      expect(circleEvents[0]?.action).toBe("setup_completed");
      expect(circleEvents[0]?.changes).toEqual([]);
    });
  });

  it("rejects a non-owner member", async () => {
    const t = convexTest(schema, modules);
    const { circleId } = await t.run((ctx) => seedCircle(ctx));
    const member = await t.run((ctx) =>
      addMember(ctx, circleId, "member@example.com", "Maya Member"),
    );
    mockCurrentUser.mockResolvedValue(member.user);

    await expect(
      t.mutation(api.circles.completeCircleSetup, {
        circleId,
        answers: { purpose: "trip" },
      }),
    ).rejects.toThrow(/Only the owner/);
  });

  it("rejects an archived circle before writing answers or categories", async () => {
    const t = convexTest(schema, modules);
    const { owner, circleId } = await t.run((ctx) => seedCircle(ctx, { archived: true }));
    mockCurrentUser.mockResolvedValue(owner);

    await expect(
      t.mutation(api.circles.completeCircleSetup, {
        circleId,
        answers: { purpose: "residence", residenceType: "owned" },
      }),
    ).rejects.toThrow(/archived/);

    await t.run(async (ctx) => {
      expect((await ctx.db.get(circleId))?.setupAnswers).toBeUndefined();
      expect((await ctx.db.get(circleId))?.setupCompletedAt).toBeNull();
      expect(
        await ctx.db
          .query("categories")
          .withIndex("by_circle", (q) => q.eq("circleId", circleId))
          .collect(),
      ).toHaveLength(0);
    });
  });

  it("skips starter categories that collide with existing names", async () => {
    const t = convexTest(schema, modules);
    const { owner, circleId } = await t.run(async (ctx) => {
      const seed = await seedCircle(ctx);
      await makeCategory(ctx, seed.circleId, {
        name: "groceries",
        type: "expense",
        creatorUserId: seed.owner._id,
      });
      return seed;
    });
    mockCurrentUser.mockResolvedValue(owner);

    const result = await t.mutation(api.circles.completeCircleSetup, {
      circleId,
      answers: { purpose: "trip" },
    });

    expect(result.createdCategoryIds).toHaveLength(8);
    await t.run(async (ctx) => {
      const groceries = await ctx.db
        .query("categories")
        .withIndex("by_circle_type_name", (q) =>
          q.eq("circleId", circleId).eq("type", "expense").eq("nameLower", "groceries"),
        )
        .collect();
      expect(groceries).toHaveLength(1);
    });
  });

  it("still derives non-colliding categories after the currency is locked", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run(async (ctx) => {
      const seeded = await seedFixture(ctx);
      await seedTransaction(ctx, seeded);
      await ctx.db.patch(seeded.circleId, { currencyLocked: true });
      return seeded;
    });
    mockCurrentUser.mockResolvedValue(f.owner);

    const result = await t.mutation(api.circles.completeCircleSetup, {
      circleId: f.circleId,
      answers: { purpose: "residence", residenceType: "owned" },
    });

    expect(result.createdCategoryIds).toHaveLength(8);
    await t.run(async (ctx) => {
      expect((await ctx.db.get(f.circleId))?.currency).toBe("USD");
      const mortgage = await ctx.db
        .query("categories")
        .withIndex("by_circle_type_name", (q) =>
          q.eq("circleId", f.circleId).eq("type", "expense").eq("nameLower", "mortgage"),
        )
        .first();
      expect(mortgage?.name).toBe("Mortgage");
    });
  });

  it("rejects reruns so setup-derived category sets cannot be mixed", async () => {
    const t = convexTest(schema, modules);
    const { owner, circleId } = await t.run((ctx) => seedCircle(ctx));
    mockCurrentUser.mockResolvedValue(owner);

    await t.mutation(api.circles.completeCircleSetup, {
      circleId,
      answers: { purpose: "residence", residenceType: "leased" },
    });

    await expect(
      t.mutation(api.circles.completeCircleSetup, {
        circleId,
        answers: { purpose: "residence", residenceType: "owned" },
      }),
    ).rejects.toThrow(/already complete/);

    await t.run(async (ctx) => {
      const categories = await ctx.db
        .query("categories")
        .withIndex("by_circle_type_createdAt", (q) =>
          q.eq("circleId", circleId).eq("type", "expense"),
        )
        .collect();
      expect(categories.map((category) => category.name).sort()).toContain("Rent");
      expect(categories.map((category) => category.name).sort()).not.toContain("Mortgage");
      expect((await ctx.db.get(circleId))?.setupAnswers).toEqual({
        purpose: "residence",
        residenceType: "leased",
      });
      expect((await ctx.db.get(circleId))?.setupCompletedAt).toBeTypeOf("number");
    });
  });
});

describe("updateCircleSettings", () => {
  it("lets the owner change color and setup answers in one settings_changed event", async () => {
    const t = convexTest(schema, modules);
    const { owner, circleId } = await t.run(async (ctx) => {
      const seed = await seedCircle(ctx);
      const now = Date.now();
      await ctx.db.patch(seed.circleId, {
        setupAnswers: { purpose: "trip" },
        setupCompletedAt: now,
      });
      return seed;
    });
    mockCurrentUser.mockResolvedValue(owner);

    await t.mutation(api.circles.updateCircleSettings, {
      circleId,
      color: "green",
      setupAnswers: { purpose: "residence", residenceType: "leased" },
    });

    await t.run(async (ctx) => {
      const circle = await ctx.db.get(circleId);
      expect(circle?.color).toBe("green");
      expect(circle?.mark).toBe("T");
      expect(circle?.setupAnswers).toEqual({ purpose: "residence", residenceType: "leased" });

      const events = await ctx.db
        .query("histories")
        .withIndex("by_entity", (q) => q.eq("entityId", circleId))
        .collect();
      expect(events).toHaveLength(1);
      expect(events[0]?.action).toBe("settings_changed");
      expect(events[0]?.changes).toEqual([
        { field: "color", from: "Blue", to: "Green" },
        { field: "setup.purpose", from: "trip", to: "residence" },
        { field: "setup.residenceType", to: "leased" },
      ]);
    });
  });

  it("rejects a non-owner member", async () => {
    const t = convexTest(schema, modules);
    const { circleId } = await t.run((ctx) => seedCircle(ctx));
    const member = await t.run((ctx) =>
      addMember(ctx, circleId, "member@example.com", "Maya Member"),
    );
    mockCurrentUser.mockResolvedValue(member.user);

    await expect(
      t.mutation(api.circles.updateCircleSettings, { circleId, color: "red" }),
    ).rejects.toThrow(/Only the owner/);
  });

  it("rejects a removed member", async () => {
    const t = convexTest(schema, modules);
    const { circleId } = await t.run((ctx) => seedCircle(ctx));
    const removed = await t.run((ctx) =>
      addMember(ctx, circleId, "gone@example.com", "Gone Member", "removed"),
    );
    mockCurrentUser.mockResolvedValue(removed.user);

    await expect(
      t.mutation(api.circles.updateCircleSettings, { circleId, color: "red" }),
    ).rejects.toThrow();
  });

  it("rejects an archived circle", async () => {
    const t = convexTest(schema, modules);
    const { owner, circleId } = await t.run((ctx) => seedCircle(ctx, { archived: true }));
    mockCurrentUser.mockResolvedValue(owner);

    await expect(
      t.mutation(api.circles.updateCircleSettings, { circleId, color: "red" }),
    ).rejects.toThrow(/archived/);

    await t.run(async (ctx) => {
      expect((await ctx.db.get(circleId))?.color).toBe("blue");
    });
  });

  it("rejects an invalid color id", async () => {
    const t = convexTest(schema, modules);
    const { owner, circleId } = await t.run((ctx) => seedCircle(ctx));
    mockCurrentUser.mockResolvedValue(owner);

    await expect(
      t.mutation(api.circles.updateCircleSettings, { circleId, color: "chartreuse" }),
    ).rejects.toThrow();
  });

  it("rejects setup-answer edits before setup is complete, but still allows color", async () => {
    const t = convexTest(schema, modules);
    // seedCircle leaves setup incomplete — setupCompletedAt is null.
    const { owner, circleId } = await t.run((ctx) => seedCircle(ctx));
    mockCurrentUser.mockResolvedValue(owner);

    // The first write of setup answers must go through completeCircleSetup (one-shot
    // starter seeding); this entry point must not flip the Circle to "setup done".
    await expect(
      t.mutation(api.circles.updateCircleSettings, {
        circleId,
        setupAnswers: { purpose: "trip" },
      }),
    ).rejects.toThrow(/Complete circle setup/);

    // A color-only edit is unaffected by the incomplete-setup state.
    await t.mutation(api.circles.updateCircleSettings, { circleId, color: "green" });

    await t.run(async (ctx) => {
      const circle = await ctx.db.get(circleId);
      expect(circle?.setupAnswers).toBeUndefined();
      expect(circle?.setupCompletedAt).toBeNull();
      expect(circle?.color).toBe("green");
    });
  });

  it("lets a completed Circle with empty answers edit setup answers later", async () => {
    const t = convexTest(schema, modules);
    const { owner, circleId } = await t.run((ctx) => seedCircle(ctx));
    mockCurrentUser.mockResolvedValue(owner);

    await t.mutation(api.circles.completeCircleSetup, { circleId, answers: {} });

    await t.mutation(api.circles.updateCircleSettings, {
      circleId,
      setupAnswers: { purpose: "trip" },
    });

    await t.run(async (ctx) => {
      const circle = await ctx.db.get(circleId);
      expect(circle?.setupAnswers).toEqual({ purpose: "trip" });
      expect(circle?.setupCompletedAt).toBeTypeOf("number");
    });
  });

  it("no-ops when nothing changed", async () => {
    const t = convexTest(schema, modules);
    const { owner, circleId } = await t.run(async (ctx) => {
      const seed = await seedCircle(ctx);
      const now = Date.now();
      await ctx.db.patch(seed.circleId, {
        setupAnswers: { purpose: "trip" },
        setupCompletedAt: now,
      });
      return seed;
    });
    mockCurrentUser.mockResolvedValue(owner);

    await t.mutation(api.circles.updateCircleSettings, {
      circleId,
      color: "blue",
      setupAnswers: { purpose: "trip" },
    });

    await t.run(async (ctx) => {
      const events = await ctx.db
        .query("histories")
        .withIndex("by_entity", (q) => q.eq("entityId", circleId))
        .collect();
      expect(events).toHaveLength(0);
    });
  });

  it("leaves existing categories untouched when setup answers change", async () => {
    const t = convexTest(schema, modules);
    const { owner, circleId } = await t.run(async (ctx) => {
      const seed = await seedCircle(ctx);
      const now = Date.now();
      await ctx.db.patch(seed.circleId, {
        setupAnswers: { purpose: "residence", residenceType: "leased" },
        setupCompletedAt: now,
      });
      await makeCategory(ctx, seed.circleId, {
        name: "Rent",
        type: "expense",
        creatorUserId: seed.owner._id,
      });
      return seed;
    });
    mockCurrentUser.mockResolvedValue(owner);

    await t.mutation(api.circles.updateCircleSettings, {
      circleId,
      setupAnswers: { purpose: "residence", residenceType: "owned" },
    });

    await t.run(async (ctx) => {
      const categories = await ctx.db
        .query("categories")
        .withIndex("by_circle", (q) => q.eq("circleId", circleId))
        .collect();
      expect(categories).toHaveLength(1);
      expect(categories[0]?.name).toBe("Rent");
    });
  });
});

describe("createCircle", () => {
  it("assigns the reserved iris create-time color", async () => {
    const t = convexTest(schema, modules);
    const owner = await t.run((ctx) => makeUser(ctx, "creator@example.com", "Casey Creator"));
    mockCurrentUser.mockResolvedValue(owner);

    const circleId = await t.mutation(api.circles.createCircle, {
      name: "New Trip",
      currency: "USD",
      color: NEW_CIRCLE_COLOR.id,
      mark: "NT",
    });

    await t.run(async (ctx) => {
      const circle = await ctx.db.get(circleId);
      expect(circle?.color).toBe(NEW_CIRCLE_COLOR.id);
    });
  });

  it("rejects a palette color id on create", async () => {
    const t = convexTest(schema, modules);
    const owner = await t.run((ctx) => makeUser(ctx, "creator@example.com", "Casey Creator"));
    mockCurrentUser.mockResolvedValue(owner);

    await expect(
      t.mutation(api.circles.createCircle, {
        name: "New Trip",
        currency: "USD",
        color: "teal",
        mark: "NT",
      }),
    ).rejects.toThrow();
  });
});
