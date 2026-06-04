import { currentMonth } from "@spend-circle/domain";
import { convexTest } from "convex-test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api.js";
import { RECENT_TRANSACTIONS_LIMIT } from "./dashboard.js";
import schema from "./schema.js";
import { addMember, makeUser, seedFixture, seedTransaction } from "./test/seed.js";

// getDashboard / getPaidByFilterOptions resolve access through guard.ts, which folds
// in `getCurrentUserOrNull` — backed by Better Auth and unrunnable under convex-test.
// We stub just that seam (as guard.test.ts does) and exercise the real handlers, db,
// indexes, totals math, and filter logic against the simulated backend.
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

describe("getDashboard — totals math", () => {
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

    const dashboard = await t.query(api.dashboard.getDashboard, {
      circleId: f.circleId,
      month: "2026-06",
    });
    expect(dashboard?.totals).toEqual({
      incomeMinor: 500_000,
      expenseMinor: 8_750,
      netMinor: 491_250,
    });
    expect(dashboard?.currency).toBe("USD");
    expect(dashboard?.month).toBe("2026-06");
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

    const dashboard = await t.query(api.dashboard.getDashboard, {
      circleId: f.circleId,
      month: "2026-06",
    });
    expect(dashboard?.totals).toEqual({
      incomeMinor: 2_000,
      expenseMinor: 9_000,
      netMinor: -7_000,
    });
  });

  it("returns zeros and an empty recent feed for a month with no transactions", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    mockCurrentUser.mockResolvedValue(f.owner);
    await t.run((ctx) => seedTransaction(ctx, f, { date: "2026-05-15" }));

    const dashboard = await t.query(api.dashboard.getDashboard, {
      circleId: f.circleId,
      month: "2026-07",
    });
    expect(dashboard?.totals).toEqual({ incomeMinor: 0, expenseMinor: 0, netMinor: 0 });
    expect(dashboard?.recent).toEqual([]);
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

    const dashboard = await t.query(api.dashboard.getDashboard, {
      circleId: f.circleId,
      month: "2026-06",
    });
    expect(dashboard?.totals).toEqual({ incomeMinor: 0, expenseMinor: 1_000, netMinor: -1_000 });
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

    const dashboard = await t.query(api.dashboard.getDashboard, {
      circleId: f.circleId,
      month: "2026-06",
    });
    expect(dashboard?.totals.expenseMinor).toBe(200);
  });

  it("defaults to the current month when month is omitted", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    mockCurrentUser.mockResolvedValue(f.owner);
    const now = currentMonth(new Date());
    await t.run(async (ctx) => {
      await seedTransaction(ctx, f, { amountMinorUnits: 333, date: `${now}-15` });
      await seedTransaction(ctx, f, { amountMinorUnits: 999, date: "2000-01-01" });
    });

    const dashboard = await t.query(api.dashboard.getDashboard, { circleId: f.circleId });
    expect(dashboard?.month).toBe(now);
    expect(dashboard?.totals.expenseMinor).toBe(333);
  });

  it("returns the Circle Currency for edge formatting", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx, { currency: "EUR" }));
    mockCurrentUser.mockResolvedValue(f.owner);
    const dashboard = await t.query(api.dashboard.getDashboard, {
      circleId: f.circleId,
      month: "2026-06",
    });
    expect(dashboard?.currency).toBe("EUR");
  });

  it("rejects a malformed month", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    mockCurrentUser.mockResolvedValue(f.owner);
    await expect(
      t.query(api.dashboard.getDashboard, { circleId: f.circleId, month: "2026-13" }),
    ).rejects.toThrow(/invalid month/i);
  });
});

