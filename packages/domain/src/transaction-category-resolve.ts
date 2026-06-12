/**
 * Submit-time resolution for Transaction category chip selections (PRD 57).
 * Mirrors the server's already-attached / block-newly-archived asymmetry (ADR 0015).
 */

/** Minimal row shape the resolver needs from any client (web today, native later). */
export type CategoryResolveRow = {
  id: string;
  name: string;
  status: "active" | "archived";
};

export type ResolveCategoriesResult<Id extends string = string> =
  | { ok: true; categoryIds: Id[] }
  | { ok: false; reason: "unresolved" }
  | { ok: false; reason: "newly_archived"; categories: CategoryResolveRow[] };

/**
 * Maps each selected id through `categoryById`. Fails closed if any id is missing
 * from the map (stale selection / unloaded circle). Blocks when an archived category
 * is selected that was not already attached at form open.
 *
 * `categoryIds` in the success branch use each resolved row's `id` type (e.g. branded
 * Convex ids when `Row` is the app's Category view).
 */
export function resolveCategories<Row extends CategoryResolveRow>(
  selectedIds: readonly string[],
  categoryById: ReadonlyMap<string, Row>,
  alreadyAttached: ReadonlySet<string>,
): ResolveCategoriesResult<Row["id"]> {
  const resolved: Row[] = [];
  for (const id of selectedIds) {
    const row = categoryById.get(id);
    if (!row) {
      return { ok: false, reason: "unresolved" };
    }
    resolved.push(row);
  }
  const newlyArchived = resolved.filter(
    (category) => category.status === "archived" && !alreadyAttached.has(category.id),
  );
  if (newlyArchived.length > 0) {
    return { ok: false, reason: "newly_archived", categories: newlyArchived };
  }
  return { ok: true, categoryIds: resolved.map((category) => category.id) };
}
