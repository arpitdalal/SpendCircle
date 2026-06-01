import type { Doc, Id } from "./_generated/dataModel.js";
import type { MutationCtx, QueryCtx } from "./_generated/server.js";

/**
 * The immutable history audit (ADR 0018). Every Circle, Transaction, and
 * Category change is recorded as one append-only row — the event IS the row —
 * through `recordEvent`. This module is the single home of that write: handlers
 * never `ctx.db.insert("histories", …)` directly, so the event shape and the
 * "no raw IDs, frozen text" invariant live in exactly one place.
 *
 * The audit is immutable: each `change` carries human-readable strings formatted
 * ONCE here at write time and never re-resolved, so a line always shows what was
 * true when it was written. Callers are responsible for formatting `from`/`to`
 * with the right domain context BEFORE handing them over — money via the Circle
 * Currency (ADR 0009), dates as plain `YYYY-MM-DD`, Members as their Display
 * Name, Categories as their names — and must never pass a raw internal id. The
 * typed `*Entity` constructors below are the only way to name the audited
 * entity, which keeps a stray string from being mistaken for an entity id.
 *
 * Deliberately NOT here yet: shared `describeChange`-style formatters for money /
 * dates / Member / Category values. The only events recorded today are Circle
 * "created"/"renamed", whose values are plain names that need no formatting.
 * Building generic formatters now would be untested, caller-less code (it fails
 * the deletion test). They belong next to the first Transaction/Category event
 * that needs them, composed at the call site from the domain helpers — `recordEvent`
 * already accepts pre-formatted strings precisely so that composition stays at the
 * boundary and the audit's frozen-text invariant is never the formatter's problem.
 */

/** A change to one field of an entity. `from` is omitted on a created event, `to` on an archived one. */
export interface HistoryChange {
  field: string;
  from?: string;
  to?: string;
}

/**
 * The audited entity, produced by the typed `*Entity` constructors. Wrapping the
 * id in a branded carrier (rather than passing a bare string) means `recordEvent`
 * cannot be handed an arbitrary string, and the call site reads as the entity it
 * audits.
 */
export interface HistoryEntity {
  readonly entityId: string;
}

export function circleEntity(id: Id<"circles">): HistoryEntity {
  return { entityId: id };
}

export function transactionEntity(id: Id<"transactions">): HistoryEntity {
  return { entityId: id };
}

export function categoryEntity(id: Id<"categories">): HistoryEntity {
  return { entityId: id };
}

export interface RecordEventArgs {
  /** The audited entity (use a `*Entity` constructor). */
  entity: HistoryEntity;
  /** The acting Member, or null for a system action. */
  actor: Doc<"members"> | null;
  /** The action verb, e.g. "created" | "renamed" | "archived". */
  action: string;
  /** Field-level changes, with `from`/`to` already formatted as frozen human strings. */
  changes: HistoryChange[];
}

/**
 * Appends one immutable event row to the audit. The only writer of `histories`.
 */
export async function recordEvent(ctx: MutationCtx, args: RecordEventArgs): Promise<void> {
  await ctx.db.insert("histories", {
    entityId: args.entity.entityId,
    actorMemberId: args.actor?._id,
    action: args.action,
    changes: args.changes,
    createdAt: Date.now(),
  });
}

/** An entity's history, newest first — the canonical read for a detail surface (PRD story 80). */
export async function listEntityHistory(
  ctx: QueryCtx | MutationCtx,
  entity: HistoryEntity,
): Promise<Doc<"histories">[]> {
  return await ctx.db
    .query("histories")
    .withIndex("by_entity", (q) => q.eq("entityId", entity.entityId))
    .order("desc")
    .collect();
}
