import { cva, type VariantProps } from "class-variance-authority";

// shadcn/ui-style button variants (ADR 0005). Kept separate from `button.tsx` so
// the component file only exports components (fast refresh / react-doctor).
export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-neutral-100 text-neutral-900 hover:bg-neutral-200",
        outline: "border border-neutral-700 bg-transparent hover:bg-neutral-800 text-neutral-100",
        ghost: "hover:bg-neutral-800 text-neutral-100",
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
