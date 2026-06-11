import { convexTest } from "convex-test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api.js";
import schema from "./schema.js";
import {
  addMember,
  firstPage,
  makeCategory,
  makeUser,
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

async function seedSparseSearchRows(
  ctx: Parameters<typeof seedTransaction>[0],
  f: Parameters<typeof seedTransaction>[1],
  opts: {
    needle: string;
    count?: number;
    row?: (index: number) => Parameters<typeof seedTransaction>[2];
  },
) {
  const count = opts.count ?? 12;
  for (let index = 0; index < count; index += 1) {
    const day = (index + 1).toString().padStart(2, "0");
    const matches = index % 2 === 0;
    await seedTransaction(ctx, f, {
      title: matches ? `${opts.needle} ${index}` : `miss ${index}`,
      note: matches ? "matched sparse row" : "ordinary row",
      date: `2026-06-${day}`,
      ...opts.row?.(index),
    });
  }
}

describe("filterLedgerTransactions", () => {
  it("filters the selected month by title/note only", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    mockCurrentUser.mockResolvedValue(f.owner);
    await t.run(async (ctx) => {
      await seedTransaction(ctx, f, {
        title: "Whole Foods",
        note: "Weekly groceries",
        date: "2026-06-10",
      });
      await seedTransaction(ctx, f, {
        title: "Category name only",
        note: "no match",
        date: "2026-06-11",
        categoryIds: [f.diningId],
      });
      await seedTransaction(ctx, f, {
        title: "Whole Foods old",
        note: "Weekly groceries",
        date: "2026-05-10",
      });
    });

    const title = await t.query(api.search.filterLedgerTransactions, {
      circleId: f.circleId,
      month: "2026-06",
      type: "all",
      status: "active",
      query: "whole   foods",
      ...firstPage(25),
    });
    expect(title.page.map((txn) => txn.title)).toEqual(["Whole Foods"]);

    const categoryName = await t.query(api.search.filterLedgerTransactions, {
      circleId: f.circleId,
      month: "2026-06",
      type: "all",
      status: "active",
      query: "dining",
      ...firstPage(25),
    });
    expect(categoryName.page).toEqual([]);
  });

  it("ORs values within category/member fields and ANDs fields together", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    const alex = await t.run((ctx) => addMember(ctx, f.circleId, "alex@example.com", "Alex"));
    const sam = await t.run((ctx) => addMember(ctx, f.circleId, "sam@example.com", "Sam"));
    mockCurrentUser.mockResolvedValue(f.owner);
    await t.run(async (ctx) => {
      await seedTransaction(ctx, f, {
        title: "Groceries Alex",
        date: "2026-06-10",
        categoryIds: [f.groceriesId],
        paidByMemberId: alex.memberId,
      });
      await seedTransaction(ctx, f, {
        title: "Dining Alex",
        date: "2026-06-11",
        categoryIds: [f.diningId],
        paidByMemberId: alex.memberId,
      });
      await seedTransaction(ctx, f, {
        title: "Groceries Sam",
        date: "2026-06-12",
        categoryIds: [f.groceriesId],
        paidByMemberId: sam.memberId,
      });
    });

    const result = await t.query(api.search.filterLedgerTransactions, {
      circleId: f.circleId,
      month: "2026-06",
      type: "expense",
      status: "active",
      categoryIds: [f.groceriesId, f.diningId],
      paidByMemberIds: [alex.memberId],
      ...firstPage(25),
    });
    expect(result.page.map((txn) => txn.title)).toEqual(["Dining Alex", "Groceries Alex"]);
  });

  it("uses the text index instead of scanning past text misses", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    mockCurrentUser.mockResolvedValue(f.owner);
    await t.run(async (ctx) => {
      await seedTransaction(ctx, f, { title: "Newest miss", date: "2026-06-03" });
      await seedTransaction(ctx, f, { title: "Middle miss", date: "2026-06-02" });
      await seedTransaction(ctx, f, { title: "Needle match", date: "2026-06-01" });
    });

    const page = await t.query(api.search.filterLedgerTransactions, {
      circleId: f.circleId,
      month: "2026-06",
      type: "all",
      status: "active",
      query: "needle",
      ...firstPage(1),
    });
    expect(page.page.map((txn) => txn.title)).toEqual(["Needle match"]);
    expect(page.isDone).toBe(true);
  });

  it("paginates sparse text matches through the search index", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    mockCurrentUser.mockResolvedValue(f.owner);
    await t.run((ctx) => seedSparseSearchRows(ctx, f, { needle: "needle" }));

    const first = await t.query(api.search.filterLedgerTransactions, {
      circleId: f.circleId,
      month: "2026-06",
      type: "all",
      status: "active",
      query: "needle",
      ...firstPage(5),
    });
    expect(first.page).toHaveLength(5);
    expect(first.page.every((txn) => txn.title.includes("needle"))).toBe(true);
    expect(first.isDone).toBe(false);

    const second = await t.query(api.search.filterLedgerTransactions, {
      circleId: f.circleId,
      month: "2026-06",
      type: "all",
      status: "active",
      query: "needle",
      paginationOpts: { numItems: 5, cursor: first.continueCursor },
    });
    expect([...first.page, ...second.page].map((txn) => txn.title).sort()).toEqual([
      "needle 0",
      "needle 10",
      "needle 2",
      "needle 4",
      "needle 6",
      "needle 8",
    ]);
    expect(second.isDone).toBe(true);
  });

  it("pushes a single Paid By selection into indexed text search", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    const alex = await t.run((ctx) => addMember(ctx, f.circleId, "alex@example.com", "Alex"));
    mockCurrentUser.mockResolvedValue(f.owner);
    await t.run((ctx) =>
      seedSparseSearchRows(ctx, f, {
        needle: "payer",
        row: () => ({ paidByMemberId: alex.memberId }),
      }),
    );

    const page = await t.query(api.search.filterLedgerTransactions, {
      circleId: f.circleId,
      month: "2026-06",
      type: "all",
      status: "active",
      query: "payer",
      paidByMemberIds: [alex.memberId],
      ...firstPage(5),
    });
    expect(page.page).toHaveLength(5);
    expect(page.page.every((txn) => txn.paidBy.displayName === "Alex")).toBe(true);
    expect(page.isDone).toBe(false);
  });

  it("pushes a single Recorded By selection into indexed text search", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    const sam = await t.run((ctx) => addMember(ctx, f.circleId, "sam@example.com", "Sam"));
    mockCurrentUser.mockResolvedValue(f.owner);
    await t.run((ctx) =>
      seedSparseSearchRows(ctx, f, {
        needle: "recorder",
        row: () => ({ recordedByMemberId: sam.memberId }),
      }),
    );

    const page = await t.query(api.search.filterLedgerTransactions, {
      circleId: f.circleId,
      month: "2026-06",
      type: "all",
      status: "active",
      query: "recorder",
      recordedByMemberIds: [sam.memberId],
      ...firstPage(5),
    });
    expect(page.page).toHaveLength(5);
    expect(page.page.every((txn) => txn.recordedBy.displayName === "Sam")).toBe(true);
    expect(page.isDone).toBe(false);
  });
});

