import type { ComponentProps, ReactNode } from "react";
import { cn } from "~/lib/utils.js";
import { type FieldVariantProps, fieldVariants } from "./field-variants.js";
import { Label } from "./label.js";

/**
 * shadcn/ui Field primitives (ADR 0005), the presentational layer the Transaction
 * form composes with TanStack Form. `FieldError` takes the field's Standard-Schema
 * issues (`field.state.meta.errors`) directly, so validation messages render without
 * the form re-deriving them. Palette is the app's neutral/red scale rather than the
 * shadcn design tokens this project doesn't define.
 */

/** Stacks Fields with consistent spacing. */
export function FieldGroup({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="field-group"
      className={cn("flex w-full flex-col gap-4", className)}
      {...props}
    />
  );
}

/** A single labelled field (label + control + error/description). */
export function Field({
  className,
  orientation,
  ...props
}: ComponentProps<"div"> & FieldVariantProps) {
  return (
    <div
      data-slot="field"
      data-orientation={orientation ?? "vertical"}
      className={cn(fieldVariants({ orientation }), className)}
      {...props}
    />
  );
}

/** Wraps a control + its description/error when they sit beside a horizontal label. */
export function FieldContent({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="field-content"
      className={cn("flex flex-1 flex-col gap-1.5", className)}
      {...props}
    />
  );
}

/** Label for a single control; pass `htmlFor` to bind it. */
export function FieldLabel({ className, ...props }: ComponentProps<typeof Label>) {
  return <Label data-slot="field-label" className={cn("w-fit", className)} {...props} />;
}

/** Groups related controls (e.g. a multi-select) under one accessible legend. */
export function FieldSet({ className, ...props }: ComponentProps<"fieldset">) {
  return (
    <fieldset data-slot="field-set" className={cn("flex flex-col gap-1.5", className)} {...props} />
  );
}

/** Legend for a `FieldSet`; `label` variant matches a `FieldLabel`'s weight. */
export function FieldLegend({
  className,
  variant = "label",
  ...props
}: ComponentProps<"legend"> & { variant?: "legend" | "label" }) {
  return (
    <legend
      data-slot="field-legend"
      data-variant={variant}
      className={cn(
        "font-medium data-[variant=label]:text-sm data-[variant=legend]:text-base",
        className,
      )}
      {...props}
    />
  );
}

/** Secondary helper text under a control. */
export function FieldDescription({ className, ...props }: ComponentProps<"p">) {
  return (
    <p
      data-slot="field-description"
      className={cn("text-xs text-neutral-500", className)}
      {...props}
    />
  );
}

/**
 * Renders a field's validation error(s). Accepts the Standard-Schema issues from
 * `field.state.meta.errors` (each carries a `message`); collapses to a single line
 * or a bulleted list, and renders nothing when there's no error. `role="alert"`
 * announces it to assistive tech.
 */
export function FieldError({
  className,
  children,
  errors,
  ...props
}: Omit<ComponentProps<"div">, "children"> & {
  children?: ReactNode;
  errors?: ReadonlyArray<{ message?: string } | undefined>;
}) {
  const messages = children
    ? null
    : (errors ?? []).flatMap((error) => (error?.message ? [error.message] : []));

  const content =
    children ??
    (messages && messages.length > 0 ? (
      messages.length === 1 ? (
        messages[0]
      ) : (
        <ul className="ml-4 flex list-disc flex-col gap-1">
          {messages.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      )
    ) : null);

  if (!content) {
    return null;
  }

  return (
    <div
      role="alert"
      data-slot="field-error"
      className={cn("text-sm text-red-400", className)}
      {...props}
    >
      {content}
    </div>
  );
}
