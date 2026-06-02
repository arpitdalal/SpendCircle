import type { ComponentProps } from "react";
import { cn } from "~/lib/utils.js";

/**
 * Text input (shadcn/ui style, ADR 0005). `aria-invalid` paints the error border so
 * a field's validity is conveyed visually and to assistive tech without extra markup;
 * the form sets it from the field's error state.
 */
export function Input({ className, type, ...props }: ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm outline-none transition-colors placeholder:text-neutral-500 focus:border-neutral-400 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-red-500",
        className,
      )}
      {...props}
    />
  );
}

Input.displayName = "Input";
