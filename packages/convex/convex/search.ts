import {
  currentMonth,
  isValidPlainDate,
  isValidPlainMonth,
  MAX_AMOUNT_MINOR,
} from "@spend-circle/domain";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel.js";
import type { QueryCtx } from "./_generated/server.js";
import { query } from "./_generated/server.js";
import { resolveCircleAccess } from "./guard.js";
import { toMemberView } from "./members.js";
import { monthDateRange, sumMonthTotals } from "./monthActivity.js";
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
  amountMinFrom: v.optional(v.number()),
  amountMax: v.optional(v.number()),
  scope: searchScope,
  includeArchived: v.optional(v.boolean()),
  archivedOnly: v.optional(v.boolean()),
};

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
    return { ok: true, start: "9999-12-31", endExclusive: "0000-01-01" };
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

function matchesView(
  view: TransactionView,
  filters: { queryText: string; categoryIds: Set<Id<"categories">> },
) {
  if (filters.categoryIds.size > 0) {
    const hasCategory = view.categories.some((category) => filters.categoryIds.has(category.id));
    if (!hasCategory) return false;
  }
  if (!filters.queryText) {
    return true;
  }
  const haystack = [
    view.title,
    view.note ?? "",
    view.type,
    view.recordedBy.displayName,
    view.paidBy.displayName,
    ...view.categories.map((category) => category.name),
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(filters.queryText);
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
        if (args.start && args.endExclusive) {
          return scoped.gte("date", args.start).lt("date", args.endExclusive);
        }
        if (args.start) return scoped.gte("date", args.start);
        if (args.endExclusive) return scoped.lt("date", args.endExclusive);
        return scoped;
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
        if (args.start && args.endExclusive) {
          return scoped.gte("date", args.start).lt("date", args.endExclusive);
        }
        if (args.start) return scoped.gte("date", args.start);
        if (args.endExclusive) return scoped.lt("date", args.endExclusive);
        return scoped;
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
        if (args.start && args.endExclusive) {
          return scoped.gte("date", args.start).lt("date", args.endExclusive);
        }
        if (args.start) return scoped.gte("date", args.start);
        if (args.endExclusive) return scoped.lt("date", args.endExclusive);
        return scoped;
      })
      .order("desc")
      .paginate(args.paginationOpts);
  }
  return ctx.db
    .query("transactions")
    .withIndex("by_circle_and_date", (q) => {
      const scoped = q.eq("circleId", args.circleId);
      if (args.start && args.endExclusive) {
        return scoped.gte("date", args.start).lt("date", args.endExclusive);
      }
      if (args.start) return scoped.gte("date", args.start);
      if (args.endExclusive) return scoped.lt("date", args.endExclusive);
      return scoped;
    })
    .order("desc")
    .paginate(args.paginationOpts);
}

export const searchTransactions = query({
  args: { ...searchArgs, paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const access = await resolveCircleAccess(ctx, args.circleId);
    if (!access) {
      return emptyPage();
    }
    const window = resolveDateWindow(args);
    const amountMin = args.amountMin ?? args.amountMinFrom;
    if (!window.ok || !validAmountBoundary(amountMin) || !validAmountBoundary(args.amountMax)) {
      throw new Error("Invalid search filters");
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

    const result = await pageByWindow(ctx, {
      circleId: args.circleId,
      status: singleStatus,
      paidByMemberId: paidByMemberId ?? undefined,
      recordedByMemberId: recordedByMemberId ?? undefined,
      start: window.start,
      endExclusive: window.endExclusive,
      paginationOpts: args.paginationOpts,
    });

    const caches = newViewCaches();
    const page: TransactionView[] = [];
    for (const txn of result.page) {
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
      const view = await toTransactionView(ctx, txn, caches, access.membership._id, access.isOwner);
      if (matchesView(view, { queryText, categoryIds })) {
        page.push(view);
      }
    }
    return { ...result, page };
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
    const amountMin = args.amountMin ?? args.amountMinFrom;
    if (!window.ok || !validAmountBoundary(amountMin) || !validAmountBoundary(args.amountMax)) {
      throw new Error("Invalid search filters");
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

    const caches = newViewCaches();
    const matches: TransactionView[] = [];
    for (const txn of candidatePage.page) {
      if (
        matchesDoc(txn, {
          type: args.type,
          recordedByMemberId,
          paidByMemberId,
          amountMin,
          amountMax: args.amountMax,
          archived: mode,
        })
      ) {
        const view = await toTransactionView(
          ctx,
          txn,
          caches,
          access.membership._id,
          access.isOwner,
        );
        if (matchesView(view, { queryText, categoryIds })) {
          matches.push(view);
        }
      }
    }

    const categoryMap = new Map<Id<"categories">, TransactionView["categories"][number]>();
    const recordedByIds = new Set<Id<"members">>();
    const paidByIds = new Set<Id<"members">>();
    for (const txn of matches) {
      recordedByIds.add(txn.recordedBy.id);
      paidByIds.add(txn.paidBy.id);
      for (const category of txn.categories) {
        categoryMap.set(category.id, category);
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
      totals: sumMonthTotals(matches),
      totalCount: matches.length,
      exact: candidatePage.isDone,
      currency: access.circle.currency,
      categories: [...categoryMap.values()].sort((a, b) => a.name.localeCompare(b.name)),
      recordedBy,
      paidBy,
    };
  },
});
