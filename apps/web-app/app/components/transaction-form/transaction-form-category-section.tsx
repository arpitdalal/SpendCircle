import { type TransactionType, transactionFieldSchemas } from "@spend-circle/domain";
import { useMemo } from "react";
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
  useComboboxAnchor,
} from "~/components/ui/combobox.js";
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
  const anchorRef = useComboboxAnchor();
  const activeIds = useMemo(
    () => activeCategories.map((category) => category.id),
    [activeCategories],
  );

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
            const archivedSelected = field.state.value.flatMap((id) => {
              const category = categoryById.get(id);
              return category && category.status === "archived" ? [category] : [];
            });
            const blockingArchived = archivedSelected.filter(
              (category) => !alreadyAttached.has(category.id),
            );
            const showPicker = activeCategories.length > 0 || archivedSelected.length > 0;

            return (
              <FieldSet>
                <FieldLegend>Categories</FieldLegend>
                {!showPicker ? (
                  <p className="text-xs text-muted-foreground">
                    No {activeType} categories yet. Create one first to record a {activeType}.
                  </p>
                ) : (
                  <Combobox
                    multiple
                    autoHighlight
                    value={field.state.value}
                    onValueChange={(next) => {
                      field.handleChange(next ?? []);
                    }}
                    items={activeIds}
                    itemToStringLabel={(id: string) => categoryById.get(id)?.name ?? id}
                  >
                    <ComboboxChips ref={anchorRef} className="w-full max-w-full">
                      <ComboboxValue>
                        {(values: string[]) => (
                          <>
                            {values.map((id) => {
                              const category = categoryById.get(id);
                              const archived = category?.status === "archived";
                              const blocking = archived && !alreadyAttached.has(id);
                              const label = category?.name ?? id;
                              return (
                                <ComboboxChip
                                  key={id}
                                  removeAriaLabel={`Remove ${label}`}
                                  className={
                                    archived
                                      ? cn(
                                          "border border-amber-600/70 bg-amber-950/40 text-amber-300",
                                          "hover:text-amber-100",
                                        )
                                      : undefined
                                  }
                                >
                                  {label}
                                  {archived ? " · archived" : ""}
                                  {blocking ? " ✕" : ""}
                                </ComboboxChip>
                              );
                            })}
                            <ComboboxChipsInput
                              placeholder="Search categories…"
                              aria-label="Categories"
                            />
                          </>
                        )}
                      </ComboboxValue>
                    </ComboboxChips>
                    <ComboboxContent anchor={anchorRef}>
                      <ComboboxEmpty>No matching categories.</ComboboxEmpty>
                      <ComboboxList>
                        {(id: string) => {
                          const category = categoryById.get(id);
                          if (category?.status !== "active") {
                            return null;
                          }
                          return (
                            <ComboboxItem key={id} value={id}>
                              {category.name}
                            </ComboboxItem>
                          );
                        }}
                      </ComboboxList>
                    </ComboboxContent>
                  </Combobox>
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
