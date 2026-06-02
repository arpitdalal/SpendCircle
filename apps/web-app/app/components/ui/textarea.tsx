import type { ComponentProps } from "react";
import { cn } from "~/lib/utils.js";

/**
 * Multi-line text input (shadcn/ui style, ADR 0005). Matches `Input`'s look and its
 * `aria-invalid` error border so single- and multi-line fields read consistently.
 */
export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm outline-none transition-colors placeholder:text-neutral-500 focus:border-neutral-400 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-red-500",
        className,
      )}
      {...props}
    />
  );
}

Textarea.displayName = "Textarea";
