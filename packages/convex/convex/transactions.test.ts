import { formatMinorUnits } from "@spend-circle/domain";
import { convexTest } from "convex-test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api.js";
import type { Doc, Id } from "./_generated/dataModel.js";
import type { MutationCtx } from "./_generated/server.js";
import schema from "./schema.js";
import {
  addMember,
  firstPage,
  makeCategory,
  makeUser,
  seedCircle,
  seedFixture,
  seedTransaction,
} from "./test/seed.js";

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

function baseExpense(categoryIds: Id<"categories">[]) {
  return {
    type: "expense" as const,
    title: "Weekly shop",
    amountMinorUnits: 1250,
    date: "2026-05-15",
    categoryIds,
  };
}

/** An entity's history newest-first. */
async function historyOf(ctx: MutationCtx, entityId: string): Promise<Doc<"histories">[]> {
  return await ctx.db
    .query("histories")
    .withIndex("by_entity", (q) => q.eq("entityId", entityId))
    .order("desc")
    .collect();
}

/** The Category ids currently attached to a Transaction. */
async function categoryIdsOf(
  ctx: MutationCtx,
  id: Id<"transactions">,
): Promise<Id<"categories">[]> {
  const links = await ctx.db
    .query("transactionCategories")
    .withIndex("by_transaction", (q) => q.eq("transactionId", id))
    .collect();
  return links.map((link) => link.categoryId);
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

/** A first-page query of `size` items (cursor null = from the start). */

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

    const result = await t.query(api.transactions.listTransactions, {
      circleId: f.circleId,
      ...firstPage(25),
    });
    expect(result.page.map((txn) => txn.title)).toEqual(["Newer", "Older"]);
    expect(result.isDone).toBe(true);
    expect(result.page[0]?.paidBy.displayName).toBe("Olive Owner");
    expect(result.page[0]?.categories.map((c) => c.name)).toEqual(["Groceries"]);
  });

  it("orders same-date transactions by created-at desc", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    mockCurrentUser.mockResolvedValue(f.owner);

    await t.mutation(api.transactions.createTransaction, {
      circleId: f.circleId,
      ...baseExpense([f.groceriesId]),
      title: "First",
      date: "2026-05-10",
    });
    await t.mutation(api.transactions.createTransaction, {
      circleId: f.circleId,
      ...baseExpense([f.groceriesId]),
      title: "Second",
      date: "2026-05-10",
    });

    const result = await t.query(api.transactions.listTransactions, {
      circleId: f.circleId,
      ...firstPage(25),
    });
    expect(result.page.map((txn) => txn.title)).toEqual(["Second", "First"]);
  });

  it("paginates: a bounded page, isDone false, then the next page via the cursor", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    mockCurrentUser.mockResolvedValue(f.owner);

    for (const date of ["2026-05-01", "2026-05-02", "2026-05-03"]) {
      await t.mutation(api.transactions.createTransaction, {
        circleId: f.circleId,
        ...baseExpense([f.groceriesId]),
        title: `Txn ${date}`,
        date,
      });
    }

    const page1 = await t.query(api.transactions.listTransactions, {
      circleId: f.circleId,
      ...firstPage(2),
    });
    expect(page1.page.map((txn) => txn.title)).toEqual(["Txn 2026-05-03", "Txn 2026-05-02"]);
    expect(page1.isDone).toBe(false);

    const page2 = await t.query(api.transactions.listTransactions, {
      circleId: f.circleId,
      paginationOpts: { numItems: 2, cursor: page1.continueCursor },
    });
    expect(page2.page.map((txn) => txn.title)).toEqual(["Txn 2026-05-01"]);
    expect(page2.isDone).toBe(true);
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
    const result = await t.query(api.transactions.listTransactions, {
      circleId: f.circleId,
      ...firstPage(25),
    });
    expect(result.page).toHaveLength(0);
  });

  it("flips live when a Transaction is created (basis for RPT live tests)", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    mockCurrentUser.mockResolvedValue(f.owner);

    expect(
      (await t.query(api.transactions.listTransactions, { circleId: f.circleId, ...firstPage(25) }))
        .page.length,
    ).toBe(0);

    await t.mutation(api.transactions.createTransaction, {
      circleId: f.circleId,
      ...baseExpense([f.groceriesId]),
    });

    expect(
      (await t.query(api.transactions.listTransactions, { circleId: f.circleId, ...firstPage(25) }))
        .page.length,
    ).toBe(1);
  });

  it("returns an empty exhausted page for an inaccessible Circle (anti-enumeration)", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    const stranger = await t.run((ctx) => makeUser(ctx, "s@example.com", "Sam Stranger"));
    mockCurrentUser.mockResolvedValue(stranger);
    const result = await t.query(api.transactions.listTransactions, {
      circleId: f.circleId,
      ...firstPage(25),
    });
    expect(result.page).toEqual([]);
    expect(result.isDone).toBe(true);
  });

  it("returns an empty exhausted page for an unauthenticated caller", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    mockCurrentUser.mockResolvedValue(null);
    const result = await t.query(api.transactions.listTransactions, {
      circleId: f.circleId,
      ...firstPage(25),
    });
    expect(result.page).toEqual([]);
    expect(result.isDone).toBe(true);
  });

  it("marks canEditFields true for the viewer's own Transactions, false for others", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    const other = await t.run((ctx) => addMember(ctx, f.circleId, "m@example.com", "Maya Member"));
    await t.run((ctx) =>
      seedTransaction(ctx, f, { title: "Mine", recordedByMemberId: f.ownerMemberId }),
    );
    await t.run((ctx) =>
      seedTransaction(ctx, f, { title: "Theirs", recordedByMemberId: other.memberId }),
    );
    mockCurrentUser.mockResolvedValue(f.owner);

    const result = await t.query(api.transactions.listTransactions, {
      circleId: f.circleId,
      ...firstPage(25),
    });
    const byTitle = new Map(result.page.map((txn) => [txn.title, txn.canEditFields]));
    expect(byTitle.get("Mine")).toBe(true);
    expect(byTitle.get("Theirs")).toBe(false);
  });
});

