import {
  LIMITS,
  type TransactionType,
  formatMinorUnits,
  minorUnitsToMajorString,
  parseAmountToMinorUnits,
  toCurrencyCode,
  toPlainDate,
  transactionInputSchema,
} from "@spend-circle/domain";
import { type FormEvent, useState } from "react";
import { Button } from "~/components/ui/button.js";
import {
  type Category,
  type Circle,
  type Member,
  type PaginatedTransactions,
  useCategories,
  useCreateTransaction,
  useMembers,
  useTransactions,
} from "~/lib/data.js";
import { cn } from "~/lib/utils.js";
import { useCircle } from "~/routes/layouts/circle-layout.js";

const TYPE_LABEL: Record<TransactionType, string> = {
  expense: "Expense",
  income: "Income",
};

/**
 * Monthly Ledger / Transactions surface (PRD stories 62–67). TXN-1 lands the core
 * write here: dedicated Add Expense / Add Income CTAs (not a type dropdown — PRD
 * 27, 28) open a Transaction form scoped to that type, and the live list below
 * confirms a create landed. The full Ledger filters/search are RPT-* surfaces
 * layered on the same `useTransactions` read.
 */
export default function CircleTransactions() {
  const circle = useCircle();
  const transactions = useTransactions(circle.id);
  // The open form's type, or null when closed. The two CTAs each set their type,
  // so the form never needs a type dropdown.
  const [formType, setFormType] = useState<TransactionType | null>(null);
  const writable = circle.status === "active";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Transactions</h2>
        {writable ? (
          <div className="flex gap-2">
            <Button type="button" onClick={() => setFormType("expense")}>
              Add expense
            </Button>
            <Button type="button" variant="outline" onClick={() => setFormType("income")}>
              Add income
            </Button>
          </div>
        ) : null}
      </div>

      {!writable ? (
        <p className="rounded-md border border-neutral-800 p-3 text-sm text-neutral-500">
          This circle is archived. Restore it to add transactions.
        </p>
      ) : null}

      {formType ? (
        <TransactionForm
          key={formType}
          circle={circle}
          type={formType}
          onClose={() => setFormType(null)}
        />
      ) : null}

      <TransactionList paginated={transactions} currency={circle.currency} />
    </div>
  );
}

/** Sentinel for the default Paid By selection ("Me"): omit so the server defaults
 * Paid By to the Recorded By Member (the creator). */
const PAID_BY_SELF = "";

/**
 * The Add Expense / Add Income form. Amount is entered in major units and parsed
 * to minor units at the boundary (ADR 0009); the date is a plain `YYYY-MM-DD`;
 * Categories are a multi-select of the active Categories of this type; Paid By
 * defaults to the creator and can be set to any current Member. The server
 * re-validates and owns every invariant (ADR 0015) — this is the courtesy mirror.
 */
