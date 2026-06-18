import type { Doc, Id } from "../_generated/dataModel.js";
import type { MutationCtx } from "../_generated/server.js";
import {
  syncTransactionSearchDocument,
  transactionSearchBackfillKey,
} from "../transactionSearchDocuments.js";

/**
 * Shared convex-test seeding (CLAUDE.md: one helper, not copy-pasted scaffolding
 * per test file). These insert rows directly through `ctx.db` so a test controls
 * the exact backend state — actor, lifecycle, dates, categories — without routing
 * through a mutation. They depend on nothing test-framework-specific (no `vi`, no
 * auth mock), so each test file still declares its own `vi.mock("./auth.js")` and
 * `import.meta.glob` (both must be hoisted/local) and shares only the row builders.
 *
 * This lives under `convex/test/` rather than a `.test.ts` file so Vitest does not
 * treat it as a suite; it registers no Convex `query`/`mutation`, so it is inert in
 * the deployed app.
 */

/** First-page pagination opts for a `paginate`d query (cursor reset). */
export const firstPage = (size: number) => ({ paginationOpts: { numItems: size, cursor: null } });

/** Args for {@link api.search.searchTransactions} numbered URL pages (#97). */
export const searchTransactionPage = (page: number, pageSize: number) => ({ page, pageSize });

export async function makeUser(
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
    onboardingCompletedAt: now,
    createdAt: now,
  });
  const user = await ctx.db.get(userId);
  if (!user) {
    throw new Error("seed failed");
  }
  return user;
}

export interface Seed {
  owner: Doc<"users">;
  ownerMemberId: Id<"members">;
  circleId: Id<"circles">;
}

/** Seeds an active regular Circle with an owner Member. */
export async function seedCircle(
  ctx: MutationCtx,
  opts: {
    archived?: boolean;
    kind?: "personal" | "regular";
    color?: string;
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
    color: opts.color ?? "blue",
    mark: "T",
    ownerUserId: owner._id,
    status: opts.archived ? "archived" : "active",
    setupCompletedAt: null,
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
export async function addMember(
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
export async function makeCategory(
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

export interface Fixture extends Seed {
  groceriesId: Id<"categories">;
  diningId: Id<"categories">;
  salaryId: Id<"categories">;
}

/** A Circle with the owner, a few categories of both types (active Member added per test). */
export async function seedFixture(
  ctx: MutationCtx,
  opts: { currency?: string; archived?: boolean } = {},
): Promise<Fixture> {
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

/**
 * Inserts an active Transaction + its Category links directly, so tests control
 * `recordedBy`/`paidBy`/type/status/date/categories precisely without juggling the
 * create mutation's actor. Defaults: an expense recorded by the owner, categorized
 * Groceries, dated 2026-05-15.
 */
export async function seedTransaction(
  ctx: MutationCtx,
  f: Fixture,
  opts: {
    type?: "expense" | "income";
    title?: string;
    note?: string;
    amountMinorUnits?: number;
    date?: string;
    recordedByMemberId?: Id<"members">;
    paidByMemberId?: Id<"members">;
    categoryIds?: Id<"categories">[];
    status?: "active" | "archived";
  } = {},
): Promise<Id<"transactions">> {
  const now = Date.now();
  const recordedByMemberId = opts.recordedByMemberId ?? f.ownerMemberId;
  const date = opts.date ?? "2026-05-15";
  const status = opts.status ?? "active";
  const transactionId = await ctx.db.insert("transactions", {
    circleId: f.circleId,
    type: opts.type ?? "expense",
    title: opts.title ?? "Weekly shop",
    ...(opts.note ? { note: opts.note } : {}),
    amountMinorUnits: opts.amountMinorUnits ?? 1250,
    date,
    month: date.slice(0, 7),
    recordedByMemberId,
    paidByMemberId: opts.paidByMemberId ?? recordedByMemberId,
    status,
    createdAt: now,
    updatedAt: now,
    ...(status === "archived" ? { archivedAt: now } : {}),
  });
  for (const categoryId of opts.categoryIds ?? [f.groceriesId]) {
    await ctx.db.insert("transactionCategories", {
      circleId: f.circleId,
      transactionId,
      categoryId,
    });
  }
  const txn = await ctx.db.get(transactionId);
  if (!txn) {
    throw new Error("seed failed");
  }
  await syncTransactionSearchDocument(ctx, txn, {
    categoryIds: opts.categoryIds ?? [f.groceriesId],
  });
  return transactionId;
}

export async function markTransactionSearchBackfillComplete(ctx: MutationCtx) {
  const existing = await ctx.db
    .query("transactionSearchBackfills")
    .withIndex("by_key", (q) => q.eq("key", transactionSearchBackfillKey))
    .unique();
  const now = Date.now();
  const status: Doc<"transactionSearchBackfills">["status"] = "complete";
  const fields = {
    status,
    scanned: 0,
    synced: 0,
    updatedAt: now,
    completedAt: now,
  };
  if (existing) {
    await ctx.db.patch(existing._id, fields);
    return;
  }
  await ctx.db.insert("transactionSearchBackfills", {
    key: transactionSearchBackfillKey,
    ...fields,
  });
}