describe("updateTransaction — field edits", () => {
  it("edits title/amount/date and records one 'edited' event with only changed fields", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx, { currency: "USD" }));
    const id = await t.run((ctx) => seedTransaction(ctx, f));
    // Pin updatedAt to a sentinel so the post-edit bump is observable regardless of
    // clock granularity (the seed + edit can land in the same millisecond).
    await t.run((ctx) => ctx.db.patch(id, { updatedAt: 1 }));
    mockCurrentUser.mockResolvedValue(f.owner);

    await t.mutation(api.transactions.updateTransaction, {
      transactionId: id,
      title: "  Big shop  ",
      amountMinorUnits: 5000,
      date: "2026-06-02",
    });

    await t.run(async (ctx) => {
      const txn = await ctx.db.get(id);
      expect(txn?.title).toBe("Big shop"); // trimmed
      expect(txn?.amountMinorUnits).toBe(5000);
      expect(txn?.date).toBe("2026-06-02");
      expect(txn?.month).toBe("2026-06"); // bucket kept in sync
      expect(txn?.updatedAt).toBeGreaterThan(1); // bumped off the sentinel

      const events = await historyOf(ctx, id);
      expect(events).toHaveLength(1);
      expect(events[0]?.action).toBe("edited");
      expect(events[0]?.actorMemberId).toBe(f.ownerMemberId);
      expect(events[0]?.changes).toEqual([
        { field: "title", from: "Weekly shop", to: "Big shop" },
        { field: "amount", from: formatMinorUnits(1250, "USD"), to: formatMinorUnits(5000, "USD") },
        { field: "date", from: "2026-05-15", to: "2026-06-02" },
      ]);
    });
  });

  it("is a true no-op when nothing actually changes (no patch, no history)", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    const id = await t.run((ctx) => seedTransaction(ctx, f, { title: "Weekly shop" }));
    mockCurrentUser.mockResolvedValue(f.owner);

    const before = await t.run(async (ctx) => (await ctx.db.get(id))?.updatedAt);
    await t.mutation(api.transactions.updateTransaction, {
      transactionId: id,
      title: "Weekly shop", // same value
      amountMinorUnits: 1250, // same value
      categoryIds: [f.groceriesId], // same set
    });

    await t.run(async (ctx) => {
      expect((await ctx.db.get(id))?.updatedAt).toBe(before); // not bumped
      expect(await historyOf(ctx, id)).toHaveLength(0); // no spurious event
    });
  });

  it("treats reordering the same categories as a no-op", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    const id = await t.run((ctx) =>
      seedTransaction(ctx, f, { categoryIds: [f.groceriesId, f.diningId] }),
    );
    mockCurrentUser.mockResolvedValue(f.owner);

    await t.mutation(api.transactions.updateTransaction, {
      transactionId: id,
      categoryIds: [f.diningId, f.groceriesId], // reversed, same set
    });
    await t.run(async (ctx) => {
      expect(await historyOf(ctx, id)).toHaveLength(0);
    });
  });

  it("adds, changes, and clears the note with the right from/to", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    mockCurrentUser.mockResolvedValue(f.owner);

    // Add a note (from absent).
    const id = await t.run((ctx) => seedTransaction(ctx, f));
    await t.mutation(api.transactions.updateTransaction, { transactionId: id, note: "  eggs  " });
    await t.run(async (ctx) => {
      expect((await ctx.db.get(id))?.note).toBe("eggs");
      expect((await historyOf(ctx, id))[0]?.changes).toEqual([{ field: "note", to: "eggs" }]);
    });

    // Change the note (from + to).
    await t.mutation(api.transactions.updateTransaction, {
      transactionId: id,
      note: "eggs and milk",
    });
    await t.run(async (ctx) => {
      expect((await historyOf(ctx, id))[0]?.changes).toEqual([
        { field: "note", from: "eggs", to: "eggs and milk" },
      ]);
    });

    // Clear the note with "" (from only; field removed).
    await t.mutation(api.transactions.updateTransaction, { transactionId: id, note: "  " });
    await t.run(async (ctx) => {
      expect((await ctx.db.get(id))?.note).toBeUndefined();
      expect((await historyOf(ctx, id))[0]?.changes).toEqual([
        { field: "note", from: "eggs and milk" },
      ]);
    });
  });

  it("records multiple field edits as one event with multiple changes (no raw ids)", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    const id = await t.run((ctx) => seedTransaction(ctx, f));
    mockCurrentUser.mockResolvedValue(f.owner);

    await t.mutation(api.transactions.updateTransaction, {
      transactionId: id,
      title: "Renamed",
      categoryIds: [f.diningId],
    });
    await t.run(async (ctx) => {
      const events = await historyOf(ctx, id);
      expect(events).toHaveLength(1);
      expect(events[0]?.changes).toEqual([
        { field: "title", from: "Weekly shop", to: "Renamed" },
        { field: "categories", from: "Groceries", to: "Dining" },
      ]);
      for (const change of events[0]?.changes ?? []) {
        expect(change.to).not.toBe(id);
        expect(change.to).not.toBe(f.diningId);
      }
    });
  });

  it.each([
    ["zero amount", { amountMinorUnits: 0 }],
    ["non-integer amount", { amountMinorUnits: 12.5 }],
    ["over-max amount", { amountMinorUnits: 99_999_999_999 + 1 }],
    ["empty title", { title: "   " }],
    ["over-max title", { title: "x".repeat(121) }],
    ["over-max note", { note: "x".repeat(1001) }],
    ["bad date", { date: "2026-13-01" }],
  ])("rejects an invalid %s like create does", async (_label, patch) => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    const id = await t.run((ctx) => seedTransaction(ctx, f));
    mockCurrentUser.mockResolvedValue(f.owner);
    await expect(
      t.mutation(api.transactions.updateTransaction, { transactionId: id, ...patch }),
    ).rejects.toThrow();
  });
});

