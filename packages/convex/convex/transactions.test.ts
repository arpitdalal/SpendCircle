import { formatMinorUnits } from "@spend-circle/domain";
import { convexTest } from "convex-test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api.js";
import type { Doc, Id } from "./_generated/dataModel.js";
import type { MutationCtx } from "./_generated/server.js";
import schema from "./schema.js";

// createTransaction/listTransactions resolve access through guard.ts, which folds
// in `getCurrentUserOrNull` — backed by Better Auth and unrunnable under
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
  ownerMemberId: Id<"members">;
  circleId: Id<"circles">;
}

/** Seeds an active regular Circle with an owner Member. */
async function seedCircle(
  ctx: MutationCtx,
  opts: {
    archived?: boolean;
    kind?: "personal" | "regular";
    currency?: string;
    currencyLocked?: boolean;
  } = {},
): Promise<Seed> {
  const now = Date.now();
  const owner = await makeUser(ctx, "owner@example.com", "Olive Owner");
  const circleId = await ctx.db.insert("circles", {
    name: "Trip",
    kind: opts.kind ?? "regular",
    currency: opts.currency ?? "USD",
    color: "blue",
    mark: "T",
    ownerUserId: owner._id,
    status: opts.archived ? "archived" : "active",
    currencyLocked: opts.currencyLocked ?? false,
    createdAt: now,
  });
  const ownerMemberId = await ctx.db.insert("members", {
    circleId,
    userId: owner._id,
    role: "owner",
    status: "active",
    displayName: owner.displayName,
    joinedAt: now,
  });
  return { owner, ownerMemberId, circleId };
}

/** Adds a Member (active or removed) to a Circle and returns the User + member id. */
async function addMember(
  ctx: MutationCtx,
  circleId: Id<"circles">,
  email: string,
  displayName: string,
  status: "active" | "removed" = "active",
): Promise<{ user: Doc<"users">; memberId: Id<"members"> }> {
  const user = await makeUser(ctx, email, displayName);
  const memberId = await ctx.db.insert("members", {
    circleId,
    userId: user._id,
    role: "member",
    status,
    displayName,
    joinedAt: Date.now(),
    ...(status === "removed" ? { removedAt: Date.now() } : {}),
  });
  return { user, memberId };
}

/** Inserts a Category directly and returns its id. */
async function makeCategory(
  ctx: MutationCtx,
  circleId: Id<"circles">,
  opts: {
    name: string;
    type?: "expense" | "income";
    color?: string;
    status?: "active" | "archived";
    creatorUserId: Id<"users">;
  },
): Promise<Id<"categories">> {
  return await ctx.db.insert("categories", {
    circleId,
    name: opts.name,
    nameLower: opts.name.toLowerCase(),
    type: opts.type ?? "expense",
    color: opts.color ?? "green",
    creatorUserId: opts.creatorUserId,
    status: opts.status ?? "active",
    createdAt: Date.now(),
    ...(opts.status === "archived" ? { archivedAt: Date.now() } : {}),
  });
}

interface Fixture extends Seed {
  groceriesId: Id<"categories">;
  diningId: Id<"categories">;
  salaryId: Id<"categories">;
}

/** A Circle with the owner, an active member, and a few categories of both types. */
async function seedFixture(ctx: MutationCtx, opts: { currency?: string } = {}): Promise<Fixture> {
  const seed = await seedCircle(ctx, opts);
  const groceriesId = await makeCategory(ctx, seed.circleId, {
    name: "Groceries",
    type: "expense",
    creatorUserId: seed.owner._id,
  });
  const diningId = await makeCategory(ctx, seed.circleId, {
    name: "Dining",
    type: "expense",
    creatorUserId: seed.owner._id,
  });
  const salaryId = await makeCategory(ctx, seed.circleId, {
    name: "Salary",
    type: "income",
    creatorUserId: seed.owner._id,
  });
  return { ...seed, groceriesId, diningId, salaryId };
}