describe("getDashboard — recent feed", () => {
  it("returns the latest active transactions by record time, newest first", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    mockCurrentUser.mockResolvedValue(f.owner);

    // Insert in a known record order; createdAt is set to Date.now() per insert, so
    // later inserts are more recent regardless of Transaction Date.
    await t.run(async (ctx) => {
      await seedTransaction(ctx, f, { title: "First recorded", date: "2026-06-20" });
      await seedTransaction(ctx, f, { title: "Second recorded", date: "2026-06-01" });
      await seedTransaction(ctx, f, { title: "Third recorded", date: "2026-06-10" });
    });

    const dashboard = await t.query(api.dashboard.getDashboard, {
      circleId: f.circleId,
      month: "2026-06",
    });
    // Record-time order (createdAt desc), NOT Transaction-Date order — a backfilled
    // older date still ranks recent if it was entered last.
    expect(dashboard?.recent.map((txn) => txn.title)).toEqual([
      "Third recorded",
      "Second recorded",
      "First recorded",
    ]);
  });

  it(`caps the recent feed at ${RECENT_TRANSACTIONS_LIMIT} while totals still sum the whole month`, async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    mockCurrentUser.mockResolvedValue(f.owner);
    await t.run(async (ctx) => {
      for (let i = 0; i < RECENT_TRANSACTIONS_LIMIT + 3; i++) {
        await seedTransaction(ctx, f, {
          title: `Txn ${i}`,
          amountMinorUnits: 100,
          date: `2026-06-${String(i + 1).padStart(2, "0")}`,
        });
      }
    });

    const dashboard = await t.query(api.dashboard.getDashboard, {
      circleId: f.circleId,
      month: "2026-06",
    });
    expect(dashboard?.recent).toHaveLength(RECENT_TRANSACTIONS_LIMIT);
    // Totals are the full month, not just the capped recent slice.
    expect(dashboard?.totals.expenseMinor).toBe((RECENT_TRANSACTIONS_LIMIT + 3) * 100);
  });

  it("excludes archived transactions from the recent feed", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    mockCurrentUser.mockResolvedValue(f.owner);
    await t.run(async (ctx) => {
      await seedTransaction(ctx, f, { title: "Active one", date: "2026-06-10" });
      await seedTransaction(ctx, f, {
        title: "Archived one",
        date: "2026-06-11",
        status: "archived",
      });
    });

    const dashboard = await t.query(api.dashboard.getDashboard, {
      circleId: f.circleId,
      month: "2026-06",
    });
    expect(dashboard?.recent.map((txn) => txn.title)).toEqual(["Active one"]);
  });

  it("resolves recent rows to full views with Paid By and Categories", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    const alex = await t.run((ctx) => addMember(ctx, f.circleId, "alex@example.com", "Alex"));
    mockCurrentUser.mockResolvedValue(f.owner);
    await t.run((ctx) =>
      seedTransaction(ctx, f, {
        title: "Dinner",
        date: "2026-06-10",
        paidByMemberId: alex.memberId,
        categoryIds: [f.diningId],
      }),
    );

    const dashboard = await t.query(api.dashboard.getDashboard, {
      circleId: f.circleId,
      month: "2026-06",
    });
    const row = dashboard?.recent[0];
    expect(row?.paidBy.displayName).toBe("Alex");
    expect(row?.categories.map((category) => category.name)).toEqual(["Dining"]);
  });
});

