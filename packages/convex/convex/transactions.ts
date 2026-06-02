import {
  formatMinorUnits,
  monthOf,
  toCurrencyCode,
  transactionCreateSchema,
} from "@spend-circle/domain";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel.js";
import { type QueryCtx, mutation, query } from "./_generated/server.js";
import { requireCircleAccess, resolveCircleAccess } from "./guard.js";
import { recordEvent, transactionEntity } from "./history.js";

const transactionType = v.union(v.literal("expense"), v.literal("income"));

interface MemberRef {
  displayName: string;
  image?: string;
}
interface CategoryRef {
  id: Id<"categories">;
  name: string;
  color: string;
}

/**
 * Per-query lookup caches. A Transaction list repeats the same Paid By / Recorded
 * By Member and the same Categories across many rows, so resolving each id once
 * and reusing it collapses the otherwise-N+1 reads in {@link toTransactionView}.
 * Scoped to a single query call — never shared across requests.
 */
interface ViewCaches {
  members: Map<Id<"members">, MemberRef>;
  categories: Map<Id<"categories">, CategoryRef | null>;
}

function newViewCaches(): ViewCaches {
  return { members: new Map(), categories: new Map() };
}

/**
 * Resolves a Member's materialized identity (Display Name + image) for display,
 * memoized per query. Reads the frozen-on-removal `members` row directly (ADR
 * 0018) — current for an active Member, frozen for a Removed one — so a
 * later-removed Paid By keeps the name it had, with no join to live User rows.
 */
async function memberRef(
  ctx: QueryCtx,
  memberId: Id<"members">,
  caches: ViewCaches,
): Promise<MemberRef> {
  const cached = caches.members.get(memberId);
  if (cached) {
    return cached;
  }
  const member = await ctx.db.get(memberId);
  const ref: MemberRef = {
    displayName: member?.displayName ?? "Unknown member",
    image: member?.image,
  };
  caches.members.set(memberId, ref);
  return ref;
}

/** Resolves a Category to its display fields, memoized per query. */
async function categoryRef(
  ctx: QueryCtx,
  categoryId: Id<"categories">,
  caches: ViewCaches,
): Promise<CategoryRef | null> {
  if (caches.categories.has(categoryId)) {
    return caches.categories.get(categoryId) ?? null;
  }
  const category = await ctx.db.get(categoryId);
  const ref: CategoryRef | null = category
    ? { id: category._id, name: category.name, color: category.color }
    : null;
  caches.categories.set(categoryId, ref);
  return ref;
}

/**
 * A Transaction shaped for the client. Money is surfaced both as raw minor units
 * (for exact client-side sums — ADR 0009) and resolved identity/category names so
 * the UI attributes the Transaction without re-resolving. Categories are read
 * through the `transactionCategories` join, including any already-attached
 * archived Category (historical attachments are preserved — PRD story 57). Member
 * and Category lookups are memoized through `caches` to avoid re-reading the same
 * row across a list.
 */
async function toTransactionView(ctx: QueryCtx, txn: Doc<"transactions">, caches: ViewCaches) {
  const links = await ctx.db
    .query("transactionCategories")
    .withIndex("by_transaction", (q) => q.eq("transactionId", txn._id))
    .collect();
  const categories: CategoryRef[] = [];
  for (const link of links) {
    const category = await categoryRef(ctx, link.categoryId, caches);
    if (category) {
      categories.push(category);
    }
  }

  return {
    id: txn._id,
    type: txn.type,
    title: txn.title,
    note: txn.note,
    amountMinorUnits: txn.amountMinorUnits,
    date: txn.date,
    month: txn.month,
    status: txn.status,
    recordedBy: await memberRef(ctx, txn.recordedByMemberId, caches),
    paidBy: await memberRef(ctx, txn.paidByMemberId, caches),
    categories,
  };
}

export type TransactionView = Awaited<ReturnType<typeof toTransactionView>>;

/**
 * Lists a Circle's active Transactions, most recent first (Transaction Date desc,
 * then created-at desc via `_creationTime` — the Monthly Ledger sort, PRD story
 * 64). Paginated at the source off `by_circle_status_date`: the database returns
 * one ordered page, so nothing unbounded is ever loaded or sorted in memory. This
 * is the read TXN-1 needs to confirm a create landed and the basis the Ledger /
 * Dashboard / live-update slices (RPT-*) build on; archived Transactions are
 * excluded from this active surface (TXN-3 owns archived views).
 *
 * Anti-enumeration (ADR 0016): an inaccessible or missing Circle returns an empty,
 * exhausted page — indistinguishable from an accessible Circle with no
 * Transactions, so nothing about the Circle's existence leaks.
 */
export const listTransactions = query({
  args: { circleId: v.id("circles"), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const access = await resolveCircleAccess(ctx, args.circleId);
    if (!access) {
      return { page: [], isDone: true, continueCursor: "" };
    }

    const result = await ctx.db
      .query("transactions")
      .withIndex("by_circle_status_date", (q) =>
        q.eq("circleId", args.circleId).eq("status", "active"),
      )
      .order("desc")
      .paginate(args.paginationOpts);

    const caches = newViewCaches();
    const page = await Promise.all(result.page.map((txn) => toTransactionView(ctx, txn, caches)));
    return { ...result, page };
  },
});

