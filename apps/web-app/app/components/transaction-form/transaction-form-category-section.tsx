import {
  categoryInputSchema,
  DEFAULT_COLOR_ID,
  type TransactionType,
  transactionFieldSchemas,
} from "@spend-circle/domain";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "~/components/ui/button.js";
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
import { type Category, type Circle, useCreateCategory } from "~/lib/data.js";
import { useTypedAppFormContext } from "~/lib/form.js";
import { mutationErrorMessageForUser } from "~/lib/mutation-user-message.js";
import { cn } from "~/lib/utils.js";
import { transactionFormContextOptions } from "./transaction-form-options.js";

function toInlineCreatedCategory(
  id: Category["id"],
  name: string,
  type: TransactionType,
  color: string,
): Category {
  return {
    id,
    name,
    type,
    color,
    status: "active",
    creator: { displayName: "You", image: undefined },
    canEditFields: true,
    canArchive: true,
  };
}

function findCategoryByName(
  categoryById: ReadonlyMap<string, Category>,
  activeType: TransactionType,
  name: string,
) {
  const normalized = name.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  for (const category of categoryById.values()) {
    if (category.type === activeType && category.name.toLowerCase() === normalized) {
      return category;
    }
  }
  return null;
}

export function TransactionFormCategorySection({
  circleId,
  categoryById,
  alreadyAttached,
  activeCategories,
  activeType,
  onInlineCreatedCategory,
}: {
  circleId: Circle["id"];
  categoryById: ReadonlyMap<string, Category>;
  alreadyAttached: ReadonlySet<string>;
  activeCategories: Category[];
  activeType: TransactionType;
  onInlineCreatedCategory: (category: Category) => void;
}) {
  const form = useTypedAppFormContext(transactionFormContextOptions);
  const createCategory = useCreateCategory();
  const anchorRef = useComboboxAnchor();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [justCreated, setJustCreated] = useState<Map<string, Category>>(() => new Map());

  function clearInputQuery() {
    setQuery("");
    const input = inputRef.current;
    if (input) {
      input.value = "";
    }
  }

  useEffect(() => {
    setJustCreated((prev) => {
      if (prev.size === 0) {
        return prev;
      }
      const next = new Map(prev);
      for (const id of prev.keys()) {
        if (categoryById.has(id)) {
          next.delete(id);
        }
      }
      return next.size === prev.size ? prev : next;
    });
  }, [categoryById]);

  const mergedCategoryById = useMemo(() => {
    const map = new Map(categoryById);
    for (const [id, category] of justCreated) {
      if (!map.has(id)) {
        map.set(id, category);
      }
    }
    return map;
  }, [categoryById, justCreated]);

  const activeIds = useMemo(
    () => activeCategories.map((category) => category.id),
    [activeCategories],
  );

  const trimmedQuery = query.trim();
  const exactNameMatch = trimmedQuery
    ? findCategoryByName(categoryById, activeType, trimmedQuery)
    : null;
  const showCreateAffordance = trimmedQuery.length > 0 && !exactNameMatch && !creating;
  const showReservedName =
    trimmedQuery.length > 0 && exactNameMatch?.status === "archived" && !creating;

  async function handleInlineCreate(
    currentIds: string[],
    onIdsChange: (nextIds: string[]) => void,
  ) {
    setInlineError(null);

    if (!trimmedQuery) {
      return;
    }

    const existing = findCategoryByName(categoryById, activeType, trimmedQuery);
    if (existing?.status === "active") {
      if (!currentIds.includes(existing.id)) {
        onIdsChange([...currentIds, existing.id]);
      }
      clearInputQuery();
      return;
    }
    if (existing?.status === "archived") {
      setInlineError(`A category named '${existing.name}' already exists but is archived`);
      return;
    }

    const parsed = categoryInputSchema.safeParse({
      name: trimmedQuery,
      type: activeType,
      color: DEFAULT_COLOR_ID,
    });
    if (!parsed.success) {
      setInlineError(parsed.error.issues[0]?.message ?? "Please check the category name.");
      return;
    }

    setCreating(true);
    try {
      const newId = await createCategory({
        circleId,
        name: parsed.data.name,
        type: activeType,
        color: DEFAULT_COLOR_ID,
      });
      if (!newId) {
        setInlineError("Couldn't create the category. Please try again.");
        return;
      }
      const created = toInlineCreatedCategory(
        newId,
        parsed.data.name,
        activeType,
        DEFAULT_COLOR_ID,
      );
      onInlineCreatedCategory(created);
      setJustCreated((prev) => {
        const next = new Map(prev);
        next.set(newId, created);
        return next;
      });
      if (!currentIds.includes(newId)) {
        onIdsChange([...currentIds, newId]);
      }
      clearInputQuery();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "";
      setInlineError(
        /already exists/i.test(message)
          ? "A category with this name already exists for this type."
          : mutationErrorMessageForUser(caught, "Couldn't create the category. Please try again."),
      );
    } finally {
      setCreating(false);
    }
  }

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
              const category = mergedCategoryById.get(id);
              return category && category.status === "archived" ? [category] : [];
            });
            const blockingArchived = archivedSelected.filter(
              (category) => !alreadyAttached.has(category.id),
            );

            return (
              <FieldSet>
                <FieldLegend>Categories</FieldLegend>
                <Combobox
                  multiple
                  autoHighlight
                  value={field.state.value}
                  onValueChange={(next) => {
                    field.handleChange(next ?? []);
                  }}
                  items={activeIds}
                  itemToStringLabel={(id: string) => mergedCategoryById.get(id)?.name ?? id}
                >
                  <ComboboxChips ref={anchorRef} className="w-full max-w-full">
                    <ComboboxValue>
                      {(values: string[]) => (
                        <>
                          {values.map((id) => {
                            const category = mergedCategoryById.get(id);
                            const archived = category?.status === "archived";
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
                              </ComboboxChip>
                            );
                          })}
                          <ComboboxChipsInput
                            ref={inputRef}
                            placeholder="Search categories…"
                            aria-label="Categories"
                            onChange={(event) => {
                              setQuery(event.target.value);
                              if (inlineError) {
                                setInlineError(null);
                              }
                            }}
                          />
                        </>
                      )}
                    </ComboboxValue>
                  </ComboboxChips>
                  <ComboboxContent anchor={anchorRef}>
                    <ComboboxEmpty>No matching categories.</ComboboxEmpty>
                    <ComboboxList>
                      {(id: string) => {
                        const category = mergedCategoryById.get(id);
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
                    {showCreateAffordance ? (
                      <div className="border-t border-border p-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="w-full justify-start font-normal"
                          disabled={creating}
                          onClick={() => {
                            void handleInlineCreate(field.state.value, field.handleChange);
                          }}
                        >
                          {creating ? "Creating…" : `Create "${trimmedQuery}"`}
                        </Button>
                      </div>
                    ) : null}
                  </ComboboxContent>
                </Combobox>
                {showReservedName ? (
                  <p role="alert" className="text-sm text-amber-400">
                    A category named &lsquo;{exactNameMatch?.name}&rsquo; already exists but is
                    archived
                  </p>
                ) : null}
                {inlineError ? (
                  <p role="alert" className="text-sm text-destructive">
                    {inlineError}
                  </p>
                ) : null}
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