describe("getDashboard — Paid By filter (PRD 69)", () => {
  it("narrows totals AND recent to one member's transactions; default is everyone", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    const alex = await t.run((ctx) => addMember(ctx, f.circleId, "alex@example.com", "Alex"));
    mockCurrentUser.mockResolvedValue(f.owner);

    await t.run(async (ctx) => {
      await seedTransaction(ctx, f, {
        title: "Owner spend",
        amountMinorUnits: 1_000,
        date: "2026-06-05",
      });
      await seedTransaction(ctx, f, {
        title: "Alex spend",
        amountMinorUnits: 2_500,
        date: "2026-06-06",
        paidByMemberId: alex.memberId,
      });
    });

    const all = await t.query(api.dashboard.getDashboard, {
      circleId: f.circleId,
      month: "2026-06",
    });
    expect(all?.totals.expenseMinor).toBe(3_500);
    expect(all?.recent).toHaveLength(2);

    const onlyAlex = await t.query(api.dashboard.getDashboard, {
      circleId: f.circleId,
      month: "2026-06",
      paidByMemberId: alex.memberId,
    });
    expect(onlyAlex?.totals.expenseMinor).toBe(2_500);
    expect(onlyAlex?.recent.map((txn) => txn.title)).toEqual(["Alex spend"]);
  });

  it("filters to a Removed Member who is Paid By on matching transactions", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    const rae = await t.run((ctx) =>
      addMember(ctx, f.circleId, "rae@example.com", "Rae Removed", "removed"),
    );
    mockCurrentUser.mockResolvedValue(f.owner);
    await t.run(async (ctx) => {
      await seedTransaction(ctx, f, {
        title: "Owner spend",
        amountMinorUnits: 1_000,
        date: "2026-06-05",
      });
      await seedTransaction(ctx, f, {
        title: "Rae spend",
        amountMinorUnits: 4_200,
        date: "2026-06-06",
        paidByMemberId: rae.memberId,
      });
    });

    const dashboard = await t.query(api.dashboard.getDashboard, {
      circleId: f.circleId,
      month: "2026-06",
      paidByMemberId: rae.memberId,
    });
    expect(dashboard?.totals.expenseMinor).toBe(4_200);
    expect(dashboard?.recent.map((txn) => txn.title)).toEqual(["Rae spend"]);
  });

  it("returns zeros for a member id that names no member of this circle", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    const other = await t.run((ctx) => seedFixture(ctx, { currency: "EUR" }));
    mockCurrentUser.mockResolvedValue(f.owner);
    await t.run((ctx) => seedTransaction(ctx, f, { amountMinorUnits: 1_000, date: "2026-06-05" }));

    const dashboard = await t.query(api.dashboard.getDashboard, {
      circleId: f.circleId,
      month: "2026-06",
      paidByMemberId: other.ownerMemberId,
    });
    expect(dashboard?.totals).toEqual({ incomeMinor: 0, expenseMinor: 0, netMinor: 0 });
    expect(dashboard?.recent).toEqual([]);
  });
});

describe("getDashboard — isolation & access (ADR 0016)", () => {
  it("never includes a transaction from another Circle", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    const other = await t.run((ctx) => seedFixture(ctx, { currency: "EUR" }));
    mockCurrentUser.mockResolvedValue(f.owner);
    await t.run(async (ctx) => {
      await seedTransaction(ctx, f, { amountMinorUnits: 100, date: "2026-06-05" });
      await seedTransaction(ctx, other, { amountMinorUnits: 9_999, date: "2026-06-05" });
    });

    const dashboard = await t.query(api.dashboard.getDashboard, {
      circleId: f.circleId,
      month: "2026-06",
    });
    expect(dashboard?.totals.expenseMinor).toBe(100);
    expect(dashboard?.recent).toHaveLength(1);
  });

  it("returns null for a non-member", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    const stranger = await t.run((ctx) => makeUser(ctx, "s@example.com", "Sam Stranger"));
    mockCurrentUser.mockResolvedValue(stranger);
    const dashboard = await t.query(api.dashboard.getDashboard, {
      circleId: f.circleId,
      month: "2026-06",
    });
    expect(dashboard).toBeNull();
  });

  it("returns null for a removed member", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    const removed = await t.run((ctx) =>
      addMember(ctx, f.circleId, "r@example.com", "Rae Removed", "removed"),
    );
    mockCurrentUser.mockResolvedValue(removed.user);
    const dashboard = await t.query(api.dashboard.getDashboard, {
      circleId: f.circleId,
      month: "2026-06",
    });
    expect(dashboard).toBeNull();
  });

  it("returns null for an unauthenticated caller", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    mockCurrentUser.mockResolvedValue(null);
    const dashboard = await t.query(api.dashboard.getDashboard, {
      circleId: f.circleId,
      month: "2026-06",
    });
    expect(dashboard).toBeNull();
  });

  it("is readable (view-only) for a member of an archived Circle", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx, { archived: true }));
    mockCurrentUser.mockResolvedValue(f.owner);
    await t.run((ctx) => seedTransaction(ctx, f, { amountMinorUnits: 5_000, date: "2026-06-09" }));

    const dashboard = await t.query(api.dashboard.getDashboard, {
      circleId: f.circleId,
      month: "2026-06",
    });
    expect(dashboard?.totals.expenseMinor).toBe(5_000);
  });

  it("reflects a transaction archived live: it drops out of totals and recent", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    mockCurrentUser.mockResolvedValue(f.owner);
    const txnId = await t.run((ctx) =>
      seedTransaction(ctx, f, { amountMinorUnits: 1_000, date: "2026-06-10" }),
    );

    const before = await t.query(api.dashboard.getDashboard, {
      circleId: f.circleId,
      month: "2026-06",
    });
    expect(before?.totals.expenseMinor).toBe(1_000);

    await t.run((ctx) => ctx.db.patch(txnId, { status: "archived" }));

    const after = await t.query(api.dashboard.getDashboard, {
      circleId: f.circleId,
      month: "2026-06",
    });
    expect(after?.totals.expenseMinor).toBe(0);
    expect(after?.recent).toEqual([]);
  });
});

