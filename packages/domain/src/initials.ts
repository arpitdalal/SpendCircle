/**
 * Generated initials for a name — the basis of a member's initials avatar when
 * no Profile Picture is available, and reusable for the Circle Mark (CONTEXT:
 * "generated visual mark … based on its initials"). Pure and presentation-free:
 * the caller decides color and shape.
 *
 * Takes the first grapheme of the first and last whitespace-delimited word
 * (single word ⇒ one letter), uppercased, so "Olive Owner" ⇒ "OO" and "Alex" ⇒
 * "A". Falls back to "?" for empty/whitespace-only input.
 *
 * Segments by grapheme CLUSTER (via `Intl.Segmenter`), not code point: a single
 * user-perceived character can span several code points — a regional-indicator
 * flag (`🇮🇳`), a ZWJ emoji sequence (`👨‍👩‍👧`), or a base letter plus a combining
 * accent (`e`+◌́). Slicing by code point would emit half a flag or a bare accent,
 * so the avatar must read whole clusters to honor names that start with them.
 */
const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return "?";
  }
  const firstOf = (word: string) => {
    for (const { segment } of graphemes.segment(word)) {
      return segment;
    }
    return "";
  };
  const picked =
    words.length === 1
      ? firstOf(words[0] ?? "")
      : firstOf(words[0] ?? "") + firstOf(words[words.length - 1] ?? "");
  return picked.toUpperCase();
}
