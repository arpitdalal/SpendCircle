import {
  addMonths,
  formatMoney,
  isValidPlainMonth,
  money,
  type PlainMonth,
  type TransactionType,
  toCurrencyCode,
} from "@spend-circle/domain";
import { SlidersHorizontal } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { TransactionForm } from "~/components/transaction-form.js";
import { TransactionList } from "~/components/transaction-list.js";
import { Button } from "~/components/ui/button.js";
import { FilterPanel } from "~/components/ui/filter-panel.js";
import { MultiSelect, type MultiSelectOption } from "~/components/ui/multi-select.js";
import {
  type MonthlySummary,
  useLedgerFilterOptions,
  useLedgerTransactionFilter,
  useMonthlySummary,
  useTransactions,
} from "~/lib/data.js";
import { viewerLocale } from "~/lib/locale.js";
import {
  activeFilterCount,
  canonicalLedgerParams,
  defaultLedgerFilters,
  dropUnknownIds,
  type LedgerFilters,
  readLedgerFilters,
} from "~/lib/transaction-filter-url.js";
import { cn } from "~/lib/utils.js";
import { useCircle } from "~/routes/layouts/circle-layout.js";

export default function CircleTransactions() {
  const circle = useCircle();
  const [searchParams, setSearchParams] = useSearchParams();
  const writable = circle.status === "active";
  const filters = readLedgerFilters(searchParams);
  const filterCount = activeFilterCount(filters);
  const filterActive = filterCount > 0;
  const rawNew = searchParams.get("new");
  const createType: TransactionType | null =
    writable && (rawNew === "expense" || rawNew === "income") ? rawNew : null;
  const [panelOpen, setPanelOpen] = useState(false);
  const [draft, setDraft] = useState<LedgerFilters>(filters);
  const options = useLedgerFilterOptions(
    circle.id,
    filters.month,
    panelOpen ? draft.type : filters.type,
  );
  const summary = useMonthlySummary(circle.id, filters.month);
  const baseTransactions = useTransactions(circle.id, filters.month, { enabled: !filterActive });
  const filteredTransactions = useLedgerTransactionFilter(circle.id, toLedgerQuery(filters), {
    enabled: filterActive,
  });
  const searchKey = searchParams.toString();

  useEffect(() => {
    if (panelOpen) {
      setDraft(readLedgerFilters(new URLSearchParams(searchKey)));
    }
  }, [panelOpen, searchKey]);

  useEffect(() => {
    const next = canonicalLedgerParams(filters, searchParams);
    let changed = next.toString() !== searchParams.toString();
    if (rawNew !== null && !createType) {
      next.delete("new");
      changed = true;
    }
    if (changed) {
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, filters, rawNew, createType, setSearchParams]);

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
      setSearchParams(canonicalLedgerParams({ ...filters, ...cleaned }, searchParams), {
        replace: true,
      });
    }
  }, [filters, options, searchParams, setSearchParams]);

  const goToMonth = (next: PlainMonth) => {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        const canonical = defaultLedgerFilters(next);
        return canonicalLedgerParams(canonical, params);
      },
      { replace: false },
    );
  };

  const applyFilters = () => {
    setSearchParams(canonicalLedgerParams({ ...draft, month: filters.month }, searchParams), {
      replace: false,
    });
    setPanelOpen(false);
  };

  const resetFilters = () => {
    setSearchParams(canonicalLedgerParams(defaultLedgerFilters(filters.month), searchParams), {
      replace: false,
    });
    setPanelOpen(false);
  };

  const openCreate = (type: TransactionType) => {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      params.set("new", type);
      return params;
    });
  };

  const closeCreate = () => {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        params.delete("new");
        return params;
      },
      { replace: true },
    );
  };

  const monthLabel = formatMonthLabel(filters.month);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Transactions</h2>
        {writable ? (
          <div className="flex gap-2">
            <Button type="button" onClick={() => openCreate("expense")}>
              Add expense
            </Button>
            <Button type="button" variant="outline" onClick={() => openCreate("income")}>
              Add income
            </Button>
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthNavigator month={filters.month} onChange={goToMonth} />
        <Button type="button" variant="outline" onClick={() => setPanelOpen(true)}>
          <SlidersHorizontal className="size-4" />
          Filters{filterCount > 0 ? ` (${filterCount})` : ""}
        </Button>
      </div>

      <MonthlyTotals summary={summary} fallbackCurrency={circle.currency} label="Monthly totals" />

      {!writable ? (
        <p className="rounded-md border border-neutral-800 p-3 text-sm text-neutral-500">
          This circle is archived. Restore it to add transactions.
        </p>
      ) : null}

      {createType ? (
        <TransactionForm
          key={`create-${createType}`}
          circle={circle}
          mode={{ kind: "create", type: createType, selectedMonth: filters.month }}
          onClose={closeCreate}
        />
      ) : null}

      <TransactionList
        paginated={filterActive ? filteredTransactions : baseTransactions}
        circle={circle}
        emptyLabel={
          filterActive ? "No matching transactions." : `No active transactions in ${monthLabel}.`
        }
        canEdit={writable}
        ledgerMonth={filters.month}
        lifecycleMode={
          filters.status === "archived"
            ? "archived"
            : filters.status === "active"
              ? "active"
              : undefined
        }
      />

      <FilterPanel
        open={panelOpen}
        onOpenChange={setPanelOpen}
        title="Filters"
        footer={
          <>
            <Button type="button" variant="outline" onClick={resetFilters}>
              Reset
            </Button>
            <Button type="button" className="ml-auto" onClick={applyFilters}>
              Apply
            </Button>
          </>
        }
      >
        <LedgerFilterForm
          draft={draft}
          setDraft={setDraft}
          options={options}
          optionsLoading={options === undefined}
        />
      </FilterPanel>
    </div>
  );
}

