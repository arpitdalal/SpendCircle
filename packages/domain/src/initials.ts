/**
 * Generated initials for a name — the basis of a member's initials avatar when
 * no Profile Picture is available, and reusable for the Circle Mark (CONTEXT:
 * "generated visual mark … based on its initials"). Pure and presentation-free:
 * the caller decides color and shape.
 *
 * Takes the first LETTER-OR-NUMBER grapheme of each whitespace-delimited word,
 * then uses the first and last of those (single ⇒ one glyph), uppercased, so
 * "Olive Owner" ⇒ "OO" and "Alex" ⇒ "A". Words that contribute no alphanumeric
 * glyph are skipped wherever they sit, so a leading/trailing/interior emoji or
 * symbol token never steals an initial: "🦊 Alex Smith" ⇒ "AS", not "S". Falls
 * back to "?" when a name yields no alphanumeric glyph at all (empty,
 * whitespace-only, or symbol/emoji-only).
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
  const firstGlyphOf = (word: string) => {
    for (const { segment } of graphemes.segment(word)) {
      if (alphanumeric.test(segment)) {
        return segment;
      }
    }
    return "";
  };
  // Reduce each word to its first alphanumeric glyph and drop the empties FIRST,
  // so non-glyph tokens anywhere (not just first/last) are ignored before the
  // first/last pick.
  const glyphs = name.trim().split(/\s+/).map(firstGlyphOf).filter(Boolean);
  if (glyphs.length === 0) {
    return "?";
  }
  const first = glyphs[0] ?? "";
  const last = glyphs[glyphs.length - 1] ?? "";
  return (glyphs.length === 1 ? first : first + last).toUpperCase();
}
