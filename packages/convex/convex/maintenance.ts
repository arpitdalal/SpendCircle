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
function requireOperatorKey(operatorKey: string) {
  const expected = process.env.TRANSACTION_SEARCH_BACKFILL_KEY;
  if (!expected || operatorKey !== expected) {
    throw new Error("Invalid transaction search backfill key");
  }
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
    requireOperatorKey(args.operatorKey);
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

    const result = await ctx.db.query("transactions").paginate(args.paginationOpts);
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
