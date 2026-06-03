import {
  type TransactionType,
  addMonths,
  formatMinorUnits,
  isValidPlainMonth,
  monthOf,
  toCurrencyCode,
  transactionCreateSchema,
  transactionUpdateSchema,
} from "@spend-circle/domain";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel.js";
import { type MutationCtx, type QueryCtx, mutation, query } from "./_generated/server.js";
import { requireCircleAccess, requireTransactionAccess, resolveCircleAccess } from "./guard.js";
import { type HistoryChange, recordEvent, transactionEntity } from "./history.js";

const transactionType = v.union(v.literal("expense"), v.literal("income"));

interface MemberRef {
  id: Id<"members">;
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
export interface ViewCaches {
  members: Map<Id<"members">, MemberRef>;
  categories: Map<Id<"categories">, CategoryRef | null>;
}

export function newViewCaches(): ViewCaches {
  return { members: new Map(), categories: new Map() };
}

/**
 * The half-open plain-date range `[month-start, next-month-start)` that captures
 * exactly one "YYYY-MM" month. Plain dates are zero-padded "YYYY-MM-DD" strings,
 * so every date in `month` sorts at or after the bare `month` prefix and strictly
 * before the next month's prefix — letting a date-ordered index (`by_circle_status_date`)
 * range a month at the source instead of bucketing in memory (ADR 0009 dates;
 * README §4 index-backed reads). Shared by the Ledger list and its totals so the
 * two never disagree on what a month contains.
 */
export function monthDateRange(month: string): { start: string; endExclusive: string } {
  return { start: month, endExclusive: addMonths(month, 1) };
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
    id: memberId,
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
 *
 * `canEditFields` is resolved HERE against the viewer's Member: only the Recorded By
 * Member may edit a Transaction's fields (TXN-2), and because it compares to the
 * caller's stable member row, a Removed→rejoined User regains it automatically (PRD
 * 44). The UI gates its edit affordance on this flag, but the server re-checks on
 * `updateTransaction` — the flag is the courtesy, not the enforcement (ADR 0015).
 */
export async function toTransactionView(
  ctx: QueryCtx,
  txn: Doc<"transactions">,
  caches: ViewCaches,
  viewerMemberId: Id<"members">,
) {
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
    canEditFields: txn.recordedByMemberId === viewerMemberId,
  };
}

export type TransactionView = Awaited<ReturnType<typeof toTransactionView>>;

/**
 * Lists a Circle's active Transactions, most recent first (Transaction Date desc,
 * then created-at desc via `_creationTime` — the Monthly Ledger sort, PRD story
 * 64). Paginated at the source off `by_circle_status_date`: the database returns
 * one ordered page, so nothing unbounded is ever loaded or sorted in memory. This
 * is the read TXN-1 needs to confirm a create landed and the list half of the
 * Monthly Ledger (RPT-1); archived Transactions are excluded from this active
 * surface (TXN-3 owns archived views).
 *
 * An optional `month` ("YYYY-MM") scopes the page to one month by ranging the SAME
 * date-ordered index to `[month, next-month)` — the Ledger's month-scoped list
 * (RPT-1). The range is applied at the source (never an in-memory `month` filter
 * over an unbounded set — README §4), and because the index already orders by
 * date the page stays date-desc within the month with no extra sort. The Ledger's
 * income/expense/net totals are a separate bounded aggregate (`ledger.getMonthlyLedger`):
 * `usePaginatedQuery` can't carry totals alongside a page, and the totals must sum
 * the WHOLE month while the list only resolves the visible page, so they are two
 * reads fused on the client into the slice's `{ transactions, totals }` surface.
 *
 * Anti-enumeration (ADR 0016): an inaccessible or missing Circle returns an empty,
 * exhausted page — indistinguishable from an accessible Circle with no
 * Transactions, so nothing about the Circle's existence leaks.
 */
