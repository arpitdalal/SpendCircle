import type { Doc, Id } from "./_generated/dataModel.js";
import type { MutationCtx, QueryCtx } from "./_generated/server.js";
import { getCurrentUserOrNull } from "./auth.js";

/**
 * The single Circle-access module (ADR 0015). Every Convex function that
 * operates on an existing Circle resolves identity, membership, and
 * capabilities through here instead of re-deriving them inline, so the
 * missing≡inaccessible rule (ADR 0016) and the read-only-when-archived rule each
 * have exactly one home.
 *
 * Two functions over one resolver:
 *   - `resolveCircleAccess` NEVER throws — a missing Circle, a non-member, a
 *     removed Member, and an unauthenticated caller all collapse to `null`. It
 *     feeds queries and the staged route guard (`circles.getCircle`).
 *   - `requireCircleAccess` is `resolve ?? throw` — the single home of the throw.
 *     It feeds mutations.
 * There is deliberately no `{ throwOnMissing }` flag: a boolean that flips the
 * error mode makes the return type conditional and callers get it wrong. Pick
 * resolve (null) or require (throw) at the call site.
 *
 * Boundary: this module is for operations on an EXISTING Circle. Circle-less
 * operations keep `requireCurrentUser` (auth.ts): `listMyCircles` (lists across
 * Circles), `createCircle` (no prior access), `users.setAnalyticsOptOut`.
 *
 * Capabilities here are Circle-level only (`isOwner`, `isWritable`). Entity-level
 * permission — a Transaction editable only by its Recorded By Member, a Category
 * by its creator, the Owner able to archive either — composes OVER this rather
 * than being inlined; the intended shape:
 *
 *   async function requireTransactionAccess(ctx, txnId) {
 *     const txn = await ctx.db.get(txnId)
 *     const access = await requireCircleAccess(ctx, txn.circleId)  // reuse, don't re-derive
 *     return { ...access, transaction: txn,
 *       isRecorder: txn.recordedByMemberId === access.membership._id,
 *       canArchive: txn.recordedByMemberId === access.membership._id || access.isOwner }
 *   }
 *
 * (`canModerate` is intentionally absent: it would be a synonym for `isOwner`
 * today — one adapter, a hypothetical seam — and is added only when a non-owner
 * moderation case actually appears.)
 *
 * Canonical mutating-handler shape (the pattern to copy):
 *   const access = await requireCircleAccess(ctx, circleId)
 *   access.assertWritable()                  // skip for read-only queries
 *   // ... perform the mutation ...
 *   await recordEvent(ctx, { entity, actor: access.membership, action, changes })
 */

/**
 * A Circle the caller can currently access, with their membership and the
 * Circle-level capabilities derived once. Returned by `resolveCircleAccess`
 * (nullable) and `requireCircleAccess` (non-null).
 */
export interface AuthorizedCircle {
  user: Doc<"users">;
  membership: Doc<"members">;
  circle: Doc<"circles">;
  /** The caller is the Circle's Owner. */
  isOwner: boolean;
  /** The Circle is active; an archived Circle is read-only (PRD story 79). */
  isWritable: boolean;
  /** Throws "Circle is archived" unless the Circle is writable — the one home of that guard. */
  assertWritable(): void;
}

/** Returns the caller's active membership in a Circle, or null when not an active member. */
export async function getActiveMembership(
  ctx: QueryCtx | MutationCtx,
  circleId: Id<"circles">,
  userId: Id<"users">,
): Promise<Doc<"members"> | null> {
  const membership = await ctx.db
    .query("members")
    .withIndex("by_circle_and_user", (q) => q.eq("circleId", circleId).eq("userId", userId))
    .unique();
  if (!membership || membership.status !== "active") {
    return null;
  }
  return membership;
}

/**
 * Resolves Circle access without ever throwing. The single home of the
 * missing≡inaccessible rule (ADR 0016): an unauthenticated caller, a missing
 * Circle, a non-member, and a removed Member are all indistinguishable `null`.
 */
export async function resolveCircleAccess(
  ctx: QueryCtx | MutationCtx,
  circleId: Id<"circles">,
): Promise<AuthorizedCircle | null> {
  const user = await getCurrentUserOrNull(ctx);
  if (!user) {
    return null;
  }
  const circle = await ctx.db.get(circleId);
  if (!circle) {
    return null;
  }
  const membership = await getActiveMembership(ctx, circleId, user._id);
  if (!membership) {
    return null;
  }
  const isOwner = membership.role === "owner";
  const isWritable = circle.status === "active";
  return {
    user,
    membership,
    circle,
    isOwner,
    isWritable,
    assertWritable() {
      if (!isWritable) {
        throw new Error("Circle is archived");
      }
    },
  };
}

/**
 * Resolves Circle access or throws. The single home of the throw; feeds
 * mutations. Uses the same generic "Circle not found" message for missing and
 * inaccessible so nothing about a Circle's existence leaks (ADR 0016).
 *
 * Note this folds auth in: an UNAUTHENTICATED caller also gets "Circle not
 * found", not "Not authenticated". That is intentional — the UI never shows a
 * mutating form to an unauthenticated User (the protected layout gates the app,
 * ADR 0017), so this throw is reached only by a session that expired/was revoked
 * mid-flight or a direct API call, and in those cases the anti-enumeration stance
 * (ADR 0016) says not to confirm the Circle exists either. This is server-side
 * defense-in-depth (ADR 0015), independent of what the client rendered.
 */
export async function requireCircleAccess(
  ctx: QueryCtx | MutationCtx,
  circleId: Id<"circles">,
): Promise<AuthorizedCircle> {
  const access = await resolveCircleAccess(ctx, circleId);
  if (!access) {
    throw new Error("Circle not found");
  }
  return access;
}