describe("updateTransaction — Paid By", () => {
  it("changes Paid By to another current Member and records the from/to", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    const other = await t.run((ctx) => addMember(ctx, f.circleId, "m@example.com", "Maya Member"));
    const id = await t.run((ctx) => seedTransaction(ctx, f));
    mockCurrentUser.mockResolvedValue(f.owner);

    await t.mutation(api.transactions.updateTransaction, {
      transactionId: id,
      paidByMemberId: other.memberId,
    });
    await t.run(async (ctx) => {
      expect((await ctx.db.get(id))?.paidByMemberId).toBe(other.memberId);
      expect((await historyOf(ctx, id))[0]?.changes).toEqual([
        { field: "paidBy", from: "Olive Owner", to: "Maya Member" },
      ]);
    });
  });

  it("rejects changing Paid By to a Removed Member", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    const removed = await t.run((ctx) =>
      addMember(ctx, f.circleId, "r@example.com", "Rex Removed", "removed"),
    );
    const id = await t.run((ctx) => seedTransaction(ctx, f));
    mockCurrentUser.mockResolvedValue(f.owner);
    await expect(
      t.mutation(api.transactions.updateTransaction, {
        transactionId: id,
        paidByMemberId: removed.memberId,
      }),
    ).rejects.toThrow(/current member of this circle/i);
  });

  it("rejects changing Paid By to a Member of another Circle", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    const foreignMemberId = await t.run(async (ctx) => (await seedCircle(ctx)).ownerMemberId);
    const id = await t.run((ctx) => seedTransaction(ctx, f));
    mockCurrentUser.mockResolvedValue(f.owner);
    await expect(
      t.mutation(api.transactions.updateTransaction, {
        transactionId: id,
        paidByMemberId: foreignMemberId,
      }),
    ).rejects.toThrow(/current member of this circle/i);
  });

  it("keeping the same Paid By is a no-op (no validation, no event)", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    const id = await t.run((ctx) => seedTransaction(ctx, f, { paidByMemberId: f.ownerMemberId }));
    mockCurrentUser.mockResolvedValue(f.owner);
    await t.mutation(api.transactions.updateTransaction, {
      transactionId: id,
      paidByMemberId: f.ownerMemberId,
    });
    await t.run(async (ctx) => {
      expect(await historyOf(ctx, id)).toHaveLength(0);
    });
  });
});

