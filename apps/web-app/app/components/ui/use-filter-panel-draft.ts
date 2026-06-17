import { useState } from "react";

/**
 * Single owner of a filter panel's draft lifecycle, so every panel discards unapplied edits
 * on close by construction instead of each route hand-rolling its own sync effect.
 *
 * `applied` is the source of truth — typically the filters derived from the URL each render.
 * Edits live only in the returned `draft` until the route commits them (Apply); they never
 * leak past a close:
 *
 * - `onOpenChange` is wired straight to `FilterPanel`/Base UI's `Dialog`, whose
 *   `onOpenChange(false)` fires for the X button, backdrop / outside click, Esc, and
 *   programmatic close alike. Routing every close through that one `false` transition makes
 *   discard-on-close cover all mediums by construction — the panel-owned draft fields snap
 *   back to `applied`.
 * - The draft re-syncs to `applied` whenever the applied filters change underneath — a
 *   sibling navigation, pagination, or the route's own Apply/Reset commit — via an
 *   adjust-during-render compare keyed on a serialization of `applied` (no effect, no flash).
 *   Apply/Reset commit to the URL first, so this compare overrides the close-time discard
 *   with the freshly-applied state.
 */
export function useFilterPanelDraft<TFilters>(applied: TFilters) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(applied);
  const appliedKey = JSON.stringify(applied);
  const [syncedKey, setSyncedKey] = useState(appliedKey);

  if (appliedKey !== syncedKey) {
    setSyncedKey(appliedKey);
    setDraft(applied);
  }

  const onOpenChange = (next: boolean) => {
    if (!next) {
      setDraft(applied);
    }
    setOpen(next);
  };

  return {
    open,
    openPanel: () => setOpen(true),
    onOpenChange,
    draft,
    setDraft,
  };
}