function TransactionForm({
  circle,
  type,
  onClose,
}: {
  circle: Circle;
  type: TransactionType;
  onClose: () => void;
}) {
  const createTransaction = useCreateTransaction();
  const categories = useCategories(circle.id, type);
  const members = useMembers(circle.id);

  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(() => toPlainDate(new Date()));
  const [selectedCategories, setSelectedCategories] = useState<Category["id"][]>([]);
  const [paidBy, setPaidBy] = useState<string>(PAID_BY_SELF);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function toggleCategory(id: Category["id"]) {
    setError(null);
    setSelectedCategories((current) =>
      current.includes(id) ? current.filter((c) => c !== id) : [...current, id],
    );
  }

  /** Normalize the amount to two decimals on blur (e.g. "12.5" → "12.50"). */
  function formatAmountOnBlur() {
    const parsed = parseAmountToMinorUnits(amount);
    if (parsed.ok) {
      setAmount(minorUnitsToMajorString(parsed.minorUnits));
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    // Client-side mirror of the shared schema (the server re-validates — ADR 0015).
    const parsed = transactionInputSchema.safeParse({
      type,
      title,
      note: note.trim() === "" ? undefined : note,
      amount,
      date,
      categoryIds: selectedCategories,
      paidByMemberId: paidBy === PAID_BY_SELF ? "self" : paidBy,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Please check the transaction details.");
      return;
    }

    setSubmitting(true);
    try {
      await createTransaction({
        circleId: circle.id,
        type,
        title: parsed.data.title,
        note: parsed.data.note,
        amountMinorUnits: parsed.data.amountMinorUnits,
        date: parsed.data.date,
        categoryIds: selectedCategories,
        // Omit when "Me" is selected so the server defaults Paid By to the creator.
        paidByMemberId: paidBy === PAID_BY_SELF ? undefined : (paidBy as Member["id"]),
      });
      onClose();
    } catch {
      // Every server rejection here is one the form already mirrors, so it's a
      // transient/unexpected failure by the time it surfaces — keep it generic.
      setError("Couldn't save the transaction. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const activeCategories = categories ?? [];
  const canSubmit =
    title.trim() !== "" && amount.trim() !== "" && selectedCategories.length > 0 && !submitting;

  return (
    <form
      onSubmit={onSubmit}
      aria-label={`Add ${TYPE_LABEL[type].toLowerCase()}`}
      className="space-y-4 rounded-lg border border-neutral-800 p-4"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Add {TYPE_LABEL[type].toLowerCase()}</h3>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-neutral-400 hover:text-neutral-100"
        >
          Cancel
        </button>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="txn-title" className="block text-sm font-medium">
          Title
        </label>
        <input
          id="txn-title"
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
            setError(null);
          }}
          maxLength={LIMITS.transactionTitleMax}
          placeholder="e.g. Weekly shop"
          autoComplete="off"
          className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-neutral-400"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label htmlFor="txn-amount" className="block text-sm font-medium">
            Amount ({circle.currency})
          </label>
          <input
            id="txn-amount"
            inputMode="decimal"
            value={amount}
            onChange={(event) => {
              setAmount(event.target.value);
              setError(null);
            }}
            onBlur={formatAmountOnBlur}
            placeholder="0.00"
            autoComplete="off"
            className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-neutral-400"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="txn-date" className="block text-sm font-medium">
            Date
          </label>
          <input
            id="txn-date"
            type="date"
            value={date}
            onChange={(event) => {
              setDate(event.target.value);
              setError(null);
            }}
            className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-neutral-400"
          />
        </div>
      </div>

      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium">Categories</legend>
        {activeCategories.length === 0 ? (
          <p className="text-xs text-neutral-500">
            No {type} categories yet. Create one first to record a {type}.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {activeCategories.map((category) => {
              const selected = selectedCategories.includes(category.id);
              return (
                <button
                  key={category.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => toggleCategory(category.id)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-sm transition-colors",
                    selected
                      ? "border-neutral-100 bg-neutral-100 text-neutral-900"
                      : "border-neutral-700 text-neutral-300 hover:text-neutral-100",
                  )}
                >
                  {category.name}
                </button>
              );
            })}
          </div>
        )}
      </fieldset>

      <div className="space-y-1.5">
        <label htmlFor="txn-paid-by" className="block text-sm font-medium">
          Paid by
        </label>
        <select
          id="txn-paid-by"
          value={paidBy}
          onChange={(event) => setPaidBy(event.target.value)}
          className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-neutral-400"
        >
          <option value={PAID_BY_SELF}>Me</option>
          {(members ?? []).map((member) => (
            <option key={member.id} value={member.id}>
              {member.displayName}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="txn-note" className="block text-sm font-medium">
          Note <span className="text-neutral-500">(optional)</span>
        </label>
        <textarea
          id="txn-note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={LIMITS.transactionNoteMax}
          rows={2}
          placeholder="Extra context"
          className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-neutral-400"
        />
      </div>

      {error ? (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      ) : null}

      <Button type="submit" disabled={!canSubmit}>
        {submitting ? "Saving…" : `Add ${TYPE_LABEL[type].toLowerCase()}`}
      </Button>
    </form>
  );
}

/**
 * The active Transactions, most recent first, with money formatted in the Circle
 * Currency. Paginated: it renders the loaded page and a Load more control while
 * more remain, so an arbitrarily long ledger never loads in one shot.
 */
function TransactionList({
  paginated,
  currency,
}: {
  paginated: PaginatedTransactions;
  currency: string;
}) {
  const { transactions, status, loadMore } = paginated;

  if (status === "LoadingFirstPage") {
    return <p className="text-sm text-neutral-500">Loading transactions…</p>;
  }
  // An inaccessible Circle (ADR 0016) and an empty Circle both arrive as an empty
  // page — the Circle guard already gated entry, so treat both as nothing to show.
  if (transactions.length === 0) {
    return <p className="text-sm text-neutral-500">No transactions yet.</p>;
  }

  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {transactions.map((txn) => (
          <li
            key={txn.id}
            className="flex items-center gap-3 rounded-md border border-neutral-800 px-3 py-2"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{txn.title}</p>
              <p className="truncate text-xs text-neutral-500">
                {txn.date} · {txn.categories.map((category) => category.name).join(", ")} ·{" "}
                {txn.paidBy.displayName}
              </p>
            </div>
            <span
              className={cn(
                "ml-auto text-sm font-medium tabular-nums",
                txn.type === "income" ? "text-green-400" : "text-neutral-100",
              )}
            >
              {txn.type === "income" ? "+" : "-"}
              {formatMinorUnits(txn.amountMinorUnits, toCurrencyCode(currency))}
            </span>
          </li>
        ))}
      </ul>

      {status === "CanLoadMore" || status === "LoadingMore" ? (
        <Button
          type="button"
          variant="outline"
          onClick={loadMore}
          disabled={status === "LoadingMore"}
        >
          {status === "LoadingMore" ? "Loading…" : "Load more"}
        </Button>
      ) : null}
    </div>
  );
}
