import type { Member } from "~/lib/data.js";

/**
 * Resolves a selected Paid By (a form string) to a current Member's branded id.
 *
 * Returns `{ ok: false }` only when a NON-EMPTY selection no longer matches a current
 * Member AND isn't the Transaction's existing Paid By — i.e. the picked Member was
 * removed from the Circle while the form was open. The caller BLOCKS submit on that
 * with a visible message rather than silently dropping the change to self / leaving it
 * unchanged (README §4 "no silent failures"; a stale form must never "succeed" — see
 * QA-1). Keeping the existing Paid By (even a now-Removed one) stays an allowed no-op,
 * and an empty selection defers to the server default — mirroring the keep-attached /
 * block-newly-added asymmetry the archived-Category guard uses (QA-2). The server is
 * the authority either way (ADR 0015); this is the courtesy that surfaces the hazard.
 *
 * No cast: the resolved id is the branded `Member["id"]` off the loaded `members` row
 * or the Transaction's own Paid By — never the opaque form string widened to an id.
 */
export function resolvePaidBy(
  selected: string,
  members: Member[],
  currentPaidById?: Member["id"],
): { ok: true; memberId?: Member["id"] } | { ok: false } {
  if (!selected) {
    return { ok: true, memberId: undefined }; // nothing picked → server applies its default
  }
  const current = members.find((member) => member.id === selected)?.id;
  if (current) {
    return { ok: true, memberId: current };
  }
  if (currentPaidById && selected === currentPaidById) {
    return { ok: true, memberId: currentPaidById }; // unchanged existing Paid By — a no-op
  }
  return { ok: false }; // selected Member is gone — block, don't drop
}
