import { convexTest } from "convex-test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api.js";
import type { Doc, Id } from "./_generated/dataModel.js";
import type { MutationCtx } from "./_generated/server.js";
import schema from "./schema.js";

// createCategory/listCategories resolve access through guard.ts, which folds in
// `getCurrentUserOrNull` — backed by Better Auth and unrunnable under
// convex-test. We stub just that seam (as guard.test.ts does) and exercise the
// real handlers, db, indexes, and history writes against the simulated backend.
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
    createdAt: now,
  });
  const user = await ctx.db.get(userId);
  if (!user) {
    throw new Error("seed failed");
  }
  return user;
}

interface Seed {
  owner: Doc<"users">;
  circleId: Id<"circles">;
}

/** Seeds an active regular Circle with an owner Member. */
async function seedCircle(
  ctx: MutationCtx,
  opts: { archived?: boolean; kind?: "personal" | "regular" } = {},
): Promise<Seed> {
  const now = Date.now();
  const owner = await makeUser(ctx, "owner@example.com", "Olive Owner");
  const circleId = await ctx.db.insert("circles", {
    name: "Trip",
    kind: opts.kind ?? "regular",
    currency: "USD",
    color: "blue",
    mark: "T",
    ownerUserId: owner._id,
    status: opts.archived ? "archived" : "active",
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

/** Adds a Member (active or removed) to a Circle and returns the User. */
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
    joinedAt: Date.now(),
    ...(status === "removed" ? { removedAt: Date.now() } : {}),
  });
  return user;
}

const EXPENSE = { name: "Groceries", type: "expense", color: "green" } as const;

describe("createCategory — happy path", () => {
  it("persists an active expense category with nameLower, creator, and a create event", async () => {
    const t = convexTest(schema, modules);
    const { owner, circleId } = await t.run((ctx) => seedCircle(ctx));
    mockCurrentUser.mockResolvedValue(owner);

    const categoryId = await t.mutation(api.categories.createCategory, { circleId, ...EXPENSE });

    await t.run(async (ctx) => {
      const category = await ctx.db.get(categoryId);
      expect(category?.name).toBe("Groceries");
      expect(category?.nameLower).toBe("groceries");
      expect(category?.type).toBe("expense");
      expect(category?.color).toBe("green");
      expect(category?.status).toBe("active");
      expect(category?.creatorUserId).toBe(owner._id);
    });
  });

  it("records the create event with a formatted color label and no raw ids", async () => {
    const t = convexTest(schema, modules);
    const { owner, circleId } = await t.run((ctx) => seedCircle(ctx));
    mockCurrentUser.mockResolvedValue(owner);

    const categoryId = await t.mutation(api.categories.createCategory, { circleId, ...EXPENSE });

    await t.run(async (ctx) => {
      const events = await ctx.db
        .query("histories")
        .withIndex("by_entity", (q) => q.eq("entityId", categoryId))
        .collect();
      expect(events).toHaveLength(1);
      const event = events[0];
      expect(event?.action).toBe("created");
      expect(event?.actorMemberId).toBeTruthy();
      expect(event?.changes).toEqual([
        { field: "name", to: "Groceries" },
        { field: "color", to: "Green" }, // formatted label, not "green" id
        { field: "type", to: "expense" },
      ]);
      // No raw category/user id leaks into the frozen change text.
      for (const change of event?.changes ?? []) {
        expect(change.to).not.toBe(categoryId);
        expect(change.to).not.toBe(owner._id);
      }
    });
  });

  it("allows creating both an Expense and an Income category", async () => {
    const t = convexTest(schema, modules);
    const { owner, circleId } = await t.run((ctx) => seedCircle(ctx));
    mockCurrentUser.mockResolvedValue(owner);

    await t.mutation(api.categories.createCategory, { circleId, ...EXPENSE });
    await t.mutation(api.categories.createCategory, {
      circleId,
      name: "Salary",
      type: "income",
      color: "teal",
    });

    const expenses = await t.query(api.categories.listCategories, { circleId, type: "expense" });
    const incomes = await t.query(api.categories.listCategories, { circleId, type: "income" });
    expect(expenses?.map((c) => c.name)).toEqual(["Groceries"]);
    expect(incomes?.map((c) => c.name)).toEqual(["Salary"]);
  });
});

