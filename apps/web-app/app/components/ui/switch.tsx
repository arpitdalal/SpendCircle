import type { ComponentProps } from "react";
import { cn } from "~/lib/utils.js";

export interface SwitchProps
  extends Omit<ComponentProps<"button">, "role" | "type" | "aria-checked"> {
  checked: boolean;
}

/** Accessible toggle (`role="switch"`) styled to match the app's Field/Button primitives. */
export function Switch({ checked, disabled, className, ...props }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      data-slot="switch"
      data-state={checked ? "checked" : "unchecked"}
      className={cn(
        "peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border border-transparent bg-input shadow-inner transition-[background-color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary",
        className,
      )}
      {...props}
    >
      <span
        data-slot="switch-thumb"
        className={cn(
          "pointer-events-none block size-5 translate-x-0.5 rounded-full bg-background shadow-sm ring-0 transition-transform duration-150 data-[state=checked]:translate-x-[1.375rem]",
          checked && "translate-x-[1.375rem]",
        )}
        data-state={checked ? "checked" : "unchecked"}
      />
    </button>
  );
}

Switch.displayName = "Switch";