describe("updateTransaction — categories (same type)", () => {
  it("rewrites the category set and records the from/to", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    const id = await t.run((ctx) => seedTransaction(ctx, f, { categoryIds: [f.groceriesId] }));
    mockCurrentUser.mockResolvedValue(f.owner);

    await t.mutation(api.transactions.updateTransaction, {
      transactionId: id,
      categoryIds: [f.groceriesId, f.diningId],
    });
    await t.run(async (ctx) => {
      expect(await categoryIdsOf(ctx, id)).toEqual([f.groceriesId, f.diningId]);
      expect((await historyOf(ctx, id))[0]?.changes).toEqual([
        { field: "categories", from: "Groceries", to: "Groceries, Dining" },
      ]);
    });
  });

  it("keeps an already-attached Category that was archived mid-life (PRD 57)", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    // Groceries is attached, THEN archived; the edit (changing another field) must
    // not reject for the still-attached archived Category.
    const id = await t.run((ctx) => seedTransaction(ctx, f, { categoryIds: [f.groceriesId] }));
    await t.run((ctx) =>
      ctx.db.patch(f.groceriesId, { status: "archived", archivedAt: Date.now() }),
    );
    mockCurrentUser.mockResolvedValue(f.owner);

    await t.mutation(api.transactions.updateTransaction, {
      transactionId: id,
      categoryIds: [f.groceriesId], // keep the already-attached archived one
      title: "Renamed",
    });
    await t.run(async (ctx) => {
      expect(await categoryIdsOf(ctx, id)).toEqual([f.groceriesId]);
    });
  });

  it("rejects NEWLY adding an archived Category", async () => {
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
    const id = await t.run((ctx) => seedTransaction(ctx, f, { categoryIds: [f.groceriesId] }));
    mockCurrentUser.mockResolvedValue(f.owner);
    await expect(
      t.mutation(api.transactions.updateTransaction, {
        transactionId: id,
        categoryIds: [f.groceriesId, archivedId],
      }),
    ).rejects.toThrow(/archived categories cannot be added/i);
  });

  it("rejects a category of the wrong type and one from another Circle", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    const id = await t.run((ctx) => seedTransaction(ctx, f));
    const foreignId = await t.run(async (ctx) => {
      const other = await seedCircle(ctx);
      return makeCategory(ctx, other.circleId, {
        name: "Foreign",
        type: "expense",
        creatorUserId: other.owner._id,
      });
    });
    mockCurrentUser.mockResolvedValue(f.owner);
    await expect(
      t.mutation(api.transactions.updateTransaction, {
        transactionId: id,
        categoryIds: [f.salaryId], // income category on an expense
      }),
    ).rejects.toThrow(/type does not match/i);
    await expect(
      t.mutation(api.transactions.updateTransaction, {
        transactionId: id,
        categoryIds: [foreignId],
      }),
    ).rejects.toThrow(/not found in this circle/i);
  });

  it("rejects emptying the category set", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    const id = await t.run((ctx) => seedTransaction(ctx, f));
    mockCurrentUser.mockResolvedValue(f.owner);
    await expect(
      t.mutation(api.transactions.updateTransaction, { transactionId: id, categoryIds: [] }),
    ).rejects.toThrow();
  });
});