describe("createCategory — uniqueness (case-insensitive, includes archived)", () => {
  it("rejects an exact duplicate name of the same type", async () => {
    const t = convexTest(schema, modules);
    const { owner, circleId } = await t.run((ctx) => seedCircle(ctx));
    mockCurrentUser.mockResolvedValue(owner);

    await t.mutation(api.categories.createCategory, { circleId, ...EXPENSE });
    await expect(
      t.mutation(api.categories.createCategory, { circleId, ...EXPENSE }),
    ).rejects.toThrow(/already exists/);
  });

  it("rejects a case-only difference of the same type", async () => {
    const t = convexTest(schema, modules);
    const { owner, circleId } = await t.run((ctx) => seedCircle(ctx));
    mockCurrentUser.mockResolvedValue(owner);

    await t.mutation(api.categories.createCategory, {
      circleId,
      name: "Gas",
      type: "expense",
      color: "amber",
    });
    await expect(
      t.mutation(api.categories.createCategory, {
        circleId,
        name: "gas",
        type: "expense",
        color: "red",
      }),
    ).rejects.toThrow(/already exists/);
  });

  it("allows the same name across different types", async () => {
    const t = convexTest(schema, modules);
    const { owner, circleId } = await t.run((ctx) => seedCircle(ctx));
    mockCurrentUser.mockResolvedValue(owner);

    await t.mutation(api.categories.createCategory, {
      circleId,
      name: "Gas",
      type: "expense",
      color: "amber",
    });
    // "Gas" Income is a different Category from "Gas" Expense.
    await expect(
      t.mutation(api.categories.createCategory, {
        circleId,
        name: "Gas",
        type: "income",
        color: "amber",
      }),
    ).resolves.toBeTruthy();
  });

  it("rejects a name already held by an ARCHIVED category of the same type", async () => {
    const t = convexTest(schema, modules);
    const { owner, circleId } = await t.run((ctx) => seedCircle(ctx));
    mockCurrentUser.mockResolvedValue(owner);

    // Seed an archived "Gas" directly (CAT-2 archives; here we plant the row).
    await t.run(async (ctx) => {
      await ctx.db.insert("categories", {
        circleId,
        name: "Gas",
        nameLower: "gas",
        type: "expense",
        color: "amber",
        creatorUserId: owner._id,
        status: "archived",
        createdAt: Date.now(),
        archivedAt: Date.now(),
      });
    });

    await expect(
      t.mutation(api.categories.createCategory, {
        circleId,
        name: "GAS",
        type: "expense",
        color: "red",
      }),
    ).rejects.toThrow(/already exists/);
  });

  it("isolates uniqueness per Circle (same name allowed in a different Circle)", async () => {
    const t = convexTest(schema, modules);
    const { owner, circleId } = await t.run((ctx) => seedCircle(ctx));
    const otherCircleId = await t.run(async (ctx) => {
      const circle = await ctx.db.insert("circles", {
        name: "Other",
        kind: "regular",
        currency: "USD",
        color: "blue",
        mark: "O",
        ownerUserId: owner._id,
        status: "active",
        currencyLocked: false,
        createdAt: Date.now(),
      });
      await ctx.db.insert("members", {
        circleId: circle,
        userId: owner._id,
        role: "owner",
        status: "active",
        displayName: owner.displayName,
        joinedAt: Date.now(),
      });
      return circle;
    });
    mockCurrentUser.mockResolvedValue(owner);

    await t.mutation(api.categories.createCategory, { circleId, ...EXPENSE });
    await expect(
      t.mutation(api.categories.createCategory, { circleId: otherCircleId, ...EXPENSE }),
    ).resolves.toBeTruthy();
  });
});

