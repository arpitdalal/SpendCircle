import { Search, SlidersHorizontal } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { TransactionList } from "~/components/transaction-list.js";
import { Button } from "~/components/ui/button.js";
import { FilterPanel } from "~/components/ui/filter-panel.js";
import { MultiSelect, type MultiSelectOption } from "~/components/ui/multi-select.js";
import { useTransactionSearch, useTransactionSearchOptions } from "~/lib/data.js";
import {
  activeFilterCount,
  canonicalSearchParams,
  defaultSearchFilters,
  dropUnknownIds,
  readSearchFilters,
  type SearchFilters,
  toMinorUnits,
} from "~/lib/transaction-filter-url.js";
import { cn } from "~/lib/utils.js";
import { useCircle } from "~/routes/layouts/circle-layout.js";

export default function CircleSearch() {
  const circle = useCircle();
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = readSearchFilters(searchParams);
  const [panelOpen, setPanelOpen] = useState(false);
  const [draft, setDraft] = useState<SearchFilters>(filters);
  const options = useTransactionSearchOptions(circle.id, panelOpen ? draft.type : filters.type);
  const results = useTransactionSearch(circle.id, toSearchQuery(filters));
  const filterCount = activeFilterCount(filters);
  const searchKey = searchParams.toString();

  useEffect(() => {
    const next = canonicalSearchParams(filters);
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
  }, [filters, searchParams, setSearchParams]);

  useEffect(() => {
    setDraft(readSearchFilters(new URLSearchParams(searchKey)));
  }, [searchKey]);

  useEffect(() => {
    if (!options) {
      return;
    }
    const categoryIds = options.categories.map((category) => category.id);
    const memberIds = options.members.map((member) => member.id);
    const cleaned = dropUnknownIds(filters, { categoryIds, memberIds });
    if (
      cleaned.categories.join(",") !== filters.categories.join(",") ||
      cleaned.recordedBy.join(",") !== filters.recordedBy.join(",") ||
      cleaned.paidBy.join(",") !== filters.paidBy.join(",")
    ) {
      setSearchParams(canonicalSearchParams({ ...filters, ...cleaned }), { replace: true });
    }
  }, [filters, options, setSearchParams]);

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    if (hasReversedRange(draft)) {
      return;
    }
    setSearchParams(canonicalSearchParams(draft), { replace: false });
    setPanelOpen(false);
  };

  const reset = () => {
    setSearchParams(canonicalSearchParams(defaultSearchFilters()), { replace: false });
    setPanelOpen(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Search</h2>
      </div>

      <form onSubmit={submit} className="flex gap-2">
        <label className="min-w-0 flex-1">
          <span className="sr-only">Search title or note</span>
          <input
            type="search"
            value={draft.q}
            onChange={(event) => setDraft({ ...draft, q: event.currentTarget.value })}
            className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-400"
          />
        </label>
        <Button type="submit" disabled={hasReversedRange(draft)}>
          <Search className="size-4" />
          Search
        </Button>
        <Button type="button" variant="outline" onClick={() => setPanelOpen(true)}>
          <SlidersHorizontal className="size-4" />
          Filters{filterCount > 0 ? ` (${filterCount})` : ""}
        </Button>
      </form>

      <TransactionList
        paginated={results}
        circle={circle}
        emptyLabel="No matching transactions."
        canEdit={circle.status === "active"}
      />

      <FilterPanel
        open={panelOpen}
        onOpenChange={setPanelOpen}
        title="Filters"
        footer={
          <>
            <Button type="button" variant="outline" onClick={reset}>
              Reset
            </Button>
            <Button
              type="button"
              className="ml-auto"
              disabled={hasReversedRange(draft)}
              onClick={() => submit()}
            >
              Apply
            </Button>
          </>
        }
      >
        <SearchFilterForm
          draft={draft}
          setDraft={setDraft}
          options={options}
          optionsLoading={options === undefined}
        />
      </FilterPanel>
    </div>
  );
}

function toSearchQuery(filters: SearchFilters) {
  return {
    type: filters.type,
    status: filters.status,
    ...(filters.q ? { query: filters.q } : {}),
    ...(filters.categories.length > 0 ? { categoryIds: filters.categories } : {}),
    ...(filters.recordedBy.length > 0 ? { recordedByMemberIds: filters.recordedBy } : {}),
    ...(filters.paidBy.length > 0 ? { paidByMemberIds: filters.paidBy } : {}),
    ...(filters.from ? { dateFrom: filters.from } : {}),
    ...(filters.to ? { dateTo: filters.to } : {}),
    ...(toMinorUnits(filters.min) !== undefined ? { amountMin: toMinorUnits(filters.min) } : {}),
    ...(toMinorUnits(filters.max) !== undefined ? { amountMax: toMinorUnits(filters.max) } : {}),
  };
}

