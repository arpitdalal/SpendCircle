import { cva, type VariantProps } from "class-variance-authority";

// shadcn/ui-style button variants (ADR 0005). Kept separate from `button.tsx` so
// the component file only exports components (fast refresh / react-doctor).
export const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-[background-color,border-color,color,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 motion-reduce:active:scale-100",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-sm hover:bg-primary/85",
        outline:
          "border border-border bg-transparent text-foreground hover:border-ring/60 hover:bg-muted/50",
        ghost: "text-foreground hover:bg-muted/60",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 px-3",
        lg: "h-11 px-6",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export type ButtonVariantProps = VariantProps<typeof buttonVariants>;
