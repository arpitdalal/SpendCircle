import { cva, type VariantProps } from "class-variance-authority";

// shadcn/ui Field orientation variants (ADR 0005). Kept out of `field.tsx` so the
// component module only exports components (fast refresh / react-doctor). `data-invalid`
// flips the group to the error color so a label/description tint with its control.
export const fieldVariants = cva(
  "group/field flex w-full gap-1.5 data-[invalid=true]:text-red-400",
  {
    variants: {
      orientation: {
        vertical: "flex-col [&>*]:w-full",
        horizontal: "flex-row items-center [&>[data-slot=field-label]]:flex-auto",
      },
    },
    defaultVariants: {
      orientation: "vertical",
    },
  },
);

export type FieldVariantProps = VariantProps<typeof fieldVariants>;
