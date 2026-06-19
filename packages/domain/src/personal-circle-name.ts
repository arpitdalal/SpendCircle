/**
 * Default name for a User's Personal Circle from their Display Name at bootstrap
 * and identity reconcile (Onboarding + Settings — USR-1), while auto-tracking is
 * active. Pure helper — the caller derives the Mark via {@link initials}.
 */
const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const alphanumeric = /\p{L}|\p{N}/u;

function tokenHasLetterOrNumber(token: string) {
  for (const { segment } of graphemes.segment(token)) {
    if (alphanumeric.test(segment)) {
      return true;
    }
  }
  return false;
}

export function personalCircleName(displayName: string) {
  const trimmed = displayName.trim();
  if (!trimmed) {
    return "Personal Circle";
  }
  const firstToken = trimmed.split(/\s+/)[0] ?? "";
  if (!firstToken || !tokenHasLetterOrNumber(firstToken)) {
    return "Personal Circle";
  }
  return `${firstToken}'s Circle`;
}
