import { initials } from "@spend-circle/domain";
import { cn } from "~/lib/utils.js";

/**
 * The visual identity for a Member/User: their Profile Picture when present,
 * otherwise a generated initials avatar (CONTEXT: "if Google does not provide
 * one, Spend Circle uses a generated initials avatar"). Purely decorative —
 * `aria-hidden` — because every surface that renders it shows the display name in
 * adjacent text, so announcing the avatar too would double-read the name. The
 * image alt is empty for the same reason.
 */
export function Avatar({
  name,
  image,
  className,
}: {
  name: string;
  image?: string;
  className?: string;
}) {
  const base = "size-9 shrink-0 rounded-full";

  if (image) {
    return <img src={image} alt="" aria-hidden className={cn(base, "object-cover", className)} />;
  }

  return (
    <span
      aria-hidden
      className={cn(
        base,
        "flex items-center justify-center bg-neutral-800 text-xs font-semibold text-neutral-200",
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