function toLedgerQuery(filters: LedgerFilters) {
  return {
    month: filters.month,
    type: filters.type,
    status: filters.status,
    ...(filters.q ? { query: filters.q } : {}),
    ...(filters.categories.length > 0 ? { categoryIds: filters.categories } : {}),
    ...(filters.recordedBy.length > 0 ? { recordedByMemberIds: filters.recordedBy } : {}),
    ...(filters.paidBy.length > 0 ? { paidByMemberIds: filters.paidBy } : {}),
  };
}

function LedgerFilterForm({
  draft,
  setDraft,
  options,
  optionsLoading,
}: {
  draft: LedgerFilters;
  setDraft: (filters: LedgerFilters) => void;
  options: ReturnType<typeof useLedgerFilterOptions>;
  optionsLoading: boolean;
}) {
  const categoryOptions = toCategoryOptions(options?.categories ?? []);
  const memberOptions = toMemberOptions(options?.members ?? []);
  return (
    <div className="space-y-4">
      <label className="block text-xs text-neutral-500">
        Search title or note
        <input
          type="search"
          value={draft.q}
          onChange={(event) => setDraft({ ...draft, q: event.currentTarget.value })}
          className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-400"
        />
      </label>
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
  categories: NonNullable<ReturnType<typeof useLedgerFilterOptions>>["categories"],
) {
  return categories.map((category) => ({
    value: category.id,
    label: category.name,
    detail: category.status === "archived" ? "archived" : undefined,
    color: category.color,
  }));
}

function toMemberOptions(
  members: NonNullable<ReturnType<typeof useLedgerFilterOptions>>["members"],
) {
  return members.map((member) => ({
    value: member.id,
    label: member.displayName,
    detail: member.status === "removed" ? "removed" : undefined,
  })) satisfies MultiSelectOption[];
}

function formatMonthLabel(month: PlainMonth) {
  const parts = month.split("-");
  const year = Number(parts[0]);
  const monthIndex = Number(parts[1]);
  return new Date(year, monthIndex - 1, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

function MonthNavigator({
  month,
  onChange,
}: {
  month: PlainMonth;
  onChange: (month: PlainMonth) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const input = inputRef.current;
    if (input && input.value !== month) {
      input.value = month;
    }
  }, [month]);

  const commit = () => {
    const input = inputRef.current;
    if (!input) {
      return;
    }
    if (isValidPlainMonth(input.value)) {
      if (input.value !== month) {
        onChange(input.value);
      }
    } else {
      input.value = month;
    }
  };

  return (
    <fieldset className="flex items-center gap-2">
      <legend className="sr-only">Select month</legend>
      <Button
        type="button"
        variant="outline"
        aria-label="Previous month"
        onClick={() => onChange(addMonths(month, -1))}
      >
        ‹
      </Button>
      <label htmlFor="ledger-month" className="sr-only">
        Month
      </label>
      <input
        ref={inputRef}
        id="ledger-month"
        type="month"
        defaultValue={month}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            commit();
          }
        }}
        className="rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm outline-none transition-colors focus:border-neutral-400"
      />
      <Button
        type="button"
        variant="outline"
        aria-label="Next month"
        onClick={() => onChange(addMonths(month, 1))}
      >
        ›
      </Button>
    </fieldset>
  );
}

function MonthlyTotals({
  summary,
  fallbackCurrency,
  label,
}: {
  summary: MonthlySummary | null | undefined;
  fallbackCurrency: string;
  label: string;
}) {
  const currency = toCurrencyCode(summary?.currency ?? fallbackCurrency);
  const totals = summary?.totals;
  const stats = [
    { label: "Income", amount: totals?.incomeMinor, tone: "text-green-400" },
    { label: "Expenses", amount: totals?.expenseMinor, tone: "text-neutral-100" },
    {
      label: "Net",
      amount: totals?.netMinor,
      tone: (totals?.netMinor ?? 0) >= 0 ? "text-green-400" : "text-red-400",
    },
  ];

  return (
    <fieldset>
      <legend className="sr-only">{label}</legend>
      <dl className="grid grid-cols-3 gap-3">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-md border border-neutral-800 p-3">
            <dt className="text-xs text-neutral-500">{stat.label}</dt>
            <dd className={cn("text-sm font-semibold tabular-nums", stat.tone)}>
              {stat.amount === undefined
                ? "..."
                : formatMoney(money(stat.amount, currency), viewerLocale())}
            </dd>
          </div>
        ))}
      </dl>
    </fieldset>
  );
}
