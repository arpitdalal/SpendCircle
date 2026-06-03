import { convexTest } from "convex-test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api.js";
import schema from "./schema.js";
import { addMember, firstPage, makeUser, seedFixture, seedTransaction } from "./test/seed.js";

// getMonthlyLedger / listTransactions resolve access through guard.ts, which folds
// in `getCurrentUserOrNull` — backed by Better Auth and unrunnable under
// convex-test. We stub just that seam (as guard.test.ts does) and exercise the real
// handlers, db, indexes, and totals math against the simulated backend.
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

describe("getMonthlyLedger — totals math", () => {
  it("sums income/expense and computes net in minor units for the selected month", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    mockCurrentUser.mockResolvedValue(f.owner);

    await t.run(async (ctx) => {
      await seedTransaction(ctx, f, {
        type: "income",
        amountMinorUnits: 500_000,
        date: "2026-06-05",
        categoryIds: [f.salaryId],
      });
      await seedTransaction(ctx, f, { amountMinorUnits: 1250, date: "2026-06-10" });
      await seedTransaction(ctx, f, {
        amountMinorUnits: 7500,
        date: "2026-06-20",
        categoryIds: [f.diningId],
      });
    });

    const ledger = await t.query(api.ledger.getMonthlyLedger, {
      circleId: f.circleId,
      month: "2026-06",
    });
    expect(ledger?.totals).toEqual({
      incomeMinor: 500_000,
      expenseMinor: 8_750,
      netMinor: 491_250,
    });
    expect(ledger?.currency).toBe("USD");
  });

  it("returns a negative net when expenses exceed income", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    mockCurrentUser.mockResolvedValue(f.owner);

    await t.run(async (ctx) => {
      await seedTransaction(ctx, f, {
        type: "income",
        amountMinorUnits: 2_000,
        date: "2026-06-01",
        categoryIds: [f.salaryId],
      });
      await seedTransaction(ctx, f, { amountMinorUnits: 9_000, date: "2026-06-02" });
    });

    const ledger = await t.query(api.ledger.getMonthlyLedger, {
      circleId: f.circleId,
      month: "2026-06",
    });
    expect(ledger?.totals).toEqual({ incomeMinor: 2_000, expenseMinor: 9_000, netMinor: -7_000 });
  });

  it("returns zeros for a month with no transactions", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    mockCurrentUser.mockResolvedValue(f.owner);
    await t.run((ctx) => seedTransaction(ctx, f, { date: "2026-05-15" }));

    const ledger = await t.query(api.ledger.getMonthlyLedger, {
      circleId: f.circleId,
      month: "2026-07",
    });
    expect(ledger?.totals).toEqual({ incomeMinor: 0, expenseMinor: 0, netMinor: 0 });
  });

  it("excludes archived transactions from totals (TXN-3 contract)", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    mockCurrentUser.mockResolvedValue(f.owner);
    await t.run(async (ctx) => {
      await seedTransaction(ctx, f, { amountMinorUnits: 1_000, date: "2026-06-10" });
      await seedTransaction(ctx, f, {
        amountMinorUnits: 9_999,
        date: "2026-06-11",
        status: "archived",
      });
    });

    const ledger = await t.query(api.ledger.getMonthlyLedger, {
      circleId: f.circleId,
      month: "2026-06",
    });
    expect(ledger?.totals).toEqual({ incomeMinor: 0, expenseMinor: 1_000, netMinor: -1_000 });
  });

  it("counts only the selected month, ignoring neighbouring months", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    mockCurrentUser.mockResolvedValue(f.owner);
    await t.run(async (ctx) => {
      await seedTransaction(ctx, f, { amountMinorUnits: 100, date: "2026-05-31" });
      await seedTransaction(ctx, f, { amountMinorUnits: 200, date: "2026-06-15" });
      await seedTransaction(ctx, f, { amountMinorUnits: 400, date: "2026-07-01" });
    });

    const ledger = await t.query(api.ledger.getMonthlyLedger, {
      circleId: f.circleId,
      month: "2026-06",
    });
    expect(ledger?.totals.expenseMinor).toBe(200);
  });

  it("buckets month-boundary dates by their plain date with no timezone drift", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    mockCurrentUser.mockResolvedValue(f.owner);
    // First and last day of June, plus the first day of July — the drift-prone edges.
    await t.run(async (ctx) => {
      await seedTransaction(ctx, f, { amountMinorUnits: 11, date: "2026-06-01" });
      await seedTransaction(ctx, f, { amountMinorUnits: 22, date: "2026-06-30" });
      await seedTransaction(ctx, f, { amountMinorUnits: 44, date: "2026-07-01" });
    });

    const june = await t.query(api.ledger.getMonthlyLedger, {
      circleId: f.circleId,
      month: "2026-06",
    });
    const july = await t.query(api.ledger.getMonthlyLedger, {
      circleId: f.circleId,
      month: "2026-07",
    });
    expect(june?.totals.expenseMinor).toBe(33); // both June edges, not July
    expect(july?.totals.expenseMinor).toBe(44);
  });

  it("buckets a December/January year boundary into the right months", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    mockCurrentUser.mockResolvedValue(f.owner);
    await t.run(async (ctx) => {
      await seedTransaction(ctx, f, { amountMinorUnits: 1_200, date: "2026-12-31" });
      await seedTransaction(ctx, f, { amountMinorUnits: 3_400, date: "2027-01-01" });
    });

    const dec = await t.query(api.ledger.getMonthlyLedger, {
      circleId: f.circleId,
      month: "2026-12",
    });
    const jan = await t.query(api.ledger.getMonthlyLedger, {
      circleId: f.circleId,
      month: "2027-01",
    });
    expect(dec?.totals.expenseMinor).toBe(1_200);
    expect(jan?.totals.expenseMinor).toBe(3_400);
  });

  it("returns the Circle Currency for edge formatting", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx, { currency: "EUR" }));
    mockCurrentUser.mockResolvedValue(f.owner);
    const ledger = await t.query(api.ledger.getMonthlyLedger, {
      circleId: f.circleId,
      month: "2026-06",
    });
    expect(ledger?.currency).toBe("EUR");
  });

  it("rejects a malformed month", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    mockCurrentUser.mockResolvedValue(f.owner);
    await expect(
      t.query(api.ledger.getMonthlyLedger, { circleId: f.circleId, month: "2026-13" }),
    ).rejects.toThrow(/invalid month/i);
  });
});