function baseExpense(categoryIds: Id<"categories">[]) {
  return {
    type: "expense" as const,
    title: "Weekly shop",
    amountMinorUnits: 1250,
    date: "2026-05-15",
    categoryIds,
  };
}

describe("createTransaction — happy path", () => {
  it("persists minor units, plain date, month bucket, recordedBy/paidBy = creator", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    mockCurrentUser.mockResolvedValue(f.owner);

    const id = await t.mutation(api.transactions.createTransaction, {
      circleId: f.circleId,
      ...baseExpense([f.groceriesId]),
    });

    await t.run(async (ctx) => {
      const txn = await ctx.db.get(id);
      expect(txn?.amountMinorUnits).toBe(1250);
      expect(txn?.date).toBe("2026-05-15");
      expect(txn?.month).toBe("2026-05");
      expect(txn?.type).toBe("expense");
      expect(txn?.status).toBe("active");
      expect(txn?.recordedByMemberId).toBe(f.ownerMemberId);
      expect(txn?.paidByMemberId).toBe(f.ownerMemberId); // defaults to recorded-by
      expect(txn?.note).toBeUndefined();
      expect(txn?.createdAt).toBe(txn?.updatedAt);

      const links = await ctx.db
        .query("transactionCategories")
        .withIndex("by_transaction", (q) => q.eq("transactionId", id))
        .collect();
      expect(links.map((l) => l.categoryId)).toEqual([f.groceriesId]);
    });
  });

  it("creates an income transaction with multiple categories and an optional note", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    const secondIncome = await t.run((ctx) =>
      makeCategory(ctx, f.circleId, {
        name: "Bonus",
        type: "income",
        creatorUserId: f.owner._id,
      }),
    );
    mockCurrentUser.mockResolvedValue(f.owner);

    const id = await t.mutation(api.transactions.createTransaction, {
      circleId: f.circleId,
      type: "income",
      title: "Paycheck",
      note: "  May salary  ",
      amountMinorUnits: 500000,
      date: "2026-05-31",
      categoryIds: [f.salaryId, secondIncome],
    });

    await t.run(async (ctx) => {
      const txn = await ctx.db.get(id);
      expect(txn?.type).toBe("income");
      expect(txn?.note).toBe("May salary"); // trimmed
      const links = await ctx.db
        .query("transactionCategories")
        .withIndex("by_transaction", (q) => q.eq("transactionId", id))
        .collect();
      expect(links).toHaveLength(2);
    });
  });

  it("records a create event with formatted money/date/categories and no raw ids", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx, { currency: "USD" }));
    mockCurrentUser.mockResolvedValue(f.owner);

    const id = await t.mutation(api.transactions.createTransaction, {
      circleId: f.circleId,
      type: "expense",
      title: "Weekly shop",
      note: "eggs and milk",
      amountMinorUnits: 1250,
      date: "2026-05-15",
      categoryIds: [f.groceriesId, f.diningId],
    });

    await t.run(async (ctx) => {
      const events = await ctx.db
        .query("histories")
        .withIndex("by_entity", (q) => q.eq("entityId", id))
        .collect();
      expect(events).toHaveLength(1);
      const event = events[0];
      expect(event?.action).toBe("created");
      expect(event?.actorMemberId).toBe(f.ownerMemberId);
      expect(event?.changes).toEqual([
        { field: "type", to: "expense" },
        { field: "title", to: "Weekly shop" },
        { field: "amount", to: formatMinorUnits(1250, "USD") },
        { field: "date", to: "2026-05-15" },
        { field: "paidBy", to: "Olive Owner" },
        { field: "categories", to: "Groceries, Dining" },
        { field: "note", to: "eggs and milk" },
      ]);
      for (const change of event?.changes ?? []) {
        expect(change.to).not.toBe(id);
        expect(change.to).not.toBe(f.groceriesId);
        expect(change.to).not.toBe(f.ownerMemberId);
      }
    });
  });

  it("omits the note change when no note is given", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    mockCurrentUser.mockResolvedValue(f.owner);

    const id = await t.mutation(api.transactions.createTransaction, {
      circleId: f.circleId,
      ...baseExpense([f.groceriesId]),
    });

    await t.run(async (ctx) => {
      const events = await ctx.db
        .query("histories")
        .withIndex("by_entity", (q) => q.eq("entityId", id))
        .collect();
      expect(events[0]?.changes.some((c) => c.field === "note")).toBe(false);
    });
  });
});