describe("getPaidByFilterOptions", () => {
  it("returns current members (owner first) by default", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    await t.run((ctx) => addMember(ctx, f.circleId, "alex@example.com", "Alex"));
    mockCurrentUser.mockResolvedValue(f.owner);

    const options = await t.query(api.dashboard.getPaidByFilterOptions, { circleId: f.circleId });
    expect(options?.map((member) => member.displayName)).toEqual(["Olive Owner", "Alex"]);
    expect(options?.every((member) => member.status === "active")).toBe(true);
  });

  it("includes a Removed Member who is Paid By on an active transaction", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    const rae = await t.run((ctx) =>
      addMember(ctx, f.circleId, "rae@example.com", "Rae Removed", "removed"),
    );
    mockCurrentUser.mockResolvedValue(f.owner);
    await t.run((ctx) =>
      seedTransaction(ctx, f, { date: "2026-06-06", paidByMemberId: rae.memberId }),
    );

    const options = await t.query(api.dashboard.getPaidByFilterOptions, { circleId: f.circleId });
    const rae_option = options?.find((member) => member.displayName === "Rae Removed");
    expect(rae_option?.status).toBe("removed");
    // Current member precedes the removed option.
    expect(options?.map((member) => member.displayName)).toEqual(["Olive Owner", "Rae Removed"]);
  });

  it("omits a Removed Member with no matching active transaction", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    await t.run((ctx) => addMember(ctx, f.circleId, "rae@example.com", "Rae Removed", "removed"));
    mockCurrentUser.mockResolvedValue(f.owner);

    const options = await t.query(api.dashboard.getPaidByFilterOptions, { circleId: f.circleId });
    expect(options?.map((member) => member.displayName)).toEqual(["Olive Owner"]);
  });

  it("omits a Removed Member whose only Paid By transaction is archived", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    const rae = await t.run((ctx) =>
      addMember(ctx, f.circleId, "rae@example.com", "Rae Removed", "removed"),
    );
    mockCurrentUser.mockResolvedValue(f.owner);
    await t.run((ctx) =>
      seedTransaction(ctx, f, {
        date: "2026-06-06",
        paidByMemberId: rae.memberId,
        status: "archived",
      }),
    );

    const options = await t.query(api.dashboard.getPaidByFilterOptions, { circleId: f.circleId });
    expect(options?.map((member) => member.displayName)).toEqual(["Olive Owner"]);
  });

  it("does not offer a Removed Member who is only Paid By in another Circle", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    const other = await t.run((ctx) => seedFixture(ctx, { currency: "EUR" }));
    const rae = await t.run((ctx) =>
      addMember(ctx, f.circleId, "rae@example.com", "Rae Removed", "removed"),
    );
    mockCurrentUser.mockResolvedValue(f.owner);
    // Rae is Paid By on an active txn, but in the OTHER circle — must not surface here.
    await t.run((ctx) =>
      seedTransaction(ctx, other, { date: "2026-06-06", paidByMemberId: rae.memberId }),
    );

    const options = await t.query(api.dashboard.getPaidByFilterOptions, { circleId: f.circleId });
    expect(options?.map((member) => member.displayName)).toEqual(["Olive Owner"]);
  });

  it("returns null for a non-member (anti-enumeration)", async () => {
    const t = convexTest(schema, modules);
    const f = await t.run((ctx) => seedFixture(ctx));
    const stranger = await t.run((ctx) => makeUser(ctx, "s@example.com", "Sam Stranger"));
    mockCurrentUser.mockResolvedValue(stranger);
    const options = await t.query(api.dashboard.getPaidByFilterOptions, { circleId: f.circleId });
    expect(options).toBeNull();
  });
});