describe("getMonthlyLedger — access (anti-enumeration, ADR 0016)", () => {
  it("returns null for a non-member", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    const stranger = await t.run((ctx) => makeUser(ctx, "s@example.com", "Sam Stranger"));
    mockCurrentUser.mockResolvedValue(stranger);
    const ledger = await t.query(api.ledger.getMonthlyLedger, {
      circleId: f.circleId,
      month: "2026-06",
    });
    expect(ledger).toBeNull();
  });

  it("returns null for a removed member", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    const removed = await t.run((ctx) =>
      addMember(ctx, f.circleId, "r@example.com", "Rae Removed", "removed"),
    );
    mockCurrentUser.mockResolvedValue(removed.user);
    const ledger = await t.query(api.ledger.getMonthlyLedger, {
      circleId: f.circleId,
      month: "2026-06",
    });
    expect(ledger).toBeNull();
  });

  it("returns null for an unauthenticated caller", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    mockCurrentUser.mockResolvedValue(null);
    const ledger = await t.query(api.ledger.getMonthlyLedger, {
      circleId: f.circleId,
      month: "2026-06",
    });
    expect(ledger).toBeNull();
  });

  it("is readable (view-only) for a member of an archived Circle", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx, { archived: true }));
    mockCurrentUser.mockResolvedValue(f.owner);
    await t.run((ctx) => seedTransaction(ctx, f, { amountMinorUnits: 5_000, date: "2026-06-09" }));

    const ledger = await t.query(api.ledger.getMonthlyLedger, {
      circleId: f.circleId,
      month: "2026-06",
    });
    expect(ledger?.totals.expenseMinor).toBe(5_000);
  });
});

