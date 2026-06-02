import * as LabelPrimitive from "@radix-ui/react-label";
import type { ComponentProps } from "react";
import { cn } from "~/lib/utils.js";

/**
 * Form label (shadcn/ui style, ADR 0005) on Radix's Label primitive, so a click
 * forwards focus to the associated control and `htmlFor`/nesting wires up assistive
 * tech. Composed by `FieldLabel`; usable on its own.
 */
export function Label({ className, ...props }: ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        "flex w-fit select-none items-center gap-2 text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
        className,
      )}
      {...props}
    />
  );
}

Label.displayName = "Label";
