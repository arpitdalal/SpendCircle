import { currentMonth, isValidPlainMonth } from "@spend-circle/domain";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel.js";
import { type QueryCtx, query } from "./_generated/server.js";
import { resolveCircleAccess } from "./guard.js";
import { toMemberView } from "./members.js";
import { monthDateRange, newViewCaches, toTransactionView } from "./transactions.js";

/**
 * How many recent Transactions the Dashboard surfaces (PRD story 75). A small,
 * glanceable feed — not a list view (that is the Monthly Ledger, RPT-1) — so the
 * recent slice stays bounded regardless of how busy the month is.
 */
export const RECENT_TRANSACTIONS_LIMIT = 5;

/**
 * Collects ONE Circle-month's active Transactions, the single active set the
 * Dashboard derives BOTH its totals and its recent feed from (RPT-3) — so a Paid By
 * filter narrows them together and they can never disagree about what counts.
 *
 * The set is bounded to one month at the source: the unfiltered read ranges
 * `by_circle_status_date` to `[month, next-month)` active-only (the same bounded
 * aggregate the Monthly Ledger totals use — RPT-1), and a Paid By filter ranges
 * `by_circle_paidby_status_date` so ONE Member's month is read at the source rather
 * than scanning the whole month and filtering in memory (README §4). Either way the
 * range is a single month, the sanctioned bounded-aggregate read; a maintained
 * running aggregate (@convex-dev/aggregate) is the next-level optimization if a
 * single month's volume ever warrants it, deferred for v1.
 */
async function collectMonthActiveTransactions(
  ctx: QueryCtx,
  circleId: Id<"circles">,
  month: string,
  paidByMemberId: Id<"members"> | undefined,
): Promise<Doc<"transactions">[]> {
  const range = monthDateRange(month);
  if (paidByMemberId) {
    return await ctx.db
      .query("transactions")
      .withIndex("by_circle_paidby_status_date", (q) =>
        q
          .eq("circleId", circleId)
          .eq("paidByMemberId", paidByMemberId)
          .eq("status", "active")
          .gte("date", range.start)
          .lt("date", range.endExclusive),
      )
      .collect();
  }
  return await ctx.db
    .query("transactions")
    .withIndex("by_circle_status_date", (q) =>
      q
        .eq("circleId", circleId)
        .eq("status", "active")
        .gte("date", range.start)
        .lt("date", range.endExclusive),
    )
    .collect();
}

/**
 * The per-Circle Dashboard surface for one month (RPT-3; PRD stories 68, 69, 75).
 * Returns that month's Income / Expense / Net **in minor units** (ADR 0009 — the
 * edge formats once, never sums formatted strings), a bounded **recent** feed of
 * the latest Transactions by record time, the Circle Currency, and the resolved
 * `month`. Only **active** Transactions count — archived are frozen and excluded
 * from reporting (TXN-3 contract).
 *
 * `month` defaults to the current month (server clock) when omitted; the route
 * passes the User's local current month so the Dashboard reads as "this month" for
 * them. An explicit malformed month throws, mirroring the Ledger.
 *
 * `paidByMemberId` narrows the SAME active set (Paid By filter — PRD 69): totals and
 * recent both reflect just that Member's month. A Removed Member's id is accepted —
 * their historical Transactions still count and surface (CONTEXT: Dashboard filters
 * include Removed Members when matching Transactions exist) — and an id naming no
 * Member of this Circle simply matches nothing (zeros + empty recent), leaking
 * nothing about it.
 *
 * Totals and recent come from one `collect` of the bounded month set (see
 * {@link collectMonthActiveTransactions}); recent is that set ordered by record time
 * (`createdAt` desc, `_creationTime` desc tiebreak) and capped at
 * {@link RECENT_TRANSACTIONS_LIMIT}, then resolved to full Transaction views (Paid
 * By / Categories memoized per query to avoid N+1). Recent is intentionally
 * record-time order — what was most recently ENTERED — distinct from the Ledger's
 * Transaction-Date order, so a backfilled old Transaction still shows as recent
 * activity.
 *
 * Anti-enumeration (ADR 0016): an inaccessible or missing Circle returns `null`,
 * indistinguishable from each other.
 */