describe("updateTransaction — type change", () => {
  it("changes type, clears old categories, attaches new ones, and records 'type changed'", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    const id = await t.run((ctx) =>
      seedTransaction(ctx, f, { type: "expense", categoryIds: [f.groceriesId, f.diningId] }),
    );
    mockCurrentUser.mockResolvedValue(f.owner);

    await t.mutation(api.transactions.updateTransaction, {
      transactionId: id,
      type: "income",
      categoryIds: [f.salaryId],
    });
    await t.run(async (ctx) => {
      const txn = await ctx.db.get(id);
      expect(txn?.type).toBe("income");
      expect(await categoryIdsOf(ctx, id)).toEqual([f.salaryId]); // old cleared, new set
      const events = await historyOf(ctx, id);
      expect(events[0]?.action).toBe("type changed");
      expect(events[0]?.changes).toEqual([
        { field: "type", from: "expense", to: "income" },
        { field: "categories", from: "Groceries, Dining", to: "Salary" },
      ]);
    });
  });

  it("requires categories of the new type — none supplied is rejected", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    const id = await t.run((ctx) => seedTransaction(ctx, f, { type: "expense" }));
    mockCurrentUser.mockResolvedValue(f.owner);
    await expect(
      t.mutation(api.transactions.updateTransaction, { transactionId: id, type: "income" }),
    ).rejects.toThrow(/requires categories of the new type/i);
  });

  it("rejects old-type categories supplied with the new type", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    const id = await t.run((ctx) => seedTransaction(ctx, f, { type: "expense" }));
    mockCurrentUser.mockResolvedValue(f.owner);
    await expect(
      t.mutation(api.transactions.updateTransaction, {
        transactionId: id,
        type: "income",
        categoryIds: [f.groceriesId], // still an expense category
      }),
    ).rejects.toThrow(/type does not match/i);
  });

  it("rejects an archived new-type category on a type change", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    const archivedIncome = await t.run((ctx) =>
      makeCategory(ctx, f.circleId, {
        name: "Old Income",
        type: "income",
        status: "archived",
        creatorUserId: f.owner._id,
      }),
    );
    const id = await t.run((ctx) => seedTransaction(ctx, f, { type: "expense" }));
    mockCurrentUser.mockResolvedValue(f.owner);
    await expect(
      t.mutation(api.transactions.updateTransaction, {
        transactionId: id,
        type: "income",
        categoryIds: [archivedIncome],
      }),
    ).rejects.toThrow(/archived categories cannot be added/i);
  });
});

