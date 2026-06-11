import { convexTest } from "convex-test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api.js";
import schema from "./schema.js";
import { addMember, makeCategory, seedCircle, seedFixture, seedTransaction } from "./test/seed.js";

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

      const categories = await ctx.db
        .query("categories")
        .withIndex("by_circle_and_type", (q) => q.eq("circleId", circleId).eq("type", "expense"))
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
        .withIndex("by_circle_and_type", (q) => q.eq("circleId", circleId).eq("type", "expense"))
        .collect();
      expect(categories.map((category) => category.name).sort()).toContain("Rent");
      expect(categories.map((category) => category.name).sort()).not.toContain("Mortgage");
      expect((await ctx.db.get(circleId))?.setupAnswers).toEqual({
        purpose: "residence",
        residenceType: "leased",
      });
    });
  });
});
