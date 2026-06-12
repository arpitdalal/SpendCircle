import { type TransactionType, transactionFieldSchemas } from "@spend-circle/domain";
import { FieldError, FieldLegend, FieldSet } from "~/components/ui/field.js";
import type { Category } from "~/lib/data.js";
import { useTypedAppFormContext } from "~/lib/form.js";
import { cn } from "~/lib/utils.js";
import { transactionFormContextOptions } from "./transaction-form-options.js";

export function TransactionFormCategorySection({
  categoryById,
  alreadyAttached,
  activeCategories,
  activeType,
}: {
  categoryById: ReadonlyMap<string, Category>;
  alreadyAttached: ReadonlySet<string>;
  activeCategories: Category[];
  activeType: TransactionType;
}) {
  const form = useTypedAppFormContext(transactionFormContextOptions);

  return (
    <form.Subscribe selector={(state) => state.submissionAttempts > 0}>
      {(submitReveal) => (
        <form.Field
          name="categoryIds"
          validators={{ onChange: transactionFieldSchemas.categoryIds }}
        >
          {(field) => {
            const reveal = field.state.meta.isDirty || submitReveal;
            const invalid = reveal && field.state.meta.errors.length > 0;
            const deselect = (id: string) =>
              field.handleChange(field.state.value.filter((current) => current !== id));
            const archivedSelected = field.state.value.flatMap((id) => {
              const category = categoryById.get(id);
              return category && category.status === "archived" ? [category] : [];
            });
            const blockingArchived = archivedSelected.filter(
              (category) => !alreadyAttached.has(category.id),
            );
            return (
              <FieldSet>
                <FieldLegend>Categories</FieldLegend>
                {activeCategories.length === 0 && archivedSelected.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No {activeType} categories yet. Create one first to record a {activeType}.
                  </p>
                ) : (
                  <div className="flex max-h-48 flex-wrap gap-2 overflow-y-auto rounded-md border border-border p-2">
                    {activeCategories.map((category) => {
                      const selected = field.state.value.includes(category.id);
                      return (
                        <button
                          key={category.id}
                          type="button"
                          aria-pressed={selected}
                          onClick={() =>
                            selected
                              ? deselect(category.id)
                              : field.handleChange([...field.state.value, category.id])
                          }
                          className={cn(
                            "max-w-full whitespace-normal wrap-break-word rounded-full border px-3 py-1 text-left text-sm transition-colors",
                            selected
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border text-muted-foreground hover:text-foreground",
                          )}
                        >
                          {category.name}
                        </button>
                      );
                    })}
                    {archivedSelected.map((category) => {
                      const blocking = !alreadyAttached.has(category.id);
                      return (
                        <button
                          key={category.id}
                          type="button"
                          aria-pressed={true}
                          onClick={() => deselect(category.id)}
                          className="max-w-full whitespace-normal wrap-break-word rounded-full border border-amber-600/70 bg-amber-950/40 px-3 py-1 text-left text-sm text-amber-300 transition-colors hover:text-amber-100"
                        >
                          {category.name} · archived{blocking ? " ✕" : ""}
                        </button>
                      );
                    })}
                  </div>
                )}
                {blockingArchived.length > 0 ? (
                  <p role="alert" className="text-sm text-amber-400">
                    {blockingArchived.length === 1
                      ? `"${blockingArchived[0]?.name}" was archived and can't be added to a ${activeType}. Remove it to continue.`
                      : "Some selected categories were archived and can't be added. Remove them to continue."}
                  </p>
                ) : null}
                <FieldError errors={invalid ? field.state.meta.errors : undefined} />
              </FieldSet>
            );
          }}
        </form.Field>
      )}
    </form.Subscribe>
  );
}
