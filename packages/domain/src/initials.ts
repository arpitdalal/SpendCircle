/**
 * Generated initials for a name — the basis of a member's initials avatar when
 * no Profile Picture is available, and reusable for the Circle Mark (CONTEXT:
 * "generated visual mark … based on its initials"). Pure and presentation-free:
 * the caller decides color and shape.
 *
 * Takes the first LETTER-OR-NUMBER grapheme of the first and last
 * whitespace-delimited word (single word ⇒ one glyph), uppercased, so "Olive
 * Owner" ⇒ "OO" and "Alex" ⇒ "A". Falls back to "?" when a name yields no
 * alphanumeric glyph (empty, whitespace-only, or symbol/emoji-only).
 *
 * Segments by grapheme CLUSTER (via `Intl.Segmenter`), not code point, so a base
 * letter plus a combining accent stays whole: NFD-decomposed "Élodie" reads "É",
 * not a bare "e" with the accent dropped (the common case for European names on
 * an English app). Emoji and flags are skipped rather than rendered — a name
 * starting with "🦊 Fox" reads "F", and "🦊" alone reads "?" — so the chip stays
 * a clean monochrome glyph instead of an off-palette color emoji.
 */
const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const alphanumeric = /\p{L}|\p{N}/u;

export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const firstGlyphOf = (word: string) => {
    for (const { segment } of graphemes.segment(word)) {
      if (alphanumeric.test(segment)) {
        return segment;
      }
    }
    return "";
  };
  const picked =
    words.length === 0
      ? ""
      : words.length === 1
        ? firstGlyphOf(words[0] ?? "")
        : firstGlyphOf(words[0] ?? "") + firstGlyphOf(words[words.length - 1] ?? "");
  return picked.toUpperCase() || "?";
}
