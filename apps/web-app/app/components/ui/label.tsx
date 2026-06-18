import type { ComponentProps } from "react";
import { cn } from "~/lib/utils.js";

/**
 * Form label (shadcn/ui-style, ADR 0005). Native `<label>`: `htmlFor` / nesting
 * wires focus and assistive tech. Composed by `FieldLabel`; usable on its own.
 */
export function Label({ className, ...props }: ComponentProps<"label">) {
  return (
    // react-doctor-disable-next-line react-doctor/label-has-associated-control -- reusable Label primitive; association is always supplied by the caller via htmlFor or nesting.
    // biome-ignore lint/a11y/noLabelWithoutControl: shadcn-style wrapper; callers pass htmlFor or nest the control.
    <label
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
