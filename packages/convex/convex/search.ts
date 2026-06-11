import {
  currentMonth,
  isValidPlainDate,
  isValidPlainMonth,
  MAX_AMOUNT_MINOR,
  normalizeSearchText,
} from "@spend-circle/domain";
import { type IndexRange, paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { stream } from "convex-helpers/server/stream";
import type { Doc, Id } from "./_generated/dataModel.js";
import type { QueryCtx } from "./_generated/server.js";
import { query } from "./_generated/server.js";
import { toCategoryView } from "./categories.js";
import { resolveCircleAccess } from "./guard.js";
import { toMemberView } from "./members.js";
import { monthDateRange } from "./monthActivity.js";
import schema from "./schema.js";
import { newViewCaches, toTransactionView } from "./transactions.js";

const filterType = v.union(v.literal("all"), v.literal("expense"), v.literal("income"));
const lifecycleFilter = v.union(v.literal("active"), v.literal("archived"), v.literal("all"));

const commonFilterArgs = {
  circleId: v.id("circles"),
  query: v.optional(v.string()),
  type: filterType,
  status: lifecycleFilter,
  categoryIds: v.optional(v.array(v.string())),
  recordedByMemberIds: v.optional(v.array(v.string())),
  paidByMemberIds: v.optional(v.array(v.string())),
};

interface SearchCaches {
  linksByTransaction: Map<Id<"transactions">, Doc<"transactionCategories">[]>;
}

function newSearchCaches() {
  return { linksByTransaction: new Map() } satisfies SearchCaches;
}

function emptyPage() {
  return { page: [], isDone: true, continueCursor: "" };
}

function validAmountBoundary(value: number | undefined) {
  return (
    value === undefined || (Number.isInteger(value) && value >= 0 && value <= MAX_AMOUNT_MINOR)
  );
}

function selectedType(value: "all" | "expense" | "income") {
  return value === "all" ? undefined : value;
}

function selectedStatus(value: "active" | "archived" | "all") {
  return value === "all" ? undefined : value;
}

function normalizeCategoryIds(ctx: QueryCtx, values: string[] | undefined) {
  const ids = new Set<Id<"categories">>();
  let sawValue = false;
  for (const value of values ?? []) {
    sawValue = true;
    const id = ctx.db.normalizeId("categories", value);
    if (id) {
      ids.add(id);
    }
  }
  return { ids, hasOnlyUnknown: sawValue && ids.size === 0 };
}

function normalizeMemberIds(ctx: QueryCtx, values: string[] | undefined) {
  const ids = new Set<Id<"members">>();
  let sawValue = false;
  for (const value of values ?? []) {
    sawValue = true;
    const id = ctx.db.normalizeId("members", value);
    if (id) {
      ids.add(id);
    }
  }
  return { ids, hasOnlyUnknown: sawValue && ids.size === 0 };
}

function resolveSearchWindow(args: { dateFrom?: string; dateTo?: string }) {
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

async function matchesFilters(
  ctx: QueryCtx,
  txn: Doc<"transactions">,
  filters: {
    type?: "expense" | "income";
    status?: "active" | "archived";
    categoryIds: Set<Id<"categories">>;
    recordedByMemberIds: Set<Id<"members">>;
    paidByMemberIds: Set<Id<"members">>;
    amountMin?: number;
    amountMax?: number;
    queryText: string;
  },
  caches: SearchCaches,
) {
  if (filters.status && txn.status !== filters.status) return false;
  if (filters.type && txn.type !== filters.type) return false;
  if (
    filters.recordedByMemberIds.size > 0 &&
    !filters.recordedByMemberIds.has(txn.recordedByMemberId)
  ) {
    return false;
  }
  if (filters.paidByMemberIds.size > 0 && !filters.paidByMemberIds.has(txn.paidByMemberId)) {
    return false;
  }
  if (filters.amountMin !== undefined && txn.amountMinorUnits < filters.amountMin) return false;
  if (filters.amountMax !== undefined && txn.amountMinorUnits > filters.amountMax) return false;
  if (filters.categoryIds.size > 0) {
    const links = await categoryLinksForTransaction(ctx, txn._id, caches);
    if (!links.some((link) => filters.categoryIds.has(link.categoryId))) {
      return false;
    }
  }
  return true;
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

function streamByWindow(
  ctx: QueryCtx,
  args: {
    circleId: Id<"circles">;
    status?: "active" | "archived";
    paidByMemberIds: Set<Id<"members">>;
    recordedByMemberIds: Set<Id<"members">>;
    start?: string;
    endExclusive?: string;
  },
) {
  if (args.paidByMemberIds.size === 1 && args.status) {
    const paidByMemberId = args.paidByMemberIds.values().next().value;
    if (paidByMemberId) {
      const status = args.status;
      return stream(ctx.db, schema)
        .query("transactions")
        .withIndex("by_circle_paidby_status_date", (q) => {
          const scoped = q
            .eq("circleId", args.circleId)
            .eq("paidByMemberId", paidByMemberId)
            .eq("status", status);
          return applyDateRange(scoped, args);
        })
        .order("desc");
    }
  }
  if (args.recordedByMemberIds.size === 1 && args.status) {
    const recordedByMemberId = args.recordedByMemberIds.values().next().value;
    if (recordedByMemberId) {
      const status = args.status;
      return stream(ctx.db, schema)
        .query("transactions")
        .withIndex("by_circle_recordedby_status_date", (q) => {
          const scoped = q
            .eq("circleId", args.circleId)
            .eq("recordedByMemberId", recordedByMemberId)
            .eq("status", status);
          return applyDateRange(scoped, args);
        })
        .order("desc");
    }
  }
  if (args.status) {
    const status = args.status;
    return stream(ctx.db, schema)
      .query("transactions")
      .withIndex("by_circle_status_date", (q) => {
        const scoped = q.eq("circleId", args.circleId).eq("status", status);
        return applyDateRange(scoped, args);
      })
      .order("desc");
  }
  return stream(ctx.db, schema)
    .query("transactions")
    .withIndex("by_circle_and_date", (q) => {
      const scoped = q.eq("circleId", args.circleId);
      return applyDateRange(scoped, args);
    })
    .order("desc");
}

async function collectTransactionViews(
  ctx: QueryCtx,
  args: {
    circleId: Id<"circles">;
    viewerMemberId: Id<"members">;
    viewerIsOwner: boolean;
    status?: "active" | "archived";
    paidByMemberIds: Set<Id<"members">>;
    recordedByMemberIds: Set<Id<"members">>;
    start?: string;
    endExclusive?: string;
    paginationOpts: { numItems: number; cursor: string | null };
    filters: {
      type?: "expense" | "income";
      categoryIds: Set<Id<"categories">>;
      amountMin?: number;
      amountMax?: number;
      queryText: string;
    };
  },
) {
  const viewCaches = newViewCaches();
  const searchCaches = newSearchCaches();

  if (args.filters.queryText) {
    return await collectSearchTransactionViews(ctx, args, viewCaches, searchCaches);
  }

  const source = streamByWindow(ctx, {
    circleId: args.circleId,
    status: args.status,
    paidByMemberIds: args.paidByMemberIds,
    recordedByMemberIds: args.recordedByMemberIds,
    start: args.start,
    endExclusive: args.endExclusive,
  }).filterWith((txn) =>
    matchesFilters(
      ctx,
      txn,
      {
        type: args.filters.type,
        status: args.status,
        categoryIds: args.filters.categoryIds,
        recordedByMemberIds: args.recordedByMemberIds,
        paidByMemberIds: args.paidByMemberIds,
        amountMin: args.filters.amountMin,
        amountMax: args.filters.amountMax,
        queryText: args.filters.queryText,
      },
      searchCaches,
    ),
  );
  const result = await source.paginate(args.paginationOpts);

  return {
    page: await Promise.all(
      result.page.map((txn) =>
        toTransactionView(ctx, txn, viewCaches, args.viewerMemberId, args.viewerIsOwner),
      ),
    ),
    isDone: result.isDone,
    continueCursor: result.continueCursor,
  };
}

function onlySelectedId<T>(ids: Set<T>) {
  if (ids.size !== 1) return undefined;
  return ids.values().next().value;
}

const searchCursorKind = "transactionSearch";

function rawSearchPageSize(requested: number) {
  return Math.min(Math.max(requested, 10), 50);
}

function objectFields(value: unknown) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  return new Map(Object.entries(value));
}

function searchCursorFrom(value: string | null) {
  if (!value) return { searchCursor: null, offset: 0 };
  try {
    const decoded: unknown = JSON.parse(value);
    const fields = objectFields(decoded);
    if (!fields || fields.get("kind") !== searchCursorKind) {
      return { searchCursor: value, offset: 0 };
    }
    const searchCursor = fields.get("searchCursor");
    const offset = fields.get("offset");
    if (
      (searchCursor === null || typeof searchCursor === "string") &&
      typeof offset === "number" &&
      Number.isInteger(offset) &&
      offset >= 0
    ) {
      return { searchCursor, offset };
    }
  } catch {
    return { searchCursor: value, offset: 0 };
  }
  return { searchCursor: value, offset: 0 };
}

function encodeSearchCursor(searchCursor: string | null, offset: number) {
  return JSON.stringify({ kind: searchCursorKind, searchCursor, offset });
}

async function collectSearchTransactionViews(
  ctx: QueryCtx,
  args: Parameters<typeof collectTransactionViews>[1],
  viewCaches: ReturnType<typeof newViewCaches>,
  searchCaches: SearchCaches,
) {
  const paidByMemberId = onlySelectedId(args.paidByMemberIds);
  const recordedByMemberId = onlySelectedId(args.recordedByMemberIds);

  function searchSource() {
    let source = ctx.db.query("transactionSearchDocuments").withSearchIndex("search_text", (q) => {
      let scoped = q.search("searchText", args.filters.queryText).eq("circleId", args.circleId);
      if (args.status) {
        scoped = scoped.eq("status", args.status);
      }
      if (args.filters.type) {
        scoped = scoped.eq("type", args.filters.type);
      }
      if (paidByMemberId) {
        scoped = scoped.eq("paidByMemberId", paidByMemberId);
      }
      if (recordedByMemberId) {
        scoped = scoped.eq("recordedByMemberId", recordedByMemberId);
      }
      return scoped;
    });

    if (args.start) {
      const start = args.start;
      source = source.filter((q) => q.gte(q.field("date"), start));
    }
    if (args.endExclusive) {
      const endExclusive = args.endExclusive;
      source = source.filter((q) => q.lt(q.field("date"), endExclusive));
    }
    if (args.filters.amountMin !== undefined) {
      const amountMin = args.filters.amountMin;
      source = source.filter((q) => q.gte(q.field("amountMinorUnits"), amountMin));
    }
    if (args.filters.amountMax !== undefined) {
      const amountMax = args.filters.amountMax;
      source = source.filter((q) => q.lte(q.field("amountMinorUnits"), amountMax));
    }
    return source;
  }

  const page = [];
  const initialCursor = searchCursorFrom(args.paginationOpts.cursor);
  let cursor = initialCursor.searchCursor;
  let offset = initialCursor.offset;
  let isDone = false;
  const rawPageSize = rawSearchPageSize(args.paginationOpts.numItems);

  while (page.length < args.paginationOpts.numItems && !isDone) {
    const result = await searchSource().paginate({
      numItems: rawPageSize,
      cursor,
    });
    const pageOffset = offset;
    let index = pageOffset;
    offset = 0;

    for (const searchDoc of result.page.slice(pageOffset)) {
      index += 1;
      const txn = await ctx.db.get(searchDoc.transactionId);
      if (!txn) {
        continue;
      }
      const matches = await matchesFilters(
        ctx,
        txn,
        {
          type: args.filters.type,
          status: args.status,
          categoryIds: args.filters.categoryIds,
          recordedByMemberIds: args.recordedByMemberIds,
          paidByMemberIds: args.paidByMemberIds,
          amountMin: args.filters.amountMin,
          amountMax: args.filters.amountMax,
          queryText: "",
        },
        searchCaches,
      );
      if (matches) {
        page.push(
          await toTransactionView(ctx, txn, viewCaches, args.viewerMemberId, args.viewerIsOwner),
        );
        if (page.length === args.paginationOpts.numItems) {
          if (index < result.page.length) {
            return {
              page,
              isDone: false,
              continueCursor: encodeSearchCursor(cursor, index),
            };
          }
          return {
            page,
            isDone: result.isDone,
            continueCursor: result.continueCursor,
          };
        }
      }
    }

    cursor = result.continueCursor;
    isDone = result.isDone;
    if (result.page.length === 0) {
      break;
    }
  }

  return {
    page,
    isDone,
    continueCursor: cursor ?? "",
  };
}

function normalizeCommonFilters(
  ctx: QueryCtx,
  args: {
    type: "all" | "expense" | "income";
    status: "active" | "archived" | "all";
    query?: string;
    categoryIds?: string[];
    recordedByMemberIds?: string[];
    paidByMemberIds?: string[];
  },
) {
  const categoryIds = normalizeCategoryIds(ctx, args.categoryIds);
  const recordedByMemberIds = normalizeMemberIds(ctx, args.recordedByMemberIds);
  const paidByMemberIds = normalizeMemberIds(ctx, args.paidByMemberIds);
  return {
    type: selectedType(args.type),
    status: selectedStatus(args.status),
    queryText: normalizeSearchText(args.query),
    categoryIds,
    recordedByMemberIds,
    paidByMemberIds,
    hasOnlyUnknownIds:
      categoryIds.hasOnlyUnknown ||
      recordedByMemberIds.hasOnlyUnknown ||
      paidByMemberIds.hasOnlyUnknown,
  };
}

export const filterLedgerTransactions = query({
  args: {
    ...commonFilterArgs,
    month: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const access = await resolveCircleAccess(ctx, args.circleId);
    if (!access) {
      return emptyPage();
    }
    const month = isValidPlainMonth(args.month) ? args.month : currentMonth(new Date());
    const range = monthDateRange(month);
    const filters = normalizeCommonFilters(ctx, args);
    if (filters.hasOnlyUnknownIds) {
      return emptyPage();
    }

    return await collectTransactionViews(ctx, {
      circleId: args.circleId,
      viewerMemberId: access.membership._id,
      viewerIsOwner: access.isOwner,
      status: filters.status,
      paidByMemberIds: filters.paidByMemberIds.ids,
      recordedByMemberIds: filters.recordedByMemberIds.ids,
      start: range.start,
      endExclusive: range.endExclusive,
      paginationOpts: args.paginationOpts,
      filters: {
        type: filters.type,
        categoryIds: filters.categoryIds.ids,
        queryText: filters.queryText,
      },
    });
  },
});

export const searchTransactions = query({
  args: {
    ...commonFilterArgs,
    dateFrom: v.optional(v.string()),
    dateTo: v.optional(v.string()),
    amountMin: v.optional(v.number()),
    amountMax: v.optional(v.number()),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const access = await resolveCircleAccess(ctx, args.circleId);
    if (!access) {
      return emptyPage();
    }
    const window = resolveSearchWindow(args);
    if (
      !window.ok ||
      !validAmountBoundary(args.amountMin) ||
      !validAmountBoundary(args.amountMax)
    ) {
      throw new Error("Invalid search filters");
    }
    if ("empty" in window && window.empty) {
      return emptyPage();
    }
    if (
      args.amountMin !== undefined &&
      args.amountMax !== undefined &&
      args.amountMin > args.amountMax
    ) {
      return emptyPage();
    }

    const filters = normalizeCommonFilters(ctx, args);
    if (filters.hasOnlyUnknownIds) {
      return emptyPage();
    }

    return await collectTransactionViews(ctx, {
      circleId: args.circleId,
      viewerMemberId: access.membership._id,
      viewerIsOwner: access.isOwner,
      status: filters.status,
      paidByMemberIds: filters.paidByMemberIds.ids,
      recordedByMemberIds: filters.recordedByMemberIds.ids,
      start: window.start,
      endExclusive: window.endExclusive,
      paginationOpts: args.paginationOpts,
      filters: {
        type: filters.type,
        categoryIds: filters.categoryIds.ids,
        amountMin: args.amountMin,
        amountMax: args.amountMax,
        queryText: filters.queryText,
      },
    });
  },
});

function orderMembers(a: Doc<"members">, b: Doc<"members">) {
  if (a.role !== b.role) return a.role === "owner" ? -1 : 1;
  return a.joinedAt - b.joinedAt;
}

function orderCategories(a: Doc<"categories">, b: Doc<"categories">) {
  if (a.type !== b.type) return a.type === "expense" ? -1 : 1;
  return a.name.localeCompare(b.name);
}

export const getLedgerFilterOptions = query({
  args: {
    circleId: v.id("circles"),
    month: v.string(),
    type: filterType,
  },
  handler: async (ctx, args) => {
    const access = await resolveCircleAccess(ctx, args.circleId);
    if (!access) {
      return null;
    }
    const month = isValidPlainMonth(args.month) ? args.month : currentMonth(new Date());
    const type = selectedType(args.type);
    const transactions = await ctx.db
      .query("transactions")
      .withIndex("by_circle_and_month", (q) => q.eq("circleId", args.circleId).eq("month", month))
      .collect();

    const memberIds = new Set<Id<"members">>();
    const categoryIds = new Set<Id<"categories">>();
    for (const txn of transactions) {
      memberIds.add(txn.recordedByMemberId);
      memberIds.add(txn.paidByMemberId);
      if (!type || txn.type === type) {
        const links = await ctx.db
          .query("transactionCategories")
          .withIndex("by_transaction", (q) => q.eq("transactionId", txn._id))
          .collect();
        for (const link of links) {
          categoryIds.add(link.categoryId);
        }
      }
    }

    const categoryDocs: Doc<"categories">[] = [];
    for (const categoryId of categoryIds) {
      const category = await ctx.db.get(categoryId);
      if (category && (!type || category.type === type)) {
        categoryDocs.push(category);
      }
    }
    categoryDocs.sort(orderCategories);

    const memberDocs: Doc<"members">[] = [];
    for (const memberId of memberIds) {
      const member = await ctx.db.get(memberId);
      if (member) {
        memberDocs.push(member);
      }
    }
    memberDocs.sort(orderMembers);

    const viewer = { userId: access.user._id, isOwner: access.isOwner };
    return {
      categories: await Promise.all(
        categoryDocs.map((category) => toCategoryView(ctx, category, viewer)),
      ),
      members: memberDocs.map((member) => toMemberView(member, access.membership._id)),
    };
  },
});

export const getTransactionSearchOptions = query({
  args: {
    circleId: v.id("circles"),
    type: filterType,
  },
  handler: async (ctx, args) => {
    const access = await resolveCircleAccess(ctx, args.circleId);
    if (!access) {
      return null;
    }
    const type = selectedType(args.type);
    const categories = type
      ? await ctx.db
          .query("categories")
          .withIndex("by_circle_type_createdAt", (q) =>
            q.eq("circleId", args.circleId).eq("type", type),
          )
          .collect()
      : await ctx.db
          .query("categories")
          .withIndex("by_circle", (q) => q.eq("circleId", args.circleId))
          .collect();
    categories.sort(orderCategories);

    const members = await ctx.db
      .query("members")
      .withIndex("by_circle", (q) => q.eq("circleId", args.circleId))
      .collect();
    members.sort(orderMembers);

    const viewer = { userId: access.user._id, isOwner: access.isOwner };
    return {
      categories: await Promise.all(
        categories.map((category) => toCategoryView(ctx, category, viewer)),
      ),
      members: members.map((member) => toMemberView(member, access.membership._id)),
    };
  },
});
