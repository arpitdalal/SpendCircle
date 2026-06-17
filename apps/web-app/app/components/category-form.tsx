import {
  COLOR_PALETTE,
  categoryInputSchema,
  colorLabel,
  DEFAULT_COLOR_ID,
  LIMITS,
  type TransactionType,
} from "@spend-circle/domain";
import { type FormEvent, useState } from "react";
import { Button } from "~/components/ui/button.js";
import { type Circle, useCreateCategory } from "~/lib/data.js";
import { mutationErrorMessageForUser } from "~/lib/mutation-user-message.js";
import { cn } from "~/lib/utils.js";

/**
 * The new-Category form (issue #96): name, the active type, and a palette color picker.
 * Lifted off the Categories list onto its own dedicated route (`category-new.tsx`) so the
 * list no longer stacks a create form above its rows. The owning route guards writability
 * (ADR 0015) and supplies `onClose` — what "done" means here: a successful create or a
 * Cancel navigates back to the validated `returnTo` origin (issue #123). The server owns
 * the unique-name invariant (per Circle+type, case-insensitive, incl. archived); its
 * rejection is the one error a user can fix inline, so it stays on the form.
 */
export function NewCategoryForm({
  circleId,
  type,
  onClose,
}: {
  circleId: Circle["id"];
  type: TransactionType;
  onClose: () => void;
}) {
  const createCategory = useCreateCategory();
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(DEFAULT_COLOR_ID);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    // Client-side mirror of the shared schema (the server re-validates — ADR 0015).
    const parsed = categoryInputSchema.safeParse({ name, type, color });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Please check the category details.");
      return;
    }

    setSubmitting(true);
    try {
      await createCategory({ circleId, name: parsed.data.name, type, color });
      onClose(); // a dedicated page is done on success — return to where it opened from
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "";
      // The one rejection a user can fix inline; everything else is generic.
      setError(
        /already exists/i.test(message)
          ? "A category with this name already exists for this type."
          : mutationErrorMessageForUser(caught, "Couldn't create the category. Please try again."),
      );
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      // Names the form as a landmark region for screen-reader / heading navigation —
      // this dedicated create page would otherwise expose only the input's field label
      // (the standalone route had no heading at all). Mirrors `TransactionForm`'s labeled
      // create region.
      aria-label="New category"
      className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm"
    >
      <h1 className="font-display text-lg font-semibold tracking-tight">New category</h1>

      <div className="space-y-1.5">
        <label htmlFor="category-name" className="block text-sm font-medium">
          New {type} category
        </label>
        <input
          id="category-name"
          name="name"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            if (error) {
              setError(null);
            }
          }}
          maxLength={LIMITS.categoryNameMax}
          placeholder="e.g. Groceries"
          autoComplete="off"
          aria-invalid={error != null}
          aria-describedby={error ? "category-error" : undefined}
          className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-sm outline-none transition-[border-color,box-shadow] duration-150 focus:border-ring focus:ring-2 focus:ring-ring/30"
        />
      </div>

      <ColorPicker legend="Color" color={color} onChange={setColor} />

      {error ? (
        <p id="category-error" role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex gap-2">
        <Button type="submit" disabled={submitting || name.trim() === ""}>
          {submitting ? "Adding…" : "Add category"}
        </Button>
        <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/** The shared palette picker: one definition for the create and edit forms. */
export function ColorPicker({
  legend,
  color,
  onChange,
}: {
  legend: string;
  color: string;
  onChange: (color: string) => void;
}) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-sm font-medium">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {COLOR_PALETTE.map((paletteColor) => (
          <button
            key={paletteColor.id}
            type="button"
            aria-label={paletteColor.name}
            aria-pressed={color === paletteColor.id}
            onClick={() => onChange(paletteColor.id)}
            style={{ backgroundColor: paletteColor.hex }}
            className={cn(
              "size-7 rounded-full ring-offset-2 ring-offset-background transition",
              color === paletteColor.id ? "ring-2 ring-ring" : "ring-0",
            )}
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{colorLabel(color)}</p>
    </fieldset>
  );
}