describe("listTransactions — month scope (Monthly Ledger list)", () => {
  it("scopes the page to the requested month", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    mockCurrentUser.mockResolvedValue(f.owner);
    await t.run(async (ctx) => {
      await seedTransaction(ctx, f, { title: "May one", date: "2026-05-20" });
      await seedTransaction(ctx, f, { title: "June one", date: "2026-06-03" });
      await seedTransaction(ctx, f, { title: "June two", date: "2026-06-25" });
    });

    const result = await t.query(api.transactions.listTransactions, {
      circleId: f.circleId,
      month: "2026-06",
      ...firstPage(25),
    });
    expect(result.page.map((txn) => txn.title)).toEqual(["June two", "June one"]);
  });

  it("orders a month date desc, then created-at desc within a date", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    mockCurrentUser.mockResolvedValue(f.owner);
    await t.run(async (ctx) => {
      await seedTransaction(ctx, f, { title: "Early same-day", date: "2026-06-10" });
      await seedTransaction(ctx, f, { title: "Late same-day", date: "2026-06-10" });
      await seedTransaction(ctx, f, { title: "Later date", date: "2026-06-12" });
    });

    const result = await t.query(api.transactions.listTransactions, {
      circleId: f.circleId,
      month: "2026-06",
      ...firstPage(25),
    });
    expect(result.page.map((txn) => txn.title)).toEqual([
      "Later date",
      "Late same-day",
      "Early same-day",
    ]);
  });

  it("excludes archived transactions from the month list", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    mockCurrentUser.mockResolvedValue(f.owner);
    await t.run(async (ctx) => {
      await seedTransaction(ctx, f, { title: "Active", date: "2026-06-10" });
      await seedTransaction(ctx, f, { title: "Archived", date: "2026-06-11", status: "archived" });
    });

    const result = await t.query(api.transactions.listTransactions, {
      circleId: f.circleId,
      month: "2026-06",
      ...firstPage(25),
    });
    expect(result.page.map((txn) => txn.title)).toEqual(["Active"]);
  });

  it("paginates within a month: bounded page, then the next via the cursor", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    mockCurrentUser.mockResolvedValue(f.owner);
    await t.run(async (ctx) => {
      for (const date of ["2026-06-01", "2026-06-02", "2026-06-03"]) {
        await seedTransaction(ctx, f, { title: `Txn ${date}`, date });
      }
    });

    const page1 = await t.query(api.transactions.listTransactions, {
      circleId: f.circleId,
      month: "2026-06",
      ...firstPage(2),
    });
    expect(page1.page.map((txn) => txn.title)).toEqual(["Txn 2026-06-03", "Txn 2026-06-02"]);
    expect(page1.isDone).toBe(false);

    const page2 = await t.query(api.transactions.listTransactions, {
      circleId: f.circleId,
      month: "2026-06",
      paginationOpts: { numItems: 2, cursor: page1.continueCursor },
    });
    expect(page2.page.map((txn) => txn.title)).toEqual(["Txn 2026-06-01"]);
    expect(page2.isDone).toBe(true);
  });

  it("keeps a December month list off the neighbouring January", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    mockCurrentUser.mockResolvedValue(f.owner);
    await t.run(async (ctx) => {
      await seedTransaction(ctx, f, { title: "Dec", date: "2026-12-31" });
      await seedTransaction(ctx, f, { title: "Jan", date: "2027-01-01" });
    });

    const result = await t.query(api.transactions.listTransactions, {
      circleId: f.circleId,
      month: "2026-12",
      ...firstPage(25),
    });
    expect(result.page.map((txn) => txn.title)).toEqual(["Dec"]);
  });

  it("rejects a malformed month", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    mockCurrentUser.mockResolvedValue(f.owner);
    await expect(
      t.query(api.transactions.listTransactions, {
        circleId: f.circleId,
        month: "nope",
        ...firstPage(25),
      }),
    ).rejects.toThrow(/invalid month/i);
  });
});
