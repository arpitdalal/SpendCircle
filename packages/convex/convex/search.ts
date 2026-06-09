import {
  currentMonth,
  isValidPlainDate,
  isValidPlainMonth,
  MAX_AMOUNT_MINOR,
} from "@spend-circle/domain";
import { type IndexRange, paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel.js";
import type { QueryCtx } from "./_generated/server.js";
import { query } from "./_generated/server.js";
import { resolveCircleAccess } from "./guard.js";
import { toMemberView } from "./members.js";
import { monthDateRange } from "./monthActivity.js";
import { newViewCaches, type TransactionView, toTransactionView } from "./transactions.js";

const transactionType = v.union(v.literal("expense"), v.literal("income"));
const searchScope = v.union(v.literal("month"), v.literal("range"), v.literal("all"));
const SEARCH_META_LIMIT = 2_000;

const searchArgs = {
  circleId: v.id("circles"),
  query: v.optional(v.string()),
  type: v.optional(transactionType),
  categoryIds: v.optional(v.array(v.string())),
  recordedByMemberId: v.optional(v.string()),
  paidByMemberId: v.optional(v.string()),
  dateFrom: v.optional(v.string()),
  dateTo: v.optional(v.string()),
  month: v.optional(v.string()),
  amountMin: v.optional(v.number()),
  amountMax: v.optional(v.number()),
  scope: searchScope,
  includeArchived: v.optional(v.boolean()),
  archivedOnly: v.optional(v.boolean()),
};

interface SearchCaches {
  members: Map<Id<"members">, Doc<"members"> | null>;
  categories: Map<Id<"categories">, Doc<"categories"> | null>;
  linksByTransaction: Map<Id<"transactions">, Doc<"transactionCategories">[]>;
}

function newSearchCaches(): SearchCaches {
  return { members: new Map(), categories: new Map(), linksByTransaction: new Map() };
}

function emptyPage() {
  return { page: [], isDone: true, continueCursor: "" };
}

function zeroTotals() {
  return { incomeMinor: 0, expenseMinor: 0, netMinor: 0 };
}

function validAmountBoundary(value: number | undefined) {
  return (
    value === undefined || (Number.isInteger(value) && value >= 0 && value <= MAX_AMOUNT_MINOR)
  );
}

function normalizeOptionalMemberId(ctx: QueryCtx, value: string | undefined) {
  return value ? ctx.db.normalizeId("members", value) : null;
}

function normalizeCategoryIds(ctx: QueryCtx, values: string[] | undefined) {
  const ids = new Set<Id<"categories">>();
  for (const value of values ?? []) {
    const id = ctx.db.normalizeId("categories", value);
    if (id) {
      ids.add(id);
    }
  }
  return ids;
}

function resolveDateWindow(args: {
  scope: "month" | "range" | "all";
  month?: string;
  dateFrom?: string;
  dateTo?: string;
}) {
  if (args.scope === "all") {
    return { ok: true, start: undefined, endExclusive: undefined };
  }
  if (args.scope === "month") {
    const month = args.month ?? currentMonth(new Date());
    if (!isValidPlainMonth(month)) {
      return { ok: false };
    }
    const range = monthDateRange(month);
    return { ok: true, start: range.start, endExclusive: range.endExclusive };
  }
  if (args.dateFrom !== undefined && !isValidPlainDate(args.dateFrom)) {
    return { ok: false };
  }
  if (args.dateTo !== undefined && !isValidPlainDate(args.dateTo)) {
    return { ok: false };
  }
  if (args.dateFrom && args.dateTo && args.dateFrom > args.dateTo) {
    return { ok: true, empty: true };
  }
  return {
    ok: true,
    start: args.dateFrom,
    endExclusive: args.dateTo ? nextPlainDate(args.dateTo) : undefined,
  };
}

function nextPlainDate(date: string) {
  const parts = date.split("-").map(Number);
  const next = new Date(Date.UTC(parts[0] ?? 0, (parts[1] ?? 1) - 1, (parts[2] ?? 1) + 1));
  const year = next.getUTCFullYear().toString().padStart(4, "0");
  const month = (next.getUTCMonth() + 1).toString().padStart(2, "0");
  const day = next.getUTCDate().toString().padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function archivedMode(args: { includeArchived?: boolean; archivedOnly?: boolean }) {
  if (args.archivedOnly) {
    return "only";
  }
  return args.includeArchived ? "include" : "exclude";
}

function matchesDoc(
  txn: Doc<"transactions">,
  filters: {
    type?: "expense" | "income";
    recordedByMemberId: Id<"members"> | null;
    paidByMemberId: Id<"members"> | null;
    amountMin?: number;
    amountMax?: number;
    archived: "exclude" | "include" | "only";
  },
) {
  if (filters.archived === "exclude" && txn.status !== "active") return false;
  if (filters.archived === "only" && txn.status !== "archived") return false;
  if (filters.type && txn.type !== filters.type) return false;
  if (filters.recordedByMemberId && txn.recordedByMemberId !== filters.recordedByMemberId) {
    return false;
  }
  if (filters.paidByMemberId && txn.paidByMemberId !== filters.paidByMemberId) {
    return false;
  }
  if (filters.amountMin !== undefined && txn.amountMinorUnits < filters.amountMin) return false;
  if (filters.amountMax !== undefined && txn.amountMinorUnits > filters.amountMax) return false;
  return true;
}

async function memberDoc(ctx: QueryCtx, memberId: Id<"members">, caches: SearchCaches) {
  if (caches.members.has(memberId)) {
    return caches.members.get(memberId) ?? null;
  }
  const member = await ctx.db.get(memberId);
  caches.members.set(memberId, member);
  return member;
}

async function categoryDoc(ctx: QueryCtx, categoryId: Id<"categories">, caches: SearchCaches) {
  if (caches.categories.has(categoryId)) {
    return caches.categories.get(categoryId) ?? null;
  }
  const category = await ctx.db.get(categoryId);
  caches.categories.set(categoryId, category);
  return category;
}

async function categoryLinksForTransaction(
  ctx: QueryCtx,
  transactionId: Id<"transactions">,
  caches: SearchCaches,
) {
  const cached = caches.linksByTransaction.get(transactionId);
  if (cached) {
    return cached;
  }
  const links = await ctx.db
    .query("transactionCategories")
    .withIndex("by_transaction", (q) => q.eq("transactionId", transactionId))
    .collect();
  caches.linksByTransaction.set(transactionId, links);
  return links;
}

function textIncludes(value: string | undefined, queryText: string) {
  return (value ?? "").toLowerCase().includes(queryText);
}

async function matchesSearchFields(
  ctx: QueryCtx,
  txn: Doc<"transactions">,
  filters: { queryText: string; categoryIds: Set<Id<"categories">> },
  caches: SearchCaches,
) {
  let links: Doc<"transactionCategories">[] | null = null;
  if (filters.categoryIds.size > 0) {
    links = await categoryLinksForTransaction(ctx, txn._id, caches);
    if (!links.some((link) => filters.categoryIds.has(link.categoryId))) {
      return false;
    }
  }
  if (!filters.queryText) {
    return true;
  }

  if (
    textIncludes(txn.title, filters.queryText) ||
    textIncludes(txn.note, filters.queryText) ||
    textIncludes(txn.type, filters.queryText)
  ) {
    return true;
  }

  const recordedBy = await memberDoc(ctx, txn.recordedByMemberId, caches);
  if (textIncludes(recordedBy?.displayName, filters.queryText)) {
    return true;
  }
  const paidBy = await memberDoc(ctx, txn.paidByMemberId, caches);
  if (textIncludes(paidBy?.displayName, filters.queryText)) {
    return true;
  }

  links = links ?? (await categoryLinksForTransaction(ctx, txn._id, caches));
  for (const link of links) {
    const category = await categoryDoc(ctx, link.categoryId, caches);
    if (textIncludes(category?.name, filters.queryText)) {
      return true;
    }
  }
  return false;
}

function sumTransactionTotals(txns: Doc<"transactions">[]) {
  let incomeMinor = 0;
  let expenseMinor = 0;
  for (const txn of txns) {
    if (txn.type === "income") {
      incomeMinor += txn.amountMinorUnits;
    } else {
      expenseMinor += txn.amountMinorUnits;
    }
  }
  return { incomeMinor, expenseMinor, netMinor: incomeMinor - expenseMinor };
}

function categoryView(category: Doc<"categories">) {
  return { id: category._id, name: category.name, color: category.color };
}

function applyDateRange<
  Scoped extends IndexRange & {
    gte(
      field: "date",
      value: string,
    ): IndexRange & { lt(field: "date", value: string): IndexRange };
    lt(field: "date", value: string): IndexRange;
  },
>(scoped: Scoped, range: { start?: string; endExclusive?: string }) {
  if (range.start && range.endExclusive) {
    return scoped.gte("date", range.start).lt("date", range.endExclusive);
  }
  if (range.start) return scoped.gte("date", range.start);
  if (range.endExclusive) return scoped.lt("date", range.endExclusive);
  return scoped;
}

function pageByWindow(
  ctx: QueryCtx,
  args: {
    circleId: Id<"circles">;
    status?: "active" | "archived";
    paidByMemberId?: Id<"members">;
    recordedByMemberId?: Id<"members">;
    start?: string;
    endExclusive?: string;
    paginationOpts: { numItems: number; cursor: string | null };
  },
) {
  if (args.paidByMemberId && args.status) {
    const paidByMemberId = args.paidByMemberId;
    const status = args.status;
    return ctx.db
      .query("transactions")
      .withIndex("by_circle_paidby_status_date", (q) => {
        const scoped = q
          .eq("circleId", args.circleId)
          .eq("paidByMemberId", paidByMemberId)
          .eq("status", status);
        return applyDateRange(scoped, args);
      })
      .order("desc")
      .paginate(args.paginationOpts);
  }
  if (args.recordedByMemberId && args.status) {
    const recordedByMemberId = args.recordedByMemberId;
    const status = args.status;
    return ctx.db
      .query("transactions")
      .withIndex("by_circle_recordedby_status_date", (q) => {
        const scoped = q
          .eq("circleId", args.circleId)
          .eq("recordedByMemberId", recordedByMemberId)
          .eq("status", status);
        return applyDateRange(scoped, args);
      })
      .order("desc")
      .paginate(args.paginationOpts);
  }
  if (args.status) {
    const status = args.status;
    return ctx.db
      .query("transactions")
      .withIndex("by_circle_status_date", (q) => {
        const scoped = q.eq("circleId", args.circleId).eq("status", status);
        return applyDateRange(scoped, args);
      })
      .order("desc")
      .paginate(args.paginationOpts);
  }
  return ctx.db
    .query("transactions")
    .withIndex("by_circle_and_date", (q) => {
      const scoped = q.eq("circleId", args.circleId);
      return applyDateRange(scoped, args);
    })
    .order("desc")
    .paginate(args.paginationOpts);
}

async function collectTransactionViews(
  ctx: QueryCtx,
  args: {
    circleId: Id<"circles">;
    viewerMemberId: Id<"members">;
    viewerIsOwner: boolean;
    status?: "active" | "archived";
    paidByMemberId: Id<"members"> | null;
    recordedByMemberId: Id<"members"> | null;
    start?: string;
    endExclusive?: string;
    paginationOpts: { numItems: number; cursor: string | null };
    filters: {
      type?: "expense" | "income";
      amountMin?: number;
      amountMax?: number;
      archived: "exclude" | "include" | "only";
      queryText: string;
      categoryIds: Set<Id<"categories">>;
    };
  },
) {
  const page: TransactionView[] = [];
  let cursor = args.paginationOpts.cursor;
  let continueCursor = "";
  let isDone = false;
  const viewCaches = newViewCaches();
  const searchCaches = newSearchCaches();

  while (page.length < args.paginationOpts.numItems && !isDone) {
    const remaining = args.paginationOpts.numItems - page.length;
    const source = await pageByWindow(ctx, {
      circleId: args.circleId,
      status: args.status,
      paidByMemberId: args.paidByMemberId ?? undefined,
      recordedByMemberId: args.recordedByMemberId ?? undefined,
      start: args.start,
      endExclusive: args.endExclusive,
      paginationOpts: { numItems: remaining, cursor },
    });

    continueCursor = source.continueCursor;
    isDone = source.isDone;
    cursor = source.continueCursor;
    if (source.page.length === 0) {
      break;
    }

    for (const txn of source.page) {
      if (
        !matchesDoc(txn, {
          type: args.filters.type,
          recordedByMemberId: args.recordedByMemberId,
          paidByMemberId: args.paidByMemberId,
          amountMin: args.filters.amountMin,
          amountMax: args.filters.amountMax,
          archived: args.filters.archived,
        })
      ) {
        continue;
      }
      if (
        await matchesSearchFields(
          ctx,
          txn,
          { queryText: args.filters.queryText, categoryIds: args.filters.categoryIds },
          searchCaches,
        )
      ) {
        page.push(
          await toTransactionView(ctx, txn, viewCaches, args.viewerMemberId, args.viewerIsOwner),
        );
      }
    }
  }

  return { page, isDone, continueCursor };
}

export const searchTransactions = query({
  args: { ...searchArgs, paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const access = await resolveCircleAccess(ctx, args.circleId);
    if (!access) {
      return emptyPage();
    }
    const window = resolveDateWindow(args);
    const amountMin = args.amountMin;
    if (!window.ok || !validAmountBoundary(amountMin) || !validAmountBoundary(args.amountMax)) {
      throw new Error("Invalid search filters");
    }
    if ("empty" in window && window.empty) {
      return emptyPage();
    }
    if (amountMin !== undefined && args.amountMax !== undefined && amountMin > args.amountMax) {
      return emptyPage();
    }

    const mode = archivedMode(args);
    const singleStatus = mode === "include" ? undefined : mode === "only" ? "archived" : "active";
    const recordedByMemberId = normalizeOptionalMemberId(ctx, args.recordedByMemberId);
    const paidByMemberId = normalizeOptionalMemberId(ctx, args.paidByMemberId);
    const categoryIds = normalizeCategoryIds(ctx, args.categoryIds);
    const queryText = (args.query ?? "").trim().toLowerCase();

    return await collectTransactionViews(ctx, {
      circleId: args.circleId,
      viewerMemberId: access.membership._id,
      viewerIsOwner: access.isOwner,
      status: singleStatus,
      paidByMemberId,
      recordedByMemberId,
      start: window.start,
      endExclusive: window.endExclusive,
      paginationOpts: args.paginationOpts,
      filters: {
        type: args.type,
        amountMin,
        amountMax: args.amountMax,
        archived: mode,
        queryText,
        categoryIds,
      },
    });
  },
});

export const getTransactionSearchMeta = query({
  args: searchArgs,
  handler: async (ctx, args) => {
    const access = await resolveCircleAccess(ctx, args.circleId);
    if (!access) {
      return null;
    }
    const window = resolveDateWindow(args);
    const amountMin = args.amountMin;
    if (!window.ok || !validAmountBoundary(amountMin) || !validAmountBoundary(args.amountMax)) {
      throw new Error("Invalid search filters");
    }
    if ("empty" in window && window.empty) {
      return {
        totals: zeroTotals(),
        totalCount: 0,
        exact: true,
        currency: access.circle.currency,
        categories: [],
        recordedBy: [],
        paidBy: [],
      };
    }
    if (amountMin !== undefined && args.amountMax !== undefined && amountMin > args.amountMax) {
      return {
        totals: zeroTotals(),
        totalCount: 0,
        exact: true,
        currency: access.circle.currency,
        categories: [],
        recordedBy: [],
        paidBy: [],
      };
    }

    const mode = archivedMode(args);
    const singleStatus = mode === "include" ? undefined : mode === "only" ? "archived" : "active";
    const recordedByMemberId = normalizeOptionalMemberId(ctx, args.recordedByMemberId);
    const paidByMemberId = normalizeOptionalMemberId(ctx, args.paidByMemberId);
    const categoryIds = normalizeCategoryIds(ctx, args.categoryIds);
    const queryText = (args.query ?? "").trim().toLowerCase();
    const candidatePage = await pageByWindow(ctx, {
      circleId: args.circleId,
      status: singleStatus,
      paidByMemberId: paidByMemberId ?? undefined,
      recordedByMemberId: recordedByMemberId ?? undefined,
      start: window.start,
      endExclusive: window.endExclusive,
      paginationOpts: { numItems: SEARCH_META_LIMIT, cursor: null },
    });

    const caches = newSearchCaches();
    const matches: Doc<"transactions">[] = [];
    const categoryFacetMatches: Doc<"transactions">[] = [];
    for (const txn of candidatePage.page) {
      if (
        !matchesDoc(txn, {
          type: args.type,
          recordedByMemberId,
          paidByMemberId,
          amountMin,
          amountMax: args.amountMax,
          archived: mode,
        })
      ) {
        continue;
      }

      if (await matchesSearchFields(ctx, txn, { queryText, categoryIds: new Set() }, caches)) {
        categoryFacetMatches.push(txn);
      }

      if (await matchesSearchFields(ctx, txn, { queryText, categoryIds }, caches)) {
        matches.push(txn);
      }
    }

    const recordedByIds = new Set<Id<"members">>();
    const paidByIds = new Set<Id<"members">>();
    for (const txn of matches) {
      recordedByIds.add(txn.recordedByMemberId);
      paidByIds.add(txn.paidByMemberId);
    }

    const categoryRows = await ctx.db
      .query("categories")
      .withIndex("by_circle", (q) => q.eq("circleId", args.circleId))
      .collect();
    const categoryMap = new Map<Id<"categories">, ReturnType<typeof categoryView>>();
    for (const category of categoryRows) {
      if (args.type && category.type !== args.type) {
        continue;
      }
      if (category.status === "active") {
        categoryMap.set(category._id, categoryView(category));
      }
    }
    for (const txn of categoryFacetMatches) {
      const links = await categoryLinksForTransaction(ctx, txn._id, caches);
      for (const link of links) {
        const category = await categoryDoc(ctx, link.categoryId, caches);
        if (!category || (args.type && category.type !== args.type)) {
          continue;
        }
        categoryMap.set(category._id, categoryView(category));
      }
    }

    const memberRows = await ctx.db
      .query("members")
      .withIndex("by_circle", (q) => q.eq("circleId", args.circleId))
      .collect();
    const orderMembers = (a: Doc<"members">, b: Doc<"members">) => {
      if (a.status !== b.status) return a.status === "active" ? -1 : 1;
      if (a.role !== b.role) return a.role === "owner" ? -1 : 1;
      return a.joinedAt - b.joinedAt;
    };
    const recordedBy = memberRows
      .filter((member) => member.status === "active" || recordedByIds.has(member._id))
      .sort(orderMembers)
      .map((member) => toMemberView(member, access.membership._id));
    const paidBy = memberRows
      .filter((member) => member.status === "active" || paidByIds.has(member._id))
      .sort(orderMembers)
      .map((member) => toMemberView(member, access.membership._id));

    return {
      totals: sumTransactionTotals(matches),
      totalCount: matches.length,
      exact: candidatePage.isDone,
      currency: access.circle.currency,
      categories: [...categoryMap.values()].sort((a, b) => a.name.localeCompare(b.name)),
      recordedBy,
      paidBy,
    };
  },
});