describe("createTransaction — amount edges", () => {
  it.each([
    ["zero", 0],
    ["negative", -100],
    ["non-integer", 12.5],
    ["one minor unit over max", 99_999_999_999 + 1],
  ])("rejects a %s amount", async (_label, amountMinorUnits) => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    mockCurrentUser.mockResolvedValue(f.owner);
    await expect(
      t.mutation(api.transactions.createTransaction, {
        circleId: f.circleId,
        ...baseExpense([f.groceriesId]),
        amountMinorUnits,
      }),
    ).rejects.toThrow();
  });

  it("accepts the maximum allowed amount", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    mockCurrentUser.mockResolvedValue(f.owner);
    await expect(
      t.mutation(api.transactions.createTransaction, {
        circleId: f.circleId,
        ...baseExpense([f.groceriesId]),
        amountMinorUnits: 99_999_999_999,
      }),
    ).resolves.toBeTruthy();
  });
});

describe("createTransaction — date edges", () => {
  it("rejects an invalid date format", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    mockCurrentUser.mockResolvedValue(f.owner);
    await expect(
      t.mutation(api.transactions.createTransaction, {
        circleId: f.circleId,
        ...baseExpense([f.groceriesId]),
        date: "15/05/2026",
      }),
    ).rejects.toThrow();
  });

  it("keeps the entered month at a month boundary (no timezone shift)", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    mockCurrentUser.mockResolvedValue(f.owner);

    const id = await t.mutation(api.transactions.createTransaction, {
      circleId: f.circleId,
      ...baseExpense([f.groceriesId]),
      date: "2026-05-31",
    });
    await t.run(async (ctx) => {
      const txn = await ctx.db.get(id);
      expect(txn?.date).toBe("2026-05-31");
      expect(txn?.month).toBe("2026-05");
    });
  });
});

describe("createTransaction — category rules", () => {
  it("rejects zero categories", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    mockCurrentUser.mockResolvedValue(f.owner);
    await expect(
      t.mutation(api.transactions.createTransaction, {
        circleId: f.circleId,
        ...baseExpense([]),
      }),
    ).rejects.toThrow();
  });

  it("rejects duplicate category ids", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    mockCurrentUser.mockResolvedValue(f.owner);
    await expect(
      t.mutation(api.transactions.createTransaction, {
        circleId: f.circleId,
        ...baseExpense([f.groceriesId, f.groceriesId]),
      }),
    ).rejects.toThrow();
  });

  it("rejects a category from another Circle", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    const otherCategory = await t.run(async (ctx) => {
      const other = await seedCircle(ctx, { kind: "regular" });
      // reuse the owner email collision guard: a distinct circle, distinct cat
      return makeCategory(ctx, other.circleId, {
        name: "Foreign",
        type: "expense",
        creatorUserId: other.owner._id,
      });
    });
    mockCurrentUser.mockResolvedValue(f.owner);
    await expect(
      t.mutation(api.transactions.createTransaction, {
        circleId: f.circleId,
        ...baseExpense([otherCategory]),
      }),
    ).rejects.toThrow(/not found in this circle/i);
  });

  it("rejects a category of the wrong type", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    mockCurrentUser.mockResolvedValue(f.owner);
    await expect(
      t.mutation(api.transactions.createTransaction, {
        circleId: f.circleId,
        ...baseExpense([f.salaryId]), // income category on an expense
      }),
    ).rejects.toThrow(/type does not match/i);
  });

  it("rejects an archived category (cannot be newly added)", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    const archivedId = await t.run((ctx) =>
      makeCategory(ctx, f.circleId, {
        name: "Old",
        type: "expense",
        status: "archived",
        creatorUserId: f.owner._id,
      }),
    );
    mockCurrentUser.mockResolvedValue(f.owner);
    await expect(
      t.mutation(api.transactions.createTransaction, {
        circleId: f.circleId,
        ...baseExpense([archivedId]),
      }),
    ).rejects.toThrow(/archived categories cannot be added/i);
  });

  it("accepts multiple active correct-type categories", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    mockCurrentUser.mockResolvedValue(f.owner);
    await expect(
      t.mutation(api.transactions.createTransaction, {
        circleId: f.circleId,
        ...baseExpense([f.groceriesId, f.diningId]),
      }),
    ).resolves.toBeTruthy();
  });
});

