import type { AnyFormState } from "@tanstack/react-form";
import { createFormHook, createFormHookContexts, useStore } from "@tanstack/react-form";
import type { ReactNode } from "react";
import { Button } from "~/components/ui/button.js";
import { Field, FieldError, FieldLabel } from "~/components/ui/field.js";
import { Input } from "~/components/ui/input.js";
import { Textarea } from "~/components/ui/textarea.js";

const { fieldContext, formContext, useFieldContext, useFormContext } = createFormHookContexts();

export { fieldContext, formContext, useFieldContext, useFormContext };

function TextField({
  id,
  label,
  placeholder,
  maxLength,
  autoComplete = "off",
}: {
  id: string;
  label: string;
  placeholder?: string;
  maxLength?: number;
  autoComplete?: string;
}) {
  const field = useFieldContext<string>();
  const form = useFormContext();
  const showAllErrors = useStore(form.store, (s: AnyFormState) => s.submissionAttempts > 0);
  const reveal = (field.state.meta.isBlurred && field.state.meta.isDirty) || showAllErrors;
  const invalid = reveal && field.state.meta.errors.length > 0;
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        value={field.state.value}
        onChange={(event) => field.handleChange(event.target.value)}
        onBlur={field.handleBlur}
        maxLength={maxLength}
        placeholder={placeholder}
        autoComplete={autoComplete}
        aria-invalid={invalid}
      />
      <FieldError errors={invalid ? field.state.meta.errors : undefined} />
    </Field>
  );
}

function AmountField({
  id,
  label,
  onBlurNormalize,
}: {
  id: string;
  label: string;
  onBlurNormalize: (raw: string) => string;
}) {
  const field = useFieldContext<string>();
  const form = useFormContext();
  const showAllErrors = useStore(form.store, (s: AnyFormState) => s.submissionAttempts > 0);
  const reveal = (field.state.meta.isBlurred && field.state.meta.isDirty) || showAllErrors;
  const invalid = reveal && field.state.meta.errors.length > 0;
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        inputMode="decimal"
        value={field.state.value}
        onChange={(event) => field.handleChange(event.target.value)}
        onBlur={() => {
          field.handleBlur();
          field.handleChange(onBlurNormalize(field.state.value));
        }}
        placeholder="0.00"
        autoComplete="off"
        aria-invalid={invalid}
      />
      <FieldError errors={invalid ? field.state.meta.errors : undefined} />
    </Field>
  );
}

function DateField({ id, label }: { id: string; label: string }) {
  const field = useFieldContext<string>();
  const form = useFormContext();
  const showAllErrors = useStore(form.store, (s: AnyFormState) => s.submissionAttempts > 0);
  const reveal = (field.state.meta.isBlurred && field.state.meta.isDirty) || showAllErrors;
  const invalid = reveal && field.state.meta.errors.length > 0;
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        type="date"
        value={field.state.value}
        onChange={(event) => field.handleChange(event.target.value)}
        onBlur={field.handleBlur}
        aria-invalid={invalid}
      />
      <FieldError errors={invalid ? field.state.meta.errors : undefined} />
    </Field>
  );
}

function TextareaField({
  id,
  label,
  labelExtra,
  rows,
  maxLength,
  placeholder,
}: {
  id: string;
  label: string;
  labelExtra?: ReactNode;
  rows: number;
  maxLength: number;
  placeholder?: string;
}) {
  const field = useFieldContext<string>();
  const form = useFormContext();
  const showAllErrors = useStore(form.store, (s: AnyFormState) => s.submissionAttempts > 0);
  const reveal = (field.state.meta.isBlurred && field.state.meta.isDirty) || showAllErrors;
  const invalid = reveal && field.state.meta.errors.length > 0;
  return (
    <Field>
      <FieldLabel htmlFor={id}>
        {label} {labelExtra}
      </FieldLabel>
      <Textarea
        id={id}
        value={field.state.value}
        onChange={(event) => field.handleChange(event.target.value)}
        onBlur={field.handleBlur}
        maxLength={maxLength}
        rows={rows}
        placeholder={placeholder}
        aria-invalid={invalid}
      />
      <FieldError errors={invalid ? field.state.meta.errors : undefined} />
    </Field>
  );
}

function SelectField({
  id,
  label,
  options,
  showLoadingPlaceholder,
  displayValueFallback,
}: {
  id: string;
  label: string;
  options: readonly { value: string; label: string }[];
  showLoadingPlaceholder: boolean;
  /** When the form field is empty, the select shows this member id (create Paid By default). */
  displayValueFallback: string;
}) {
  const field = useFieldContext<string>();
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <select
        id={id}
        value={field.state.value || displayValueFallback}
        onChange={(event) => field.handleChange(event.target.value)}
        className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-sm outline-none transition-[border-color,box-shadow] duration-150 focus:border-ring focus:ring-2 focus:ring-ring/30"
      >
        {showLoadingPlaceholder ? <option value="">Loading…</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

function SubmitRow({
  isEdit,
  activeTypeLabel,
  onClose,
}: {
  isEdit: boolean;
  activeTypeLabel: string;
  onClose: () => void;
}) {
  const form = useFormContext();
  const isSubmitting = useStore(form.store, (s: AnyFormState) => s.isSubmitting);
  return (
    <div className="flex scroll-mb-28 items-center gap-2 pt-2">
      <Button type="submit" disabled={isSubmitting} className="scroll-mb-28">
        {isSubmitting
          ? "Saving…"
          : isEdit
            ? "Save changes"
            : `Add ${activeTypeLabel.toLowerCase()}`}
      </Button>
      <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting}>
        Cancel
      </Button>
    </div>
  );
}

const spendCircleFieldComponents = {
  TextField,
  AmountField,
  DateField,
  TextareaField,
  SelectField,
};
const spendCircleFormComponents = {
  SubmitRow,
};

const { useAppForm, withForm } = createFormHook({
  fieldContext,
  formContext,
  fieldComponents: spendCircleFieldComponents,
  formComponents: spendCircleFormComponents,
});

export { useAppForm, withForm };

export type SpendCircleFieldComponents = typeof spendCircleFieldComponents;
export type SpendCircleFormComponents = typeof spendCircleFormComponents;
