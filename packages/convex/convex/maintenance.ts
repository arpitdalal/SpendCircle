import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel.js";
import type { MutationCtx } from "./_generated/server.js";
import { mutation } from "./_generated/server.js";
import {
  syncTransactionSearchDocument,
  transactionSearchBackfillKey,
} from "./transactionSearchDocuments.js";

/**
 * One bounded backfill page for GH-91's Transaction search projection rows.
 * Run repeatedly with the returned cursor until `isDone` is true.
 */
function requireOperatorKey(operatorKey: string, expected: string | undefined, label: string) {
  if (!expected || operatorKey !== expected) {
    throw new Error(`Invalid ${label} backfill key`);
  }
}

function requireTransactionSearchBackfillKey(operatorKey: string) {
  requireOperatorKey(
    operatorKey,
    process.env.TRANSACTION_SEARCH_BACKFILL_KEY,
    "transaction search",
  );
}

function requireUserOnboardingBackfillKey(operatorKey: string) {
  requireOperatorKey(operatorKey, process.env.USER_ONBOARDING_BACKFILL_KEY, "user onboarding");
}

async function upsertBackfillState(
  ctx: MutationCtx,
  fields: Omit<Doc<"transactionSearchBackfills">, "_id" | "_creationTime" | "key">,
) {
  const existing = await ctx.db
    .query("transactionSearchBackfills")
    .withIndex("by_key", (q) => q.eq("key", transactionSearchBackfillKey))
    .unique();
  if (existing) {
    await ctx.db.patch(existing._id, fields);
    return;
  }
  await ctx.db.insert("transactionSearchBackfills", {
    key: transactionSearchBackfillKey,
    ...fields,
  });
}

export const backfillTransactionSearchText = mutation({
  args: {
    operatorKey: v.string(),
    paginationOpts: paginationOptsValidator,
    reset: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    requireTransactionSearchBackfillKey(args.operatorKey);
    const existing = await ctx.db
      .query("transactionSearchBackfills")
      .withIndex("by_key", (q) => q.eq("key", transactionSearchBackfillKey))
      .unique();
    if (!args.reset && existing?.status === "complete") {
      return {
        synced: 0,
        scanned: 0,
        totalSynced: existing.synced,
        totalScanned: existing.scanned,
        isDone: true,
        continueCursor: "",
      };
    }

    const paginationOpts = args.reset
      ? { ...args.paginationOpts, cursor: null }
      : args.paginationOpts;
    const result = await ctx.db.query("transactions").paginate(paginationOpts);
    let synced = 0;
    for (const txn of result.page) {
      synced += 1;
      await syncTransactionSearchDocument(ctx, txn);
    }
    const baseSynced = args.reset ? 0 : (existing?.synced ?? 0);
    const baseScanned = args.reset ? 0 : (existing?.scanned ?? 0);
    const totalSynced = baseSynced + synced;
    const totalScanned = baseScanned + result.page.length;
    const now = Date.now();
    await upsertBackfillState(ctx, {
      status: result.isDone ? "complete" : "pending",
      synced: totalSynced,
      scanned: totalScanned,
      updatedAt: now,
      completedAt: result.isDone ? now : undefined,
    });

    return {
      synced,
      scanned: result.page.length,
      totalSynced,
      totalScanned,
      isDone: result.isDone,
      continueCursor: result.continueCursor,
    };
  },
});

/**
 * Grandfathers existing Users as onboarded before `onboardingCompletedAt` becomes
 * required (USR-1). Run repeatedly with the returned cursor until `isDone` is true.
 */
export const backfillUserOnboardingCompleted = mutation({
  args: {
    operatorKey: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    requireUserOnboardingBackfillKey(args.operatorKey);
    const result = await ctx.db.query("users").paginate(args.paginationOpts);
    let patched = 0;
    for (const user of result.page) {
      if (user.onboardingCompletedAt === null) {
        await ctx.db.patch(user._id, { onboardingCompletedAt: user.createdAt });
        patched += 1;
      }
    }
    return {
      patched,
      scanned: result.page.length,
      isDone: result.isDone,
      continueCursor: result.continueCursor,
    };
  },
});