describe("searchTransactions", () => {
  it("defaults by explicit status/type to all active circle transactions newest first", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    mockCurrentUser.mockResolvedValue(f.owner);
    await t.run(async (ctx) => {
      await seedTransaction(ctx, f, { title: "May row", date: "2026-05-10" });
      await seedTransaction(ctx, f, { title: "June row", date: "2026-06-10" });
      await seedTransaction(ctx, f, {
        title: "Archived row",
        date: "2026-06-11",
        status: "archived",
      });
    });

    const result = await t.query(api.search.searchTransactions, {
      circleId: f.circleId,
      type: "all",
      status: "active",
      ...firstPage(25),
    });
    expect(result.page.map((txn) => txn.title)).toEqual(["June row", "May row"]);
  });

  it("supports status all, inclusive dates, and inclusive amount range", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    mockCurrentUser.mockResolvedValue(f.owner);
    await t.run(async (ctx) => {
      await seedTransaction(ctx, f, {
        title: "Start",
        date: "2026-05-01",
        amountMinorUnits: 1_000,
      });
      await seedTransaction(ctx, f, {
        title: "End archived",
        date: "2026-05-31",
        amountMinorUnits: 2_000,
        status: "archived",
      });
      await seedTransaction(ctx, f, {
        title: "Outside",
        date: "2026-06-01",
        amountMinorUnits: 2_000,
      });
    });

    const result = await t.query(api.search.searchTransactions, {
      circleId: f.circleId,
      type: "all",
      status: "all",
      dateFrom: "2026-05-01",
      dateTo: "2026-05-31",
      amountMin: 1_000,
      amountMax: 2_000,
      ...firstPage(25),
    });
    expect(result.page.map((txn) => txn.title)).toEqual(["End archived", "Start"]);
  });

  it("uses indexed whole-word text search with final-term prefix matching", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    mockCurrentUser.mockResolvedValue(f.owner);
    await t.run(async (ctx) => {
      await seedTransaction(ctx, f, { title: "Coffee beans", note: "local roaster" });
      await seedTransaction(ctx, f, { title: "Office supplies", note: "paper" });
      await seedTransaction(ctx, f, { title: "Cafe", note: "coffee filters" });
    });

    const substring = await t.query(api.search.searchTransactions, {
      circleId: f.circleId,
      type: "all",
      status: "active",
      query: "off",
      ...firstPage(25),
    });
    expect(substring.page.map((txn) => txn.title)).toEqual(["Office supplies"]);

    const prefix = await t.query(api.search.searchTransactions, {
      circleId: f.circleId,
      type: "all",
      status: "active",
      query: "coffee fi",
      ...firstPage(25),
    });
    expect(prefix.page.map((txn) => txn.title).sort()).toEqual(["Cafe", "Coffee beans"]);
  });

  it("returns an empty page for reversed date or amount ranges", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    mockCurrentUser.mockResolvedValue(f.owner);
    await t.run((ctx) => seedTransaction(ctx, f, { title: "Row", date: "2026-05-10" }));

    const reversedDates = await t.query(api.search.searchTransactions, {
      circleId: f.circleId,
      type: "all",
      status: "active",
      dateFrom: "2026-05-31",
      dateTo: "2026-05-01",
      ...firstPage(25),
    });
    expect(reversedDates.page).toEqual([]);

    const reversedAmount = await t.query(api.search.searchTransactions, {
      circleId: f.circleId,
      type: "all",
      status: "active",
      amountMin: 2_000,
      amountMax: 1_000,
      ...firstPage(25),
    });
    expect(reversedAmount.page).toEqual([]);
  });

  it("paginates sparse text matches across an unscoped date window", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    mockCurrentUser.mockResolvedValue(f.owner);
    await t.run((ctx) =>
      seedSparseSearchRows(ctx, f, {
        needle: "global",
        row: (index) => (index % 3 === 0 ? { status: "archived" } : {}),
      }),
    );

    const first = await t.query(api.search.searchTransactions, {
      circleId: f.circleId,
      type: "all",
      status: "all",
      dateFrom: "2026-06-01",
      dateTo: "2026-06-30",
      query: "global",
      ...firstPage(5),
    });
    expect(first.page).toHaveLength(5);
    expect(first.page.every((txn) => txn.title.includes("global"))).toBe(true);
    expect(first.isDone).toBe(false);

    const second = await t.query(api.search.searchTransactions, {
      circleId: f.circleId,
      type: "all",
      status: "all",
      dateFrom: "2026-06-01",
      dateTo: "2026-06-30",
      query: "global",
      paginationOpts: { numItems: 5, cursor: first.continueCursor },
    });
    expect([...first.page, ...second.page].map((txn) => txn.title).sort()).toEqual([
      "global 0",
      "global 10",
      "global 2",
      "global 4",
      "global 6",
      "global 8",
    ]);
    expect(second.isDone).toBe(true);
  });
});