function hasReversedRange(filters: SearchFilters) {
  const min = toMinorUnits(filters.min);
  const max = toMinorUnits(filters.max);
  return (
    Boolean(filters.from && filters.to && filters.from > filters.to) ||
    (min !== undefined && max !== undefined && min > max)
  );
}

function SearchFilterForm({
  draft,
  setDraft,
  options,
  optionsLoading,
}: {
  draft: SearchFilters;
  setDraft: (filters: SearchFilters) => void;
  options: ReturnType<typeof useTransactionSearchOptions>;
  optionsLoading: boolean;
}) {
  const categoryOptions = toCategoryOptions(options?.categories ?? []);
  const memberOptions = toMemberOptions(options?.members ?? []);
  return (
    <div className="space-y-4">
      <Segmented
        label="Type"
        value={draft.type}
        options={[
          { label: "All", value: "all" },
          { label: "Expense", value: "expense" },
          { label: "Income", value: "income" },
        ]}
        onChange={(type) => setDraft({ ...draft, type, categories: [] })}
      />
      <Segmented
        label="Status"
        value={draft.status}
        options={[
          { label: "Active", value: "active" },
          { label: "Archived", value: "archived" },
          { label: "All", value: "all" },
        ]}
        onChange={(status) => setDraft({ ...draft, status })}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs text-neutral-500">
          From
          <input
            type="date"
            value={draft.from}
            max={draft.to || undefined}
            onChange={(event) => setDraft({ ...draft, from: event.currentTarget.value })}
            className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-400"
          />
        </label>
        <label className="block text-xs text-neutral-500">
          To
          <input
            type="date"
            value={draft.to}
            min={draft.from || undefined}
            onChange={(event) => setDraft({ ...draft, to: event.currentTarget.value })}
            className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-400"
          />
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs text-neutral-500">
          Amount min
          <input
            type="number"
            min="0"
            step="0.01"
            value={draft.min}
            onChange={(event) => setDraft({ ...draft, min: event.currentTarget.value })}
            className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-400"
          />
        </label>
        <label className="block text-xs text-neutral-500">
          Amount max
          <input
            type="number"
            min={draft.min || "0"}
            step="0.01"
            value={draft.max}
            onChange={(event) => setDraft({ ...draft, max: event.currentTarget.value })}
            className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-400"
          />
        </label>
      </div>
      <MultiSelect
        label="Categories"
        options={categoryOptions}
        value={draft.categories}
        disabled={optionsLoading}
        onChange={(categories) => setDraft({ ...draft, categories })}
      />
      <MultiSelect
        label="Recorded by"
        options={memberOptions}
        value={draft.recordedBy}
        disabled={optionsLoading}
        onChange={(recordedBy) => setDraft({ ...draft, recordedBy })}
      />
      <MultiSelect
        label="Paid by"
        options={memberOptions}
        value={draft.paidBy}
        disabled={optionsLoading}
        onChange={(paidBy) => setDraft({ ...draft, paidBy })}
      />
    </div>
  );
}

function Segmented<Value extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: Value;
  options: { label: string; value: Value }[];
  onChange: (value: Value) => void;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-xs text-neutral-500">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
            className={cn(
              "rounded-md border px-3 py-1 text-sm transition-colors",
              value === option.value
                ? "border-neutral-100 bg-neutral-100 text-neutral-900"
                : "border-neutral-700 text-neutral-300 hover:text-neutral-100",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function toCategoryOptions(
  categories: NonNullable<ReturnType<typeof useTransactionSearchOptions>>["categories"],
) {
  return categories.map((category) => ({
    value: category.id,
    label: category.name,
    detail: category.status === "archived" ? "archived" : undefined,
    color: category.color,
  })) satisfies MultiSelectOption[];
}

function toMemberOptions(
  members: NonNullable<ReturnType<typeof useTransactionSearchOptions>>["members"],
) {
  return members.map((member) => ({
    value: member.id,
    label: member.displayName,
    detail: member.status === "removed" ? "removed" : undefined,
  })) satisfies MultiSelectOption[];
}
