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

describe("searchTransactions — filters", () => {
  it("defaults to the selected month and matches title, note, category name, and member names", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    const alex = await t.run((ctx) => addMember(ctx, f.circleId, "alex@example.com", "Alex Paid"));
    mockCurrentUser.mockResolvedValue(f.owner);
    await t.run(async (ctx) => {
      await seedTransaction(ctx, f, {
        title: "Hardware run",
        note: "paint and screws",
        date: "2026-06-10",
        paidByMemberId: alex.memberId,
      });
      await seedTransaction(ctx, f, {
        title: "May hardware",
        note: "paint",
        date: "2026-05-10",
      });
      await seedTransaction(ctx, f, {
        title: "Dinner",
        note: "with Alex",
        date: "2026-06-11",
        categoryIds: [f.diningId],
      });
    });

    const title = await t.query(api.search.searchTransactions, {
      circleId: f.circleId,
      scope: "month",
      month: "2026-06",
      query: "hardware",
      ...firstPage(25),
    });
    expect(title.page.map((txn) => txn.title)).toEqual(["Hardware run"]);

    const note = await t.query(api.search.searchTransactions, {
      circleId: f.circleId,
      scope: "month",
      month: "2026-06",
      query: "paint",
      ...firstPage(25),
    });
    expect(note.page.map((txn) => txn.title)).toEqual(["Hardware run"]);

    const category = await t.query(api.search.searchTransactions, {
      circleId: f.circleId,
      scope: "month",
      month: "2026-06",
      query: "dining",
      ...firstPage(25),
    });
    expect(category.page.map((txn) => txn.title)).toEqual(["Dinner"]);

    const paidBy = await t.query(api.search.searchTransactions, {
      circleId: f.circleId,
      scope: "month",
      month: "2026-06",
      query: "alex",
      ...firstPage(25),
    });
    expect(paidBy.page.map((txn) => txn.title)).toEqual(["Dinner", "Hardware run"]);
  });

  it("AND-combines type, category, recorded by, paid by, range, and amount filters", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    const recorder = await t.run((ctx) =>
      addMember(ctx, f.circleId, "recorder@example.com", "Rae Recorder"),
    );
    const payer = await t.run((ctx) => addMember(ctx, f.circleId, "payer@example.com", "Pia Paid"));
    mockCurrentUser.mockResolvedValue(f.owner);
    await t.run(async (ctx) => {
      await seedTransaction(ctx, f, {
        title: "Match",
        type: "expense",
        amountMinorUnits: 5_500,
        date: "2026-06-15",
        categoryIds: [f.groceriesId],
        recordedByMemberId: recorder.memberId,
        paidByMemberId: payer.memberId,
      });
      await seedTransaction(ctx, f, {
        title: "Wrong amount",
        amountMinorUnits: 9_000,
        date: "2026-06-15",
        recordedByMemberId: recorder.memberId,
        paidByMemberId: payer.memberId,
      });
      await seedTransaction(ctx, f, {
        title: "Wrong category",
        amountMinorUnits: 5_500,
        date: "2026-06-15",
        categoryIds: [f.diningId],
        recordedByMemberId: recorder.memberId,
        paidByMemberId: payer.memberId,
      });
    });

    const result = await t.query(api.search.searchTransactions, {
      circleId: f.circleId,
      scope: "range",
      dateFrom: "2026-06-01",
      dateTo: "2026-06-30",
      type: "expense",
      categoryIds: [f.groceriesId],
      recordedByMemberId: recorder.memberId,
      paidByMemberId: payer.memberId,
      amountMin: 5_000,
      amountMax: 6_000,
      ...firstPage(25),
    });
    expect(result.page.map((txn) => txn.title)).toEqual(["Match"]);
  });

  it("supports inclusive date ranges and all-time scope", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    mockCurrentUser.mockResolvedValue(f.owner);
    await t.run(async (ctx) => {
      await seedTransaction(ctx, f, { title: "Start", date: "2026-05-01" });
      await seedTransaction(ctx, f, { title: "Middle", date: "2026-05-15" });
      await seedTransaction(ctx, f, { title: "End", date: "2026-05-31" });
      await seedTransaction(ctx, f, { title: "Outside", date: "2026-06-01" });
    });

    const range = await t.query(api.search.searchTransactions, {
      circleId: f.circleId,
      scope: "range",
      dateFrom: "2026-05-01",
      dateTo: "2026-05-31",
      ...firstPage(25),
    });
    expect(range.page.map((txn) => txn.title)).toEqual(["End", "Middle", "Start"]);

    const all = await t.query(api.search.searchTransactions, {
      circleId: f.circleId,
      scope: "all",
      query: "outside",
      ...firstPage(25),
    });
    expect(all.page.map((txn) => txn.title)).toEqual(["Outside"]);
  });

  it("excludes archived transactions by default and returns only archived with the archive filter", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    mockCurrentUser.mockResolvedValue(f.owner);
    await t.run(async (ctx) => {
      await seedTransaction(ctx, f, { title: "Active receipt", date: "2026-06-10" });
      await seedTransaction(ctx, f, {
        title: "Archived receipt",
        date: "2026-06-11",
        status: "archived",
      });
    });

    const normal = await t.query(api.search.searchTransactions, {
      circleId: f.circleId,
      scope: "month",
      month: "2026-06",
      query: "receipt",
      ...firstPage(25),
    });
    expect(normal.page.map((txn) => txn.title)).toEqual(["Active receipt"]);

    const archived = await t.query(api.search.searchTransactions, {
      circleId: f.circleId,
      scope: "month",
      month: "2026-06",
      query: "receipt",
      archivedOnly: true,
      ...firstPage(25),
    });
    expect(archived.page.map((txn) => txn.title)).toEqual(["Archived receipt"]);
  });

  it("paginates the indexed source for all-time searches", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    mockCurrentUser.mockResolvedValue(f.owner);
    await t.run(async (ctx) => {
      for (const date of ["2026-05-01", "2026-05-02", "2026-05-03"]) {
        await seedTransaction(ctx, f, { title: `Txn ${date}`, date });
      }
    });

    const page1 = await t.query(api.search.searchTransactions, {
      circleId: f.circleId,
      scope: "all",
      ...firstPage(2),
    });
    expect(page1.page.map((txn) => txn.title)).toEqual(["Txn 2026-05-03", "Txn 2026-05-02"]);
    expect(page1.isDone).toBe(false);

    const page2 = await t.query(api.search.searchTransactions, {
      circleId: f.circleId,
      scope: "all",
      paginationOpts: { numItems: 2, cursor: page1.continueCursor },
    });
    expect(page2.page.map((txn) => txn.title)).toEqual(["Txn 2026-05-01"]);
    expect(page2.isDone).toBe(true);
  });

  it("fills a result page past newer source rows that filters drop", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    mockCurrentUser.mockResolvedValue(f.owner);
    await t.run(async (ctx) => {
      await seedTransaction(ctx, f, { title: "Newest miss", date: "2026-05-03" });
      await seedTransaction(ctx, f, { title: "Middle miss", date: "2026-05-02" });
      await seedTransaction(ctx, f, { title: "Needle match", date: "2026-05-01" });
    });

    const page = await t.query(api.search.searchTransactions, {
      circleId: f.circleId,
      scope: "all",
      query: "needle",
      ...firstPage(1),
    });

    expect(page.page.map((txn) => txn.title)).toEqual(["Needle match"]);
    expect(page.isDone).toBe(true);
  });
});