describe("createCategory — input edges", () => {
  it("rejects an empty name", async () => {
    const t = convexTest(schema, modules);
    const { owner, circleId } = await t.run((ctx) => seedCircle(ctx));
    mockCurrentUser.mockResolvedValue(owner);
    await expect(
      t.mutation(api.categories.createCategory, {
        circleId,
        name: "",
        type: "expense",
        color: "green",
      }),
    ).rejects.toThrow();
  });

  it("rejects a whitespace-only name", async () => {
    const t = convexTest(schema, modules);
    const { owner, circleId } = await t.run((ctx) => seedCircle(ctx));
    mockCurrentUser.mockResolvedValue(owner);
    await expect(
      t.mutation(api.categories.createCategory, {
        circleId,
        name: "   ",
        type: "expense",
        color: "green",
      }),
    ).rejects.toThrow();
  });

  it("rejects a name over the max length", async () => {
    const t = convexTest(schema, modules);
    const { owner, circleId } = await t.run((ctx) => seedCircle(ctx));
    mockCurrentUser.mockResolvedValue(owner);
    await expect(
      t.mutation(api.categories.createCategory, {
        circleId,
        name: "x".repeat(41),
        type: "expense",
        color: "green",
      }),
    ).rejects.toThrow();
  });

  it("rejects an invalid color", async () => {
    const t = convexTest(schema, modules);
    const { owner, circleId } = await t.run((ctx) => seedCircle(ctx));
    mockCurrentUser.mockResolvedValue(owner);
    await expect(
      t.mutation(api.categories.createCategory, {
        circleId,
        name: "Gas",
        type: "expense",
        color: "chartreuse",
      }),
    ).rejects.toThrow();
  });

  it("trims the name before storing", async () => {
    const t = convexTest(schema, modules);
    const { owner, circleId } = await t.run((ctx) => seedCircle(ctx));
    mockCurrentUser.mockResolvedValue(owner);
    const id = await t.mutation(api.categories.createCategory, {
      circleId,
      name: "  Dining  ",
      type: "expense",
      color: "green",
    });
    await t.run(async (ctx) => {
      const category = await ctx.db.get(id);
      expect(category?.name).toBe("Dining");
      expect(category?.nameLower).toBe("dining");
    });
  });
});

describe("createCategory — permission matrix", () => {
  it("allows the Owner", async () => {
    const t = convexTest(schema, modules);
    const { owner, circleId } = await t.run((ctx) => seedCircle(ctx));
    mockCurrentUser.mockResolvedValue(owner);
    await expect(
      t.mutation(api.categories.createCategory, { circleId, ...EXPENSE }),
    ).resolves.toBeTruthy();
  });

  it("allows a non-owner active Member", async () => {
    const t = convexTest(schema, modules);
    const { circleId } = await t.run((ctx) => seedCircle(ctx));
    const member = await t.run((ctx) => addMember(ctx, circleId, "m@example.com", "Maya Member"));
    mockCurrentUser.mockResolvedValue(member);
    const id = await t.mutation(api.categories.createCategory, { circleId, ...EXPENSE });
    await t.run(async (ctx) => {
      const category = await ctx.db.get(id);
      expect(category?.creatorUserId).toBe(member._id);
    });
  });

  it("denies a Removed Member", async () => {
    const t = convexTest(schema, modules);
    const { circleId } = await t.run((ctx) => seedCircle(ctx));
    const removed = await t.run((ctx) =>
      addMember(ctx, circleId, "r@example.com", "Rex Removed", "removed"),
    );
    mockCurrentUser.mockResolvedValue(removed);
    await expect(
      t.mutation(api.categories.createCategory, { circleId, ...EXPENSE }),
    ).rejects.toThrow("Circle not found");
  });

  it("denies a non-member User", async () => {
    const t = convexTest(schema, modules);
    const { circleId } = await t.run((ctx) => seedCircle(ctx));
    const stranger = await t.run((ctx) => makeUser(ctx, "s@example.com", "Sam Stranger"));
    mockCurrentUser.mockResolvedValue(stranger);
    await expect(
      t.mutation(api.categories.createCategory, { circleId, ...EXPENSE }),
    ).rejects.toThrow("Circle not found");
  });

  it("denies an unauthenticated caller", async () => {
    const t = convexTest(schema, modules);
    const { circleId } = await t.run((ctx) => seedCircle(ctx));
    mockCurrentUser.mockResolvedValue(null);
    await expect(
      t.mutation(api.categories.createCategory, { circleId, ...EXPENSE }),
    ).rejects.toThrow("Circle not found");
  });

  it("allows a Member in a Personal Circle", async () => {
    const t = convexTest(schema, modules);
    const { owner, circleId } = await t.run((ctx) => seedCircle(ctx, { kind: "personal" }));
    mockCurrentUser.mockResolvedValue(owner);
    await expect(
      t.mutation(api.categories.createCategory, { circleId, ...EXPENSE }),
    ).resolves.toBeTruthy();
  });
});

