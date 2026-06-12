import { Button as BaseButton } from "@base-ui/react/button";
import type { ComponentProps } from "react";
import { cn } from "~/lib/utils.js";
import { type ButtonVariantProps, buttonVariants } from "./button-variants.js";

type BaseButtonProps = ComponentProps<typeof BaseButton>;

export interface ButtonProps extends Omit<BaseButtonProps, "className">, ButtonVariantProps {
  className?: string;
}

export function Button({ className, variant, size, ref, ...props }: ButtonProps) {
  return (
    <BaseButton ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  );
}

Button.displayName = "Button";