describe("getTransactionSearchMeta", () => {
  it("returns exact totals and filter options including archived categories and removed members with matching transactions", async () => {
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
        amountMinorUnits: 4_000,
        date: "2026-06-10",
        categoryIds: [archivedCategory],
        recordedByMemberId: removed.memberId,
        paidByMemberId: removed.memberId,
      });
      await seedTransaction(ctx, f, {
        title: "Income",
        type: "income",
        amountMinorUnits: 10_000,
        date: "2026-06-11",
        categoryIds: [f.salaryId],
      });
    });

    const meta = await t.query(api.search.getTransactionSearchMeta, {
      circleId: f.circleId,
      scope: "month",
      month: "2026-06",
    });
    expect(meta?.totals).toEqual({ incomeMinor: 10_000, expenseMinor: 4_000, netMinor: 6_000 });
    expect(meta?.totalCount).toBe(2);
    expect(meta?.exact).toBe(true);
    expect(meta?.categories.map((category) => category.name)).toEqual([
      "Dining",
      "Groceries",
      "Old Utilities",
      "Salary",
    ]);
    expect(meta?.recordedBy.map((member) => [member.displayName, member.status])).toContainEqual([
      "Remy Removed",
      "removed",
    ]);
    expect(meta?.paidBy.map((member) => [member.displayName, member.status])).toContainEqual([
      "Remy Removed",
      "removed",
    ]);
  });

  it("keeps category options stable while a category filter is selected", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    mockCurrentUser.mockResolvedValue(f.owner);
    await t.run(async (ctx) => {
      await seedTransaction(ctx, f, {
        title: "Groceries row",
        type: "expense",
        date: "2026-06-10",
        categoryIds: [f.groceriesId],
      });
      await seedTransaction(ctx, f, {
        title: "Dining row",
        type: "expense",
        date: "2026-06-11",
        categoryIds: [f.diningId],
      });
    });

    const meta = await t.query(api.search.getTransactionSearchMeta, {
      circleId: f.circleId,
      scope: "month",
      month: "2026-06",
      type: "expense",
      categoryIds: [f.groceriesId],
    });

    expect(meta?.totalCount).toBe(1);
    expect(meta?.categories.map((category) => category.name)).toEqual(["Dining", "Groceries"]);
  });

  it("returns null for inaccessible circles and is readable for archived circles", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx, { archived: true }));
    const stranger = await t.run((ctx) => makeUser(ctx, "stranger@example.com", "Stranger"));
    mockCurrentUser.mockResolvedValue(stranger);
    expect(
      await t.query(api.search.getTransactionSearchMeta, {
        circleId: f.circleId,
        scope: "month",
        month: "2026-06",
      }),
    ).toBeNull();

    mockCurrentUser.mockResolvedValue(f.owner);
    await t.run((ctx) =>
      seedTransaction(ctx, f, { title: "Archived circle row", date: "2026-06-10" }),
    );
    const meta = await t.query(api.search.getTransactionSearchMeta, {
      circleId: f.circleId,
      scope: "month",
      month: "2026-06",
    });
    expect(meta?.totalCount).toBe(1);
  });
});