describe("createTransaction — Paid By", () => {
  it("defaults Paid By to the creator", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    mockCurrentUser.mockResolvedValue(f.owner);
    const id = await t.mutation(api.transactions.createTransaction, {
      circleId: f.circleId,
      ...baseExpense([f.groceriesId]),
    });
    await t.run(async (ctx) => {
      expect((await ctx.db.get(id))?.paidByMemberId).toBe(f.ownerMemberId);
    });
  });

  it("sets Paid By to another current Member", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    const other = await t.run((ctx) => addMember(ctx, f.circleId, "m@example.com", "Maya Member"));
    mockCurrentUser.mockResolvedValue(f.owner);

    const id = await t.mutation(api.transactions.createTransaction, {
      circleId: f.circleId,
      ...baseExpense([f.groceriesId]),
      paidByMemberId: other.memberId,
    });
    await t.run(async (ctx) => {
      const txn = await ctx.db.get(id);
      expect(txn?.recordedByMemberId).toBe(f.ownerMemberId);
      expect(txn?.paidByMemberId).toBe(other.memberId);
      const events = await ctx.db
        .query("histories")
        .withIndex("by_entity", (q) => q.eq("entityId", id))
        .collect();
      expect(events[0]?.changes.find((c) => c.field === "paidBy")?.to).toBe("Maya Member");
    });
  });

  it("works on an income transaction (Paid By for income too)", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    const other = await t.run((ctx) => addMember(ctx, f.circleId, "m@example.com", "Maya Member"));
    mockCurrentUser.mockResolvedValue(f.owner);
    const id = await t.mutation(api.transactions.createTransaction, {
      circleId: f.circleId,
      type: "income",
      title: "Refund",
      amountMinorUnits: 999,
      date: "2026-05-10",
      categoryIds: [f.salaryId],
      paidByMemberId: other.memberId,
    });
    await t.run(async (ctx) => {
      expect((await ctx.db.get(id))?.paidByMemberId).toBe(other.memberId);
    });
  });

  it("rejects a Removed Member as Paid By", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    const removed = await t.run((ctx) =>
      addMember(ctx, f.circleId, "r@example.com", "Rex Removed", "removed"),
    );
    mockCurrentUser.mockResolvedValue(f.owner);
    await expect(
      t.mutation(api.transactions.createTransaction, {
        circleId: f.circleId,
        ...baseExpense([f.groceriesId]),
        paidByMemberId: removed.memberId,
      }),
    ).rejects.toThrow(/current member of this circle/i);
  });

  it("rejects a Member of a different Circle as Paid By", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    const foreignMemberId = await t.run(async (ctx) => {
      const other = await seedCircle(ctx);
      return other.ownerMemberId;
    });
    mockCurrentUser.mockResolvedValue(f.owner);
    await expect(
      t.mutation(api.transactions.createTransaction, {
        circleId: f.circleId,
        ...baseExpense([f.groceriesId]),
        paidByMemberId: foreignMemberId,
      }),
    ).rejects.toThrow(/current member of this circle/i);
  });
});

