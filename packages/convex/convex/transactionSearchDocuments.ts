import { transactionSearchText } from "@spend-circle/domain";
import type { Doc } from "./_generated/dataModel.js";
import type { MutationCtx } from "./_generated/server.js";

function projection(txn: Doc<"transactions">) {
  return {
    transactionId: txn._id,
    circleId: txn.circleId,
    searchText: transactionSearchText({ title: txn.title, note: txn.note }),
    type: txn.type,
    status: txn.status,
    recordedByMemberId: txn.recordedByMemberId,
    paidByMemberId: txn.paidByMemberId,
    date: txn.date,
    amountMinorUnits: txn.amountMinorUnits,
  };
}

export async function syncTransactionSearchDocument(ctx: MutationCtx, txn: Doc<"transactions">) {
  const next = projection(txn);
  const existing = await ctx.db
    .query("transactionSearchDocuments")
    .withIndex("by_transaction", (q) => q.eq("transactionId", txn._id))
    .unique();
  if (existing) {
    await ctx.db.patch(existing._id, next);
    return;
  }
  await ctx.db.insert("transactionSearchDocuments", next);
}