export const listTransactions = query({
  args: {
    circleId: v.id("circles"),
    paginationOpts: paginationOptsValidator,
    month: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const access = await resolveCircleAccess(ctx, args.circleId);
    if (!access) {
      return { page: [], isDone: true, continueCursor: "" };
    }
    if (args.month !== undefined && !isValidPlainMonth(args.month)) {
      throw new Error("Invalid month");
    }
    const range = args.month !== undefined ? monthDateRange(args.month) : undefined;

    const result = await ctx.db
      .query("transactions")
      .withIndex("by_circle_status_date", (q) => {
        const scoped = q.eq("circleId", args.circleId).eq("status", "active");
        return range ? scoped.gte("date", range.start).lt("date", range.endExclusive) : scoped;
      })
      .order("desc")
      .paginate(args.paginationOpts);

    const caches = newViewCaches();
    const page = await Promise.all(
      result.page.map((txn) => toTransactionView(ctx, txn, caches, access.membership._id)),
    );
    return { ...result, page };
  },
});

/**
 * Asserts a Member id names a CURRENT active Member of `circleId`, returning the
 * row. The single home of the Paid By rule shared by create and edit (PRD stories
 * 36, 37): a Removed Member or a Member of another Circle is rejected — historical
 * preservation of a later-removed Paid By is the frozen `members` identity's job,
 * not a license to NEWLY assign a removed Member.
 */
async function requireCurrentMember(
  ctx: MutationCtx,
  circleId: Id<"circles">,
  memberId: Id<"members">,
): Promise<Doc<"members">> {
  const member = await ctx.db.get(memberId);
  if (!member || member.circleId !== circleId || member.status !== "active") {
    throw new Error("Paid By must be a current member of this circle");
  }
  return member;
}

/**
 * Resolves and validates the Categories for a Transaction of `type`, the single
 * home of the Category rules shared by create and edit. Each id must name a
 * Category of THIS Circle and matching type; ≥1 / no-duplicate is already enforced
 * by the Zod schema, and order is preserved for a stable history string.
 *
 * `alreadyAttached` is the set of Categories currently on the Transaction: an
 * archived Category may only stay if it was already attached (PRD story 57 — an
 * edit keeps already-attached archived Categories but cannot NEWLY add one). Pass
 * an empty set for a create or a Transaction Type Change, where every Category is
 * new and therefore must be active.
 */
async function resolveCategories(
  ctx: MutationCtx,
  opts: {
    circleId: Id<"circles">;
    categoryIds: Id<"categories">[];
    type: TransactionType;
    alreadyAttached: ReadonlySet<Id<"categories">>;
  },
): Promise<Doc<"categories">[]> {
  const categories: Doc<"categories">[] = [];
  for (const categoryId of opts.categoryIds) {
    const category = await ctx.db.get(categoryId);
    if (!category || category.circleId !== opts.circleId) {
      throw new Error("Category not found in this circle");
    }
    if (category.type !== opts.type) {
      throw new Error("Category type does not match the transaction type");
    }
    if (category.status !== "active" && !opts.alreadyAttached.has(category._id)) {
      throw new Error("Archived categories cannot be added to a transaction");
    }
    categories.push(category);
  }
  return categories;
}

/** Replaces a Transaction's Category links with `categoryIds`, in order. */
async function rewriteTransactionCategories(
  ctx: MutationCtx,
  circleId: Id<"circles">,
  transactionId: Id<"transactions">,
  categoryIds: Id<"categories">[],
): Promise<void> {
  const existing = await ctx.db
    .query("transactionCategories")
    .withIndex("by_transaction", (q) => q.eq("transactionId", transactionId))
    .collect();
  for (const link of existing) {
    await ctx.db.delete(link._id);
  }
  for (const categoryId of categoryIds) {
    await ctx.db.insert("transactionCategories", { circleId, transactionId, categoryId });
  }
}

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

    // Paid By defaults to Recorded By; an explicit Paid By must be a CURRENT active
    // Member of THIS Circle (PRD stories 36, 37).
    let paidByMember = access.membership;
    if (args.paidByMemberId && args.paidByMemberId !== recordedByMemberId) {
      paidByMember = await requireCurrentMember(ctx, args.circleId, args.paidByMemberId);
    }

    // Each Category must belong to this Circle, match the type, and be active — an
    // archived Category cannot be newly added (PRD story 57). On a create nothing is
    // already attached, so every Category must be active.
    const categories = await resolveCategories(ctx, {
      circleId: args.circleId,
      categoryIds: args.categoryIds,
      type: input.type,
      alreadyAttached: new Set<Id<"categories">>(),
    });

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