describe("createTransaction — title / note", () => {
  it("rejects an empty title", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    mockCurrentUser.mockResolvedValue(f.owner);
    await expect(
      t.mutation(api.transactions.createTransaction, {
        circleId: f.circleId,
        ...baseExpense([f.groceriesId]),
        title: "",
      }),
    ).rejects.toThrow();
  });

  it("rejects a whitespace-only title", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    mockCurrentUser.mockResolvedValue(f.owner);
    await expect(
      t.mutation(api.transactions.createTransaction, {
        circleId: f.circleId,
        ...baseExpense([f.groceriesId]),
        title: "   ",
      }),
    ).rejects.toThrow();
  });

  it("rejects an over-max title and note", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    mockCurrentUser.mockResolvedValue(f.owner);
    await expect(
      t.mutation(api.transactions.createTransaction, {
        circleId: f.circleId,
        ...baseExpense([f.groceriesId]),
        title: "x".repeat(121),
      }),
    ).rejects.toThrow();
    await expect(
      t.mutation(api.transactions.createTransaction, {
        circleId: f.circleId,
        ...baseExpense([f.groceriesId]),
        note: "x".repeat(1001),
      }),
    ).rejects.toThrow();
  });

  it("trims the title before storing", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    mockCurrentUser.mockResolvedValue(f.owner);
    const id = await t.mutation(api.transactions.createTransaction, {
      circleId: f.circleId,
      ...baseExpense([f.groceriesId]),
      title: "  Weekly shop  ",
    });
    await t.run(async (ctx) => {
      expect((await ctx.db.get(id))?.title).toBe("Weekly shop");
    });
  });
});

describe("createTransaction — permission matrix", () => {
  it("allows the Owner", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    mockCurrentUser.mockResolvedValue(f.owner);
    await expect(
      t.mutation(api.transactions.createTransaction, {
        circleId: f.circleId,
        ...baseExpense([f.groceriesId]),
      }),
    ).resolves.toBeTruthy();
  });

  it("allows a non-owner active Member (recordedBy = them)", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    const member = await t.run((ctx) => addMember(ctx, f.circleId, "m@example.com", "Maya Member"));
    mockCurrentUser.mockResolvedValue(member.user);
    const id = await t.mutation(api.transactions.createTransaction, {
      circleId: f.circleId,
      ...baseExpense([f.groceriesId]),
    });
    await t.run(async (ctx) => {
      expect((await ctx.db.get(id))?.recordedByMemberId).toBe(member.memberId);
    });
  });

  it("denies a Removed Member", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    const removed = await t.run((ctx) =>
      addMember(ctx, f.circleId, "r@example.com", "Rex Removed", "removed"),
    );
    mockCurrentUser.mockResolvedValue(removed.user);
    await expect(
      t.mutation(api.transactions.createTransaction, {
        circleId: f.circleId,
        ...baseExpense([f.groceriesId]),
      }),
    ).rejects.toThrow("Circle not found");
  });

  it("denies a non-member User", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    const stranger = await t.run((ctx) => makeUser(ctx, "s@example.com", "Sam Stranger"));
    mockCurrentUser.mockResolvedValue(stranger);
    await expect(
      t.mutation(api.transactions.createTransaction, {
        circleId: f.circleId,
        ...baseExpense([f.groceriesId]),
      }),
    ).rejects.toThrow("Circle not found");
  });

  it("denies an unauthenticated caller", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    mockCurrentUser.mockResolvedValue(null);
    await expect(
      t.mutation(api.transactions.createTransaction, {
        circleId: f.circleId,
        ...baseExpense([f.groceriesId]),
      }),
    ).rejects.toThrow("Circle not found");
  });

  it("allows a Personal Circle owner", async () => {
    const t = convexTest(schema, modules);
    const personal = await t.run(async (ctx) => {
      const seed = await seedCircle(ctx, { kind: "personal" });
      const cat = await makeCategory(ctx, seed.circleId, {
        name: "Groceries",
        creatorUserId: seed.owner._id,
      });
      return { ...seed, cat };
    });
    mockCurrentUser.mockResolvedValue(personal.owner);
    await expect(
      t.mutation(api.transactions.createTransaction, {
        circleId: personal.circleId,
        ...baseExpense([personal.cat]),
      }),
    ).resolves.toBeTruthy();
  });
});

