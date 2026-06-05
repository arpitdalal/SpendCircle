import { initials, paletteColorForSeed } from "@spend-circle/domain";
import { useState } from "react";
import { cn } from "~/lib/utils.js";

/**
 * The visual identity for a Member/User: their Profile Picture when present and
 * loadable, otherwise a generated initials avatar (CONTEXT: "if Google does not
 * provide one, Spend Circle uses a generated initials avatar"). The fallback also
 * fires when a present URL fails to LOAD (`onError`) — Google's profile-image
 * URLs can expire/403 over time, so an image prop being set is not a guarantee it
 * renders; without this a dead URL would show a broken image instead of initials.
 *
 * When `seed` is given (a stable, opaque id — e.g. the Member id, never the name)
 * the initials chip is tinted with a deterministic palette color so a list of
 * members is scannable; the tint is name-independent, so it stays put if the
 * Display Name changes. Without a seed it falls back to a neutral chip.
 *
 * Purely decorative — `aria-hidden`, empty `alt` — because every surface that
 * renders it shows the Display Name in adjacent text; announcing the avatar too
 * would double-read the name.
 */
export function Avatar({
  name,
  image,
  seed,
  className,
}: {
  name: string;
  image?: string;
  seed?: string;
  className?: string;
}) {
  // Track the URL that failed rather than a bare boolean, so a new `image` URL is
  // retried instead of being suppressed by a stale failure flag.
  const [brokenSrc, setBrokenSrc] = useState<string | null>(null);
  const base = "size-9 shrink-0 rounded-full";

  if (image && image !== brokenSrc) {
    return (
      <img
        src={image}
        alt=""
        aria-hidden
        onError={() => setBrokenSrc(image)}
        className={cn(base, "object-cover", className)}
      />
    );
  }

  const color = seed ? paletteColorForSeed(seed) : undefined;
  // Soft-badge treatment: a faint wash of the color (15% alpha) behind the color
  // itself as the glyph. The palette is curated to be legible on dark, so color-
  // on-dark stays readable — light text on a saturated fill would not.
  const style = color ? { backgroundColor: `${color.hex}26`, color: color.hex } : undefined;

  return (
    <span
      aria-hidden
      style={style}
      className={cn(
        base,
        "flex items-center justify-center text-xs font-semibold",
        color ? undefined : "bg-neutral-800 text-neutral-200",
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