/**
 * Edits a Transaction's fields, including a Transaction Type Change (TXN-2; PRD
 * stories 29, 30, 38, 42, 44). Every arg is optional — an absent field is left
 * unchanged — and only the fields that actually change are patched and recorded,
 * so a no-op submit writes nothing and leaves no spurious history.
 *
 * Flow: `requireTransactionAccess` (folds in `requireCircleAccess`, ADR 0015) →
 * `assertWritable` (an archived Circle is read-only) → **Recorded By check**: only
 * the Member who recorded it may edit fields — the Owner moderates lifecycle
 * (archive/restore — TXN-3) but cannot rewrite another Member's fields → reject an
 * **archived Transaction** (frozen — PRD 40) → validate changed fields against the
 * shared Zod schema → resolve a changed Paid By to a current Member → resolve
 * Categories → patch + bump `updatedAt`, rewriting Category links only when they
 * changed → `recordEvent` with per-field `from`/`to` (ADR 0018).
 *
 * Type Change is special (PRD 29, 30): it CLEARS the existing Categories (Expense
 * and Income Categories must never mix) and so requires the caller to supply ≥1
 * active Category of the NEW type in the SAME operation, keeping the "≥1 Category
 * of the matching type" invariant unbroken mid-edit. It records `action:"type
 * changed"` with the type from/to and the categories cleared→added; a plain field
 * edit records `action:"edited"`.
 *
 * Anti-enumeration (ADR 0016): a missing Transaction and one whose Circle the
 * caller can't access both throw the same "Transaction not found".
 */
