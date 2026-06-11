import { paginationOptsValidator } from "convex/server";
import { internalMutation } from "./_generated/server.js";
import { syncTransactionSearchDocument } from "./transactionSearchDocuments.js";

/**
 * One bounded backfill page for GH-91's Transaction search projection rows.
 * Run repeatedly with the returned cursor until `isDone` is true.
 */
export const backfillTransactionSearchText = internalMutation({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const result = await ctx.db.query("transactions").paginate(args.paginationOpts);
    let synced = 0;
    for (const txn of result.page) {
      synced += 1;
      await syncTransactionSearchDocument(ctx, txn);
    }
    return {
      synced,
      scanned: result.page.length,
      isDone: result.isDone,
      continueCursor: result.continueCursor,
    };
  },
});