describe("search options", () => {
  it("returns ledger options used in the selected month, including archived categories and removed members", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    const removed = await t.run((ctx) =>
      addMember(ctx, f.circleId, "removed@example.com", "Remy Removed", "removed"),
    );
    const archivedCategory = await t.run((ctx) =>
      makeCategory(ctx, f.circleId, {
        name: "Old Utilities",
        status: "archived",
        creatorUserId: f.owner._id,
      }),
    );
    mockCurrentUser.mockResolvedValue(f.owner);
    await t.run(async (ctx) => {
      await seedTransaction(ctx, f, {
        title: "Old bill",
        date: "2026-06-10",
        categoryIds: [archivedCategory],
        paidByMemberId: removed.memberId,
      });
      await seedTransaction(ctx, f, { title: "Other month", date: "2026-05-10" });
    });

    const options = await t.query(api.search.getLedgerFilterOptions, {
      circleId: f.circleId,
      month: "2026-06",
      type: "expense",
    });
    expect(options?.categories.map((category) => [category.name, category.status])).toEqual([
      ["Old Utilities", "archived"],
    ]);
    expect(options?.members.map((member) => [member.displayName, member.status])).toContainEqual([
      "Remy Removed",
      "removed",
    ]);
  });

  it("returns exhaustive search options for the whole circle", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    await t.run((ctx) =>
      addMember(ctx, f.circleId, "removed@example.com", "Remy Removed", "removed"),
    );
    await t.run((ctx) =>
      makeCategory(ctx, f.circleId, {
        name: "Old Utilities",
        status: "archived",
        creatorUserId: f.owner._id,
      }),
    );
    mockCurrentUser.mockResolvedValue(f.owner);

    const options = await t.query(api.search.getTransactionSearchOptions, {
      circleId: f.circleId,
      type: "all",
    });
    expect(options?.categories.map((category) => category.name)).toEqual([
      "Dining",
      "Groceries",
      "Old Utilities",
      "Salary",
    ]);
    expect(options?.members.map((member) => [member.displayName, member.status])).toContainEqual([
      "Remy Removed",
      "removed",
    ]);
  });

  it("returns null for inaccessible circles and remains readable for archived circles", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx, { archived: true }));
    const stranger = await t.run((ctx) => makeUser(ctx, "stranger@example.com", "Stranger"));
    mockCurrentUser.mockResolvedValue(stranger);
    expect(
      await t.query(api.search.getTransactionSearchOptions, {
        circleId: f.circleId,
        type: "all",
      }),
    ).toBeNull();

    mockCurrentUser.mockResolvedValue(f.owner);
    await t.run((ctx) =>
      seedTransaction(ctx, f, { title: "Archived circle row", date: "2026-06-10" }),
    );
    const result = await t.query(api.search.searchTransactions, {
      circleId: f.circleId,
      type: "all",
      status: "active",
      ...firstPage(25),
    });
    expect(result.page.map((txn) => txn.title)).toEqual(["Archived circle row"]);
  });
});