describe("createTransaction — lifecycle edges", () => {
  it("denies creation in an archived Circle", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run(async (ctx) => {
      const seed = await seedCircle(ctx, { archived: true });
      const cat = await makeCategory(ctx, seed.circleId, {
        name: "Groceries",
        creatorUserId: seed.owner._id,
      });
      return { ...seed, cat };
    });
    mockCurrentUser.mockResolvedValue(f.owner);
    await expect(
      t.mutation(api.transactions.createTransaction, {
        circleId: f.circleId,
        ...baseExpense([f.cat]),
      }),
    ).rejects.toThrow("Circle is archived");
  });
});

describe("createTransaction — currency lock side effect", () => {
  it("flips currencyLocked true on the first Transaction", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    mockCurrentUser.mockResolvedValue(f.owner);

    await t.run(async (ctx) => {
      expect((await ctx.db.get(f.circleId))?.currencyLocked).toBe(false);
    });

    await t.mutation(api.transactions.createTransaction, {
      circleId: f.circleId,
      ...baseExpense([f.groceriesId]),
    });

    await t.run(async (ctx) => {
      expect((await ctx.db.get(f.circleId))?.currencyLocked).toBe(true);
    });
  });

  it("leaves an already-locked Circle locked", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx, {}));
    await t.run((ctx) => ctx.db.patch(f.circleId, { currencyLocked: true }));
    mockCurrentUser.mockResolvedValue(f.owner);
    await t.mutation(api.transactions.createTransaction, {
      circleId: f.circleId,
      ...baseExpense([f.groceriesId]),
    });
    await t.run(async (ctx) => {
      expect((await ctx.db.get(f.circleId))?.currencyLocked).toBe(true);
    });
  });
});

describe("listTransactions", () => {
  it("returns active transactions sorted by date desc then created-at desc", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    mockCurrentUser.mockResolvedValue(f.owner);

    await t.mutation(api.transactions.createTransaction, {
      circleId: f.circleId,
      ...baseExpense([f.groceriesId]),
      title: "Older",
      date: "2026-05-01",
    });
    await t.mutation(api.transactions.createTransaction, {
      circleId: f.circleId,
      ...baseExpense([f.groceriesId]),
      title: "Newer",
      date: "2026-05-20",
    });

    const list = await t.query(api.transactions.listTransactions, { circleId: f.circleId });
    expect(list?.map((txn) => txn.title)).toEqual(["Newer", "Older"]);
    expect(list?.[0]?.paidBy.displayName).toBe("Olive Owner");
    expect(list?.[0]?.categories.map((c) => c.name)).toEqual(["Groceries"]);
  });

  it("excludes archived transactions", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    mockCurrentUser.mockResolvedValue(f.owner);
    const id = await t.mutation(api.transactions.createTransaction, {
      circleId: f.circleId,
      ...baseExpense([f.groceriesId]),
    });
    await t.run((ctx) => ctx.db.patch(id, { status: "archived", archivedAt: Date.now() }));
    const list = await t.query(api.transactions.listTransactions, { circleId: f.circleId });
    expect(list).toHaveLength(0);
  });

  it("flips live when a Transaction is created (basis for RPT live tests)", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    mockCurrentUser.mockResolvedValue(f.owner);

    expect(
      (await t.query(api.transactions.listTransactions, { circleId: f.circleId }))?.length,
    ).toBe(0);

    await t.mutation(api.transactions.createTransaction, {
      circleId: f.circleId,
      ...baseExpense([f.groceriesId]),
    });

    expect(
      (await t.query(api.transactions.listTransactions, { circleId: f.circleId }))?.length,
    ).toBe(1);
  });

  it("returns null for an inaccessible Circle (anti-enumeration)", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    const stranger = await t.run((ctx) => makeUser(ctx, "s@example.com", "Sam Stranger"));
    mockCurrentUser.mockResolvedValue(stranger);
    expect(await t.query(api.transactions.listTransactions, { circleId: f.circleId })).toBeNull();
  });

  it("returns null for an unauthenticated caller", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    mockCurrentUser.mockResolvedValue(null);
    expect(await t.query(api.transactions.listTransactions, { circleId: f.circleId })).toBeNull();
  });
});