describe("updateTransaction — permission matrix", () => {
  it("allows the Recorded By Member", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    const member = await t.run((ctx) => addMember(ctx, f.circleId, "m@example.com", "Maya Member"));
    const id = await t.run((ctx) =>
      seedTransaction(ctx, f, { recordedByMemberId: member.memberId }),
    );
    mockCurrentUser.mockResolvedValue(member.user);
    await expect(
      t.mutation(api.transactions.updateTransaction, { transactionId: id, title: "Mine edited" }),
    ).resolves.toBeTruthy();
  });

  it("forbids the Owner from editing another Member's fields (TXN-3 moderation only)", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    const member = await t.run((ctx) => addMember(ctx, f.circleId, "m@example.com", "Maya Member"));
    const id = await t.run((ctx) =>
      seedTransaction(ctx, f, { recordedByMemberId: member.memberId }),
    );
    mockCurrentUser.mockResolvedValue(f.owner);
    await expect(
      t.mutation(api.transactions.updateTransaction, { transactionId: id, title: "Owner edit" }),
    ).rejects.toThrow(/only the member who recorded/i);
  });

  it("forbids a non-recorder Member", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    const member = await t.run((ctx) => addMember(ctx, f.circleId, "m@example.com", "Maya Member"));
    const id = await t.run((ctx) =>
      seedTransaction(ctx, f, { recordedByMemberId: f.ownerMemberId }),
    );
    mockCurrentUser.mockResolvedValue(member.user);
    await expect(
      t.mutation(api.transactions.updateTransaction, { transactionId: id, title: "Nope" }),
    ).rejects.toThrow(/only the member who recorded/i);
  });

  it("forbids a Removed Recorded By, then allows them again on rejoin (PRD 44)", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    const member = await t.run((ctx) => addMember(ctx, f.circleId, "m@example.com", "Maya Member"));
    const id = await t.run((ctx) =>
      seedTransaction(ctx, f, { recordedByMemberId: member.memberId }),
    );
    mockCurrentUser.mockResolvedValue(member.user);

    // Removed: the SAME member row flips to removed → access collapses to not-found.
    await t.run((ctx) =>
      ctx.db.patch(member.memberId, { status: "removed", removedAt: Date.now() }),
    );
    await expect(
      t.mutation(api.transactions.updateTransaction, { transactionId: id, title: "While removed" }),
    ).rejects.toThrow("Transaction not found");

    // Rejoin reactivates the SAME row, so recordedByMemberId matches again — edit rights restored.
    await t.run((ctx) => ctx.db.patch(member.memberId, { status: "active" }));
    await expect(
      t.mutation(api.transactions.updateTransaction, { transactionId: id, title: "Rejoined edit" }),
    ).resolves.toBeTruthy();
  });

  it("hides existence from a non-member and an unauthenticated caller (anti-enumeration)", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    const id = await t.run((ctx) => seedTransaction(ctx, f));
    const stranger = await t.run((ctx) => makeUser(ctx, "s@example.com", "Sam Stranger"));

    mockCurrentUser.mockResolvedValue(stranger);
    await expect(
      t.mutation(api.transactions.updateTransaction, { transactionId: id, title: "x" }),
    ).rejects.toThrow("Transaction not found");

    mockCurrentUser.mockResolvedValue(null);
    await expect(
      t.mutation(api.transactions.updateTransaction, { transactionId: id, title: "x" }),
    ).rejects.toThrow("Transaction not found");
  });

  it("throws the SAME 'Transaction not found' for a missing Transaction", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    // A real-but-deleted id keeps the Convex arg validator happy while the row is gone.
    const id = await t.run((ctx) => seedTransaction(ctx, f));
    await t.run((ctx) => ctx.db.delete(id));
    mockCurrentUser.mockResolvedValue(f.owner);
    await expect(
      t.mutation(api.transactions.updateTransaction, { transactionId: id, title: "x" }),
    ).rejects.toThrow("Transaction not found");
  });
});

describe("updateTransaction — lifecycle edges", () => {
  it("rejects editing an archived Transaction (frozen — PRD 40)", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    const id = await t.run((ctx) => seedTransaction(ctx, f, { status: "archived" }));
    mockCurrentUser.mockResolvedValue(f.owner);
    await expect(
      t.mutation(api.transactions.updateTransaction, { transactionId: id, title: "x" }),
    ).rejects.toThrow(/archived transactions can't be edited/i);
  });

  it("rejects editing in an archived Circle", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    const id = await t.run((ctx) => seedTransaction(ctx, f));
    await t.run((ctx) => ctx.db.patch(f.circleId, { status: "archived", archivedAt: Date.now() }));
    mockCurrentUser.mockResolvedValue(f.owner);
    await expect(
      t.mutation(api.transactions.updateTransaction, { transactionId: id, title: "x" }),
    ).rejects.toThrow("Circle is archived");
  });
});