export const updateTransaction = mutation({
  args: {
    transactionId: v.id("transactions"),
    type: v.optional(transactionType),
    title: v.optional(v.string()),
    note: v.optional(v.string()),
    amountMinorUnits: v.optional(v.number()),
    date: v.optional(v.string()),
    categoryIds: v.optional(v.array(v.id("categories"))),
    paidByMemberId: v.optional(v.id("members")),
  },
  handler: async (ctx, args) => {
    const access = await requireTransactionAccess(ctx, args.transactionId);
    access.assertWritable(); // an archived Circle is read-only (PRD story 79)

    // Only the Recorded By Member edits fields (PRD story 38). The Owner's
    // moderation power is archive/restore (TXN-3), NOT field edits — so this gates
    // on `isRecorder`, not `canArchive`. A Removed Recorded By already failed access
    // above; a rejoined one matches their stable member row and passes (PRD 44).
    if (!access.isRecorder) {
      throw new Error("Only the member who recorded this transaction can edit it");
    }

    const txn = access.transaction;
    // An archived Transaction is frozen — block edits here, never rely on the UI
    // (PRD story 40). TXN-3 owns the archive/restore lifecycle.
    if (txn.status !== "active") {
      throw new Error("Archived transactions can't be edited");
    }

    // Validate every PRESENT field by the same rules as create (ADR 0010). The
    // branded ids for db work come from the Convex-validated `args` (no cast); Zod
    // only enforces the cross-field bounds Convex validators can't.
    const input = transactionUpdateSchema.parse({
      type: args.type,
      title: args.title,
      note: args.note,
      date: args.date,
      amountMinorUnits: args.amountMinorUnits,
      categoryIds: args.categoryIds,
      paidByMemberId: args.paidByMemberId,
    });

    const currency = toCurrencyCode(access.circle.currency);
    const patch: Partial<Doc<"transactions">> = {};
    const changes: HistoryChange[] = [];

    const newType = input.type ?? txn.type;
    const typeChanges = newType !== txn.type;

    // A Type Change clears existing Categories, so it MUST arrive with the new
    // type's Categories in the same operation (PRD 29, 30) — the invariant never
    // breaks mid-edit.
    if (typeChanges && args.categoryIds === undefined) {
      throw new Error("Changing the transaction type requires categories of the new type");
    }

    // Resolve the Category change (if any) before assembling the event so the
    // ordered changes read type → fields → categories. On a Type Change nothing
    // carries over, so `alreadyAttached` is empty and every Category must be active;
    // on a same-type edit, already-attached archived Categories may stay (PRD 57).
    const existingLinks = await ctx.db
      .query("transactionCategories")
      .withIndex("by_transaction", (q) => q.eq("transactionId", txn._id))
      .collect();
    const oldCategoryIds = existingLinks.map((link) => link.categoryId);

    let categoriesChanged = false;
    let newCategories: Doc<"categories">[] = [];
    if (args.categoryIds !== undefined) {
      newCategories = await resolveCategories(ctx, {
        circleId: txn.circleId,
        categoryIds: args.categoryIds,
        type: newType,
        alreadyAttached: typeChanges ? new Set<Id<"categories">>() : new Set(oldCategoryIds),
      });
      // A Type Change always rewrites (old Categories are cleared). Otherwise the
      // set must actually differ to count as a change — reordering the same
      // Categories is a no-op.
      const sameSet =
        args.categoryIds.length === oldCategoryIds.length &&
        args.categoryIds.every((id) => oldCategoryIds.includes(id));
      categoriesChanged = typeChanges || !sameSet;
    }

    // Resolve old Category names lazily — only when a Type Change clears them or the
    // set changed, since those are the only cases the event reports a `from`.
    if (typeChanges) {
      patch.type = newType;
      changes.push({ field: "type", from: txn.type, to: newType });
    }

    if (input.title !== undefined && input.title !== txn.title) {
      patch.title = input.title;
      changes.push({ field: "title", from: txn.title, to: input.title });
    }

    if (input.amountMinorUnits !== undefined && input.amountMinorUnits !== txn.amountMinorUnits) {
      patch.amountMinorUnits = input.amountMinorUnits;
      changes.push({
        field: "amount",
        from: formatMinorUnits(txn.amountMinorUnits, currency),
        to: formatMinorUnits(input.amountMinorUnits, currency),
      });
    }

    if (input.date !== undefined && input.date !== txn.date) {
      patch.date = input.date;
      patch.month = monthOf(input.date); // keep the denormalized bucket in sync
      changes.push({ field: "date", from: txn.date, to: input.date });
    }

    if (args.paidByMemberId !== undefined && args.paidByMemberId !== txn.paidByMemberId) {
      const newPaidBy = await requireCurrentMember(ctx, txn.circleId, args.paidByMemberId);
      const oldPaidBy = await ctx.db.get(txn.paidByMemberId);
      patch.paidByMemberId = newPaidBy._id;
      changes.push({
        field: "paidBy",
        from: oldPaidBy?.displayName ?? "Unknown member",
        to: newPaidBy.displayName,
      });
    }

    // A present note of "" is the explicit clear signal; setting the field to
    // `undefined` via patch removes it.
    if (input.note !== undefined) {
      const newNote = input.note.length > 0 ? input.note : undefined;
      if (newNote !== txn.note) {
        patch.note = newNote;
        changes.push({
          field: "note",
          ...(txn.note ? { from: txn.note } : {}),
          ...(newNote ? { to: newNote } : {}),
        });
      }
    }

    if (categoriesChanged) {
      const oldNames = (await Promise.all(oldCategoryIds.map((id) => ctx.db.get(id)))).flatMap(
        (category) => (category ? [category.name] : []),
      );
      changes.push({
        field: "categories",
        from: oldNames.join(", "),
        to: newCategories.map((category) => category.name).join(", "),
      });
    }

    // No real change ⇒ a true no-op: no patch, no spurious history (TXN-2 decision).
    if (changes.length === 0) {
      return args.transactionId;
    }

    patch.updatedAt = Date.now();
    await ctx.db.patch(args.transactionId, patch);

    if (categoriesChanged) {
      await rewriteTransactionCategories(
        ctx,
        txn.circleId,
        txn._id,
        newCategories.map((category) => category._id),
      );
    }

    await recordEvent(ctx, {
      entity: transactionEntity(txn._id),
      actor: access.membership,
      action: typeChanges ? "type changed" : "edited",
      changes,
    });

    return args.transactionId;
  },
});
