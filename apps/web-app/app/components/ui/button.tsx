import { Slot } from "@radix-ui/react-slot";
import { cn } from "~/lib/utils.js";
import { type ButtonVariantProps, buttonVariants } from "./button-variants.js";

export interface ButtonProps extends React.ComponentProps<"button">, ButtonVariantProps {
  asChild?: boolean;
}

export function Button({ className, variant, size, asChild = false, ref, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

Button.displayName = "Button";