export const getDashboard = query({
  args: {
    circleId: v.id("circles"),
    month: v.optional(v.string()),
    paidByMemberId: v.optional(v.id("members")),
  },
  handler: async (ctx, args) => {
    const access = await resolveCircleAccess(ctx, args.circleId);
    if (!access) {
      return null;
    }

    const month = args.month ?? currentMonth(new Date());
    if (!isValidPlainMonth(month)) {
      throw new Error("Invalid month");
    }

    const monthTxns = await collectMonthActiveTransactions(
      ctx,
      args.circleId,
      month,
      args.paidByMemberId,
    );

    let incomeMinor = 0;
    let expenseMinor = 0;
    for (const txn of monthTxns) {
      if (txn.type === "income") {
        incomeMinor += txn.amountMinorUnits;
      } else {
        expenseMinor += txn.amountMinorUnits;
      }
    }

    // Recent = the same bounded set, ordered by record time and capped. Sorting a
    // single bounded month in memory is fine (README §4 forbids sorting UNBOUNDED
    // sets); only the capped slice is resolved to full views, so the per-row Paid
    // By / Category resolution stays bounded by the cap, not the month size.
    const recentDocs = [...monthTxns]
      .sort((a, b) => b.createdAt - a.createdAt || b._creationTime - a._creationTime)
      .slice(0, RECENT_TRANSACTIONS_LIMIT);
    const caches = newViewCaches();
    const recent = await Promise.all(
      recentDocs.map((txn) => toTransactionView(ctx, txn, caches, access.membership._id)),
    );

    return {
      totals: { incomeMinor, expenseMinor, netMinor: incomeMinor - expenseMinor },
      recent,
      currency: access.circle.currency,
      month,
    };
  },
});

/**
 * The Members selectable in the Dashboard's Paid By filter (RPT-3; CONTEXT Paid By):
 * every CURRENT Member, plus Removed Members who are Paid By on at least one **active**
 * Transaction — a removed Member with no matching Transaction is NOT offered, matching
 * Search (RPT-2 reuses this). Active Members come first (Owner first, then by join
 * time — the Member List anchor, PRD 43); relevant Removed Members follow in join
 * order. Each row carries its `status`, so the UI can label a Removed option distinctly.
 *
 * Removed-Member relevance is one indexed existence check per Removed Member
 * (`by_circle_paidby_status_date`, `.first()`) — bounded by the Circle's removed count,
 * never a Transaction scan (README §4). Resolver query (ADR 0016): an inaccessible or
 * missing Circle returns `null`, identical to a non-member.
 */
export const getPaidByFilterOptions = query({
  args: { circleId: v.id("circles") },
  handler: async (ctx, args) => {
    const access = await resolveCircleAccess(ctx, args.circleId);
    if (!access) {
      return null;
    }

    const members = await ctx.db
      .query("members")
      .withIndex("by_circle", (q) => q.eq("circleId", args.circleId))
      .collect();

    const byOwnerThenJoin = (a: Doc<"members">, b: Doc<"members">) => {
      if (a.role !== b.role) {
        return a.role === "owner" ? -1 : 1;
      }
      return a.joinedAt - b.joinedAt;
    };

    const active = members.filter((member) => member.status === "active").sort(byOwnerThenJoin);

    const relevantRemoved: Doc<"members">[] = [];
    for (const member of members) {
      if (member.status !== "removed") {
        continue;
      }
      const matched = await ctx.db
        .query("transactions")
        .withIndex("by_circle_paidby_status_date", (q) =>
          q.eq("circleId", args.circleId).eq("paidByMemberId", member._id).eq("status", "active"),
        )
        .first();
      if (matched) {
        relevantRemoved.push(member);
      }
    }
    relevantRemoved.sort(byOwnerThenJoin);

    return [...active, ...relevantRemoved].map((member) =>
      toMemberView(member, access.membership._id),
    );
  },
});