describe("createCategory — lifecycle edges", () => {
  it("denies creation in an archived Circle", async () => {
    const t = convexTest(schema, modules);
    const { owner, circleId } = await t.run((ctx) => seedCircle(ctx, { archived: true }));
    mockCurrentUser.mockResolvedValue(owner);
    await expect(
      t.mutation(api.categories.createCategory, { circleId, ...EXPENSE }),
    ).rejects.toThrow("Circle is archived");
  });
});

describe("listCategories", () => {
  it("returns active categories of a type, newest first, with creator identity", async () => {
    const t = convexTest(schema, modules);
    const { owner, circleId } = await t.run((ctx) => seedCircle(ctx));
    mockCurrentUser.mockResolvedValue(owner);

    await t.mutation(api.categories.createCategory, {
      circleId,
      name: "Gas",
      type: "expense",
      color: "amber",
    });
    await t.mutation(api.categories.createCategory, { circleId, ...EXPENSE });

    const result = await t.query(api.categories.listCategories, { circleId, type: "expense" });
    expect(result?.map((c) => c.name)).toEqual(["Groceries", "Gas"]); // newest first
    expect(result?.[0]?.creator.displayName).toBe("Olive Owner");
  });

  it("excludes archived categories by default and includes them when asked", async () => {
    const t = convexTest(schema, modules);
    const { owner, circleId } = await t.run((ctx) => seedCircle(ctx));
    mockCurrentUser.mockResolvedValue(owner);

    const id = await t.mutation(api.categories.createCategory, { circleId, ...EXPENSE });

    expect(
      (await t.query(api.categories.listCategories, { circleId, type: "expense" }))?.length,
    ).toBe(1);

    // Archive it (CAT-2 will own this mutation; here we flip the row directly).
    await t.run((ctx) => ctx.db.patch(id, { status: "archived", archivedAt: Date.now() }));

    // Live-update relevance: the default list flips to empty once archived.
    expect(
      (await t.query(api.categories.listCategories, { circleId, type: "expense" }))?.length,
    ).toBe(0);
    expect(
      (
        await t.query(api.categories.listCategories, {
          circleId,
          type: "expense",
          includeArchived: true,
        })
      )?.length,
    ).toBe(1);
  });

  it("returns null for an inaccessible Circle (anti-enumeration)", async () => {
    const t = convexTest(schema, modules);
    const { circleId } = await t.run((ctx) => seedCircle(ctx));
    const stranger = await t.run((ctx) => makeUser(ctx, "s@example.com", "Sam Stranger"));
    mockCurrentUser.mockResolvedValue(stranger);
    expect(await t.query(api.categories.listCategories, { circleId, type: "expense" })).toBeNull();
  });

  it("returns null for an unauthenticated caller", async () => {
    const t = convexTest(schema, modules);
    const { circleId } = await t.run((ctx) => seedCircle(ctx));
    mockCurrentUser.mockResolvedValue(null);
    expect(await t.query(api.categories.listCategories, { circleId, type: "expense" })).toBeNull();
  });
});
