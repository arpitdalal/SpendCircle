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
import { type Category, type Circle, useCategories, useCreateCategory } from "~/lib/data.js";
import { cn } from "~/lib/utils.js";
import { useCircle } from "~/routes/layouts/circle-layout.js";

const TYPE_TABS: ReadonlyArray<{ value: TransactionType; label: string }> = [
  { value: "expense", label: "Expense" },
  { value: "income", label: "Income" },
];

/**
 * Circle-scoped Categories surface (PRD stories 47–61). A type segmented control
 * drives both the visible list and the new-Category form, because Categories are
 * type-specific — an Expense form never shows Income Categories. The server owns
 * the unique-name invariant (case-insensitive, per Circle+type, incl. archived);
 * we surface its rejection inline rather than pre-checking client-side.
 */
export default function CircleCategories() {
  const circle = useCircle();
  const [type, setType] = useState<TransactionType>("expense");
  const categories = useCategories(circle.id, type);

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h2 className="font-display text-lg font-semibold tracking-tight">Categories</h2>
        <div
          role="tablist"
          aria-label="Category type"
          className="inline-flex rounded-md bg-muted p-1"
        >
          {TYPE_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={type === tab.value}
              onClick={() => setType(tab.value)}
              className={cn(
                "rounded px-3 py-1 text-sm transition-colors",
                type === tab.value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <NewCategoryForm circleId={circle.id} type={type} writable={circle.status === "active"} />

      <CategoryList categories={categories} type={type} />
    </div>
  );
}

/** The new-Category affordance: name, the active type, and a palette color picker. */
function NewCategoryForm({
  circleId,
  type,
  writable,
}: {
  circleId: Circle["id"];
  type: TransactionType;
  writable: boolean;
}) {
  const createCategory = useCreateCategory();
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(DEFAULT_COLOR_ID);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!writable) {
    return (
      <p className="rounded-lg border border-border bg-card p-3 shadow-sm text-sm text-muted-foreground">
        This circle is archived. Restore it to add categories.
      </p>
    );
  }

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
      setName(""); // keep the chosen color for quick repeated adds
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "";
      // The one rejection a user can fix inline; everything else is generic.
      setError(
        /already exists/i.test(message)
          ? "A category with this name already exists for this type."
          : "Couldn't create the category. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm"
    >
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

      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium">Color</legend>
        <div className="flex flex-wrap gap-2">
          {COLOR_PALETTE.map((paletteColor) => (
            <button
              key={paletteColor.id}
              type="button"
              aria-label={paletteColor.name}
              aria-pressed={color === paletteColor.id}
              onClick={() => setColor(paletteColor.id)}
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

      {error ? (
        <p id="category-error" role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <Button type="submit" disabled={submitting || name.trim() === ""}>
        {submitting ? "Adding…" : "Add category"}
      </Button>
    </form>
  );
}

/** The active Categories of the selected type. */
function CategoryList({
  categories,
  type,
}: {
  categories: Category[] | null | undefined;
  type: TransactionType;
}) {
  if (categories === undefined) {
    return <p className="text-sm text-muted-foreground">Loading categories…</p>;
  }
  // null ≡ inaccessible Circle (ADR 0016); the Circle guard already gated entry,
  // so treat a late null as simply nothing to show.
  if (categories === null || categories.length === 0) {
    return <p className="text-sm text-muted-foreground">No {type} categories yet.</p>;
  }

  return (
    <ul className="space-y-2">
      {categories.map((category) => {
        const swatch = COLOR_PALETTE.find((c) => c.id === category.color);
        return (
          <li
            key={category.id}
            className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 shadow-sm"
          >
            <span
              aria-hidden
              className="size-3 rounded-full"
              style={{ backgroundColor: swatch?.hex }}
            />
            <span className="text-sm font-medium">{category.name}</span>
            <span className="ml-auto text-xs text-muted-foreground">
              {category.creator.displayName}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
