/**
 * Generated initials for a name — the basis of a member's initials avatar when
 * no Profile Picture is available, and reusable for the Circle Mark (CONTEXT:
 * "generated visual mark … based on its initials"). Pure and presentation-free:
 * the caller decides color and shape.
 *
 * Takes the first grapheme of the first and last whitespace-delimited word
 * (single word ⇒ one letter), uppercased, so "Olive Owner" ⇒ "OO" and "Alex" ⇒
 * "A". Reads a full code point (not a half surrogate pair) so emoji and extended
 * names survive; falls back to "?" for empty/whitespace-only input.
 */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return "?";
  }
  const firstOf = (word: string) => Array.from(word)[0] ?? "";
  const picked =
    words.length === 1
      ? firstOf(words[0] ?? "")
      : firstOf(words[0] ?? "") + firstOf(words[words.length - 1] ?? "");
  return picked.toUpperCase();
}