/**
 * Creates an Expense or Income Transaction in a Circle (the core write of the
 * product — PRD stories 27–37, 50–52). The money/date/identity/category
 * invariants are all enforced HERE server-side (ADR 0015); the form's filtering
 * is a courtesy on top.
 *
 * Flow: `requireCircleAccess` → `assertWritable` (archived Circle is read-only) →
 * validate the shared input (Zod) → resolve Recorded By = the caller's Member →
 * default Paid By to Recorded By, else assert it's a current active Member of THIS
 * Circle → validate each Category (this Circle, matching type, active, ≥1, no
 * dup) → insert the Transaction + its category links → flip the Circle's Currency
 * lock (CS-3 owns enforcement; creating the first Transaction is the trigger) →
 * record the create event with pre-formatted human strings (ADR 0018).
 */
export const createTransaction = mutation({
  args: {
    circleId: v.id("circles"),
    type: transactionType,
    title: v.string(),
    note: v.optional(v.string()),
    amountMinorUnits: v.number(),
    date: v.string(),
    categoryIds: v.array(v.id("categories")),
    paidByMemberId: v.optional(v.id("members")),
  },
  handler: async (ctx, args) => {
    const access = await requireCircleAccess(ctx, args.circleId);
    access.assertWritable(); // an archived Circle is read-only (PRD story 79)

    const input = transactionCreateSchema.parse({
      type: args.type,
      title: args.title,
      note: args.note,
      amountMinorUnits: args.amountMinorUnits,
      date: args.date,
      categoryIds: args.categoryIds,
      paidByMemberId: args.paidByMemberId,
    });

    // Recorded By is the creator; only they can later edit the Transaction's
    // fields (PRD story 35 — enforced by TXN-2).
    const recordedByMemberId = access.membership._id;

    // Paid By defaults to Recorded By; an explicit Paid By must be a CURRENT
    // active Member of THIS Circle (PRD stories 36, 37). Removed Members and
    // Members of another Circle are rejected — historical preservation of a
    // later-removed Paid By is handled by the frozen `members` identity, not by
    // allowing a removed Member to be newly assigned.
    let paidByMember = access.membership;
    if (args.paidByMemberId && args.paidByMemberId !== recordedByMemberId) {
      const candidate = await ctx.db.get(args.paidByMemberId);
      if (!candidate || candidate.circleId !== args.circleId || candidate.status !== "active") {
        throw new Error("Paid By must be a current member of this circle");
      }
      paidByMember = candidate;
    }

    // Each Category must belong to this Circle, match the Transaction type, and be
    // active — an archived Category cannot be NEWLY added (PRD story 57). ≥1 and
    // no-duplicate are already enforced by the schema; the order is preserved for
    // a stable history string.
    const categories: Doc<"categories">[] = [];
    for (const categoryId of args.categoryIds) {
      const category = await ctx.db.get(categoryId);
      if (!category || category.circleId !== args.circleId) {
        throw new Error("Category not found in this circle");
      }
      if (category.type !== input.type) {
        throw new Error("Category type does not match the transaction type");
      }
      if (category.status !== "active") {
        throw new Error("Archived categories cannot be added to a transaction");
      }
      categories.push(category);
    }

    // An empty trimmed note is no note at all.
    const note = input.note && input.note.length > 0 ? input.note : undefined;
    const now = Date.now();

    const transactionId = await ctx.db.insert("transactions", {
      circleId: args.circleId,
      type: input.type,
      title: input.title,
      ...(note ? { note } : {}),
      amountMinorUnits: input.amountMinorUnits,
      date: input.date,
      month: monthOf(input.date), // denormalized bucket for the Ledger/Dashboard
      recordedByMemberId,
      paidByMemberId: paidByMember._id,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });

    for (const category of categories) {
      await ctx.db.insert("transactionCategories", {
        circleId: args.circleId,
        transactionId,
        categoryId: category._id,
      });
    }

    // Currency locks once a Circle has any Transaction (PRD story 9). CS-3 owns
    // the enforcement + UI; creating a Transaction is the trigger, so we flip the
    // flag here. Idempotent: only patch when it isn't already set.
    if (!access.circle.currencyLocked) {
      await ctx.db.patch(args.circleId, { currencyLocked: true });
    }

    // Record the create now (ADR 0018) even though the Transaction History view is
    // TXN-4 — its view needs this row to exist. Values are pre-formatted human
    // strings: money via the Circle Currency, the plain date, the Paid By Display
    // Name, and Category names — never raw IDs.
    const changes = [
      { field: "type", to: input.type },
      { field: "title", to: input.title },
      {
        field: "amount",
        to: formatMinorUnits(input.amountMinorUnits, toCurrencyCode(access.circle.currency)),
      },
      { field: "date", to: input.date },
      { field: "paidBy", to: paidByMember.displayName },
      { field: "categories", to: categories.map((category) => category.name).join(", ") },
    ];
    if (note) {
      changes.push({ field: "note", to: note });
    }

    await recordEvent(ctx, {
      entity: transactionEntity(transactionId),
      actor: access.membership,
      action: "created",
      changes,
    });

    return transactionId;
  },
});
