import {
  LIMITS,
  type TransactionType,
  formatMinorUnits,
  minorUnitsToMajorString,
  parseAmountToMinorUnits,
  toCurrencyCode,
  toMutationArgs,
  toPlainDate,
  transactionFieldSchemas,
  transactionFormSchema,
} from "@spend-circle/domain";
import { useForm } from "@tanstack/react-form";
import { useState } from "react";
import { Button } from "~/components/ui/button.js";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "~/components/ui/field.js";
import { Input } from "~/components/ui/input.js";
import { Textarea } from "~/components/ui/textarea.js";
import {
  type Category,
  type Circle,
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

      {/* Gated on `writable` too, so a Circle archived mid-edit (its reactive query
          flips status) closes the open form live; the read-only banner above then
          explains why. An inaccessible Circle is handled a layer up by the guard
          (it ejects to a safe route — ADR 0016/0017). */}
      {formType && writable ? (
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

/** The form's value shape. `type` is fixed per instance (the CTA picks it, not a
 * field) but lives here so the whole-form submit validator covers it. Ids are plain
 * strings to match the validation schemas exactly; they're resolved back to the
 * loaded Category / Member ids (no cast) at submit. */
interface TransactionFormValues {
  type: TransactionType;
  title: string;
  amount: string;
  note: string;
  date: string;
  categoryIds: string[];
  paidByMemberId: string;
}

/**
 * The Add Expense / Add Income form, built on TanStack Form (ADR 0020) so it shares
 * one form model with the future native app. Amount is entered in major units and
 * converted to minor units at submit (ADR 0009) by `toMutationArgs`; the date is a
 * plain `YYYY-MM-DD`; Categories are a multi-select of the active Categories of this
 * type; Paid By defaults to the creator and can be set to any current Member.
 *
 * Validation mirrors the shared schemas (the server re-validates and owns every
 * invariant — ADR 0015): each field validates on blur, errors reveal on-blur-then-
 * live (only once a field is both blurred and dirty, or once submit was attempted),
 * and the whole-form `transactionFormSchema` is the submit gate. So tabbing through
 * an untouched field stays quiet and "required" surfaces on submit, while an edited-
 * but-invalid field flags on blur.
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
  // Include archived Categories so a Category archived mid-edit (by another Member)
  // stays visible and resolvable rather than silently vanishing from the selection
  // — only ACTIVE Categories are newly pickable (PRD story 57).
  const categories = useCategories(circle.id, type, { includeArchived: true });
  const members = useMembers(circle.id);
  const allCategories = categories ?? [];
  const activeCategories = allCategories.filter((category) => category.status === "active");
  const categoryById = new Map<string, Category>(
    allCategories.map((category) => [category.id, category]),
  );

  // The caller's own Member, used as the Paid By default (PRD story 36). Members
  // load async, so the selection falls back to self once known.
  const selfMemberId = (members ?? []).find((member) => member.isSelf)?.id ?? "";

  // A failed create (an unexpected/transient server error) shown generically.
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Flipped on a rejected submit so every field reveals its error at once — this is
  // how an untouched required field surfaces (it stays quiet on blur until here).
  const [showAllErrors, setShowAllErrors] = useState(false);

  const defaultValues: TransactionFormValues = {
    type,
    title: "",
    amount: "",
    note: "",
    date: toPlainDate(new Date()),
    categoryIds: [],
    paidByMemberId: "",
  };

  const form = useForm({
    defaultValues,
    // The whole-form submit gate. Field-level validators (below) drive the live
    // on-blur feedback; this re-checks everything (incl. cross-field rules) at submit.
    validators: { onSubmit: transactionFormSchema },
    onSubmitInvalid: () => setShowAllErrors(true),
    onSubmit: async ({ value }) => {
      setSubmitError(null);
      // Resolve every selected id back to its loaded Category (its own branded id —
      // no cast). A selection that isn't an ACTIVE Category can't be added to a NEW
      // Transaction, so block the submit (the server enforces the same rule, ADR 0015,
      // as the backstop). Two ways a selection fails, handled differently:
      //   - Archived mid-edit (PRD story 57): still resolvable, since the list includes
      //     archived. It stays VISIBLE below as an "archived" chip with an inline alert
      //     to remove it — the surfaced, user-recoverable case the chip UX exists for.
      //   - Unresolvable id (the `length` check below): only reachable when the whole
      //     list went `null`, i.e. the Circle just became inaccessible (ADR 0016). The
      //     guard layout is already tearing this form down and there's no Category (so
      //     no name) to render, so we block defensively without a dedicated chip.
      const selectedCategories = value.categoryIds
        .map((id) => categoryById.get(id))
        .filter((category) => category !== undefined);
      const everySelectedIsActive =
        selectedCategories.length === value.categoryIds.length &&
        selectedCategories.every((category) => category.status === "active");
      if (!everySelectedIsActive) {
        return;
      }
      const args = toMutationArgs(value, selfMemberId);
      const categoryIds = selectedCategories.map((category) => category.id);
      const paidByMemberId = args.paidByMemberId
        ? (members ?? []).find((member) => member.id === args.paidByMemberId)?.id
        : undefined;
      try {
        await createTransaction({
          circleId: circle.id,
          type: args.type,
          title: args.title,
          note: args.note,
          amountMinorUnits: args.amountMinorUnits,
          date: args.date,
          categoryIds,
          paidByMemberId,
        });
        onClose();
      } catch (error) {
        // Known rejections are already mirrored by the schema, so anything reaching
        // here is unexpected — surface it (Sentry once it lands, ADR 0012) rather
        // than swallow it, and show the user a generic retry message.
        console.error("createTransaction failed", error);
        setSubmitError("Couldn't save the transaction. Please try again.");
      }
    },
  });

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void form.handleSubmit();
      }}
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

      <FieldGroup>
        <form.Field name="title" validators={{ onBlur: transactionFieldSchemas.title }}>
          {(field) => {
            const reveal =
              (field.state.meta.isBlurred && field.state.meta.isDirty) || showAllErrors;
            const invalid = reveal && field.state.meta.errors.length > 0;
            return (
              <Field>
                <FieldLabel htmlFor="txn-title">Title</FieldLabel>
                <Input
                  id="txn-title"
                  value={field.state.value}
                  onChange={(event) => field.handleChange(event.target.value)}
                  onBlur={field.handleBlur}
                  maxLength={LIMITS.transactionTitleMax}
                  placeholder="e.g. Weekly shop"
                  autoComplete="off"
                  aria-invalid={invalid}
                />
                <FieldError errors={invalid ? field.state.meta.errors : undefined} />
              </Field>
            );
          }}
        </form.Field>

        <div className="grid grid-cols-2 gap-3">
          <form.Field name="amount" validators={{ onBlur: transactionFieldSchemas.amount }}>
            {(field) => {
              const reveal =
                (field.state.meta.isBlurred && field.state.meta.isDirty) || showAllErrors;
              const invalid = reveal && field.state.meta.errors.length > 0;
              return (
                <Field>
                  <FieldLabel htmlFor="txn-amount">Amount ({circle.currency})</FieldLabel>
                  <Input
                    id="txn-amount"
                    inputMode="decimal"
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                    onBlur={() => {
                      field.handleBlur();
                      // Normalize to two decimals on blur (e.g. "12.5" → "12.50").
                      const parsed = parseAmountToMinorUnits(field.state.value);
                      if (parsed.ok) {
                        field.handleChange(minorUnitsToMajorString(parsed.minorUnits));
                      }
                    }}
                    placeholder="0.00"
                    autoComplete="off"
                    aria-invalid={invalid}
                  />
                  <FieldError errors={invalid ? field.state.meta.errors : undefined} />
                </Field>
              );
            }}
          </form.Field>

          <form.Field name="date" validators={{ onBlur: transactionFieldSchemas.date }}>
            {(field) => {
              const reveal =
                (field.state.meta.isBlurred && field.state.meta.isDirty) || showAllErrors;
              const invalid = reveal && field.state.meta.errors.length > 0;
              return (
                <Field>
                  <FieldLabel htmlFor="txn-date">Date</FieldLabel>
                  <Input
                    id="txn-date"
                    type="date"
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                    onBlur={field.handleBlur}
                    aria-invalid={invalid}
                  />
                  <FieldError errors={invalid ? field.state.meta.errors : undefined} />
                </Field>
              );
            }}
          </form.Field>
        </div>

        <form.Field
          name="categoryIds"
          validators={{ onChange: transactionFieldSchemas.categoryIds }}
        >
          {(field) => {
            // No blur for a chip group; reveal once any chip was toggled, or on submit.
            const reveal = field.state.meta.isDirty || showAllErrors;
            const invalid = reveal && field.state.meta.errors.length > 0;
            const deselect = (id: string) =>
              field.handleChange(field.state.value.filter((current) => current !== id));
            // Selected Categories that were archived while the form was open: they
            // can't be added to a new Transaction (PRD story 57), so we keep them
            // VISIBLE (not silently dropped) and deselectable, badged "archived".
            const archivedSelected = field.state.value.flatMap((id) => {
              const category = categoryById.get(id);
              return category && category.status === "archived" ? [category] : [];
            });
            return (
              <FieldSet>
                <FieldLegend>Categories</FieldLegend>
                {activeCategories.length === 0 && archivedSelected.length === 0 ? (
                  <p className="text-xs text-neutral-500">
                    No {type} categories yet. Create one first to record a {type}.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
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
                    {archivedSelected.map((category) => (
                      <button
                        key={category.id}
                        type="button"
                        aria-pressed={true}
                        onClick={() => deselect(category.id)}
                        className="rounded-full border border-amber-600/70 bg-amber-950/40 px-3 py-1 text-sm text-amber-300 transition-colors hover:text-amber-100"
                      >
                        {category.name} · archived ✕
                      </button>
                    ))}
                  </div>
                )}
                {archivedSelected.length > 0 ? (
                  <p role="alert" className="text-sm text-amber-400">
                    {archivedSelected.length === 1
                      ? `"${archivedSelected[0]?.name}" was archived and can't be added to a new ${type}. Remove it to continue.`
                      : "Some selected categories were archived and can't be added to a new transaction. Remove them to continue."}
                  </p>
                ) : null}
                <FieldError errors={invalid ? field.state.meta.errors : undefined} />
              </FieldSet>
            );
          }}
        </form.Field>

        <form.Field name="paidByMemberId">
          {(field) => (
            <Field>
              <FieldLabel htmlFor="txn-paid-by">Paid by</FieldLabel>
              <select
                id="txn-paid-by"
                value={field.state.value || selfMemberId}
                onChange={(event) => field.handleChange(event.target.value)}
                className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm outline-none transition-colors focus:border-neutral-400"
              >
                {selfMemberId === "" ? <option value="">Loading…</option> : null}
                {(members ?? []).map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.isSelf ? `${member.displayName} (You)` : member.displayName}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </form.Field>

        <form.Field name="note" validators={{ onBlur: transactionFieldSchemas.note }}>
          {(field) => {
            const reveal =
              (field.state.meta.isBlurred && field.state.meta.isDirty) || showAllErrors;
            const invalid = reveal && field.state.meta.errors.length > 0;
            return (
              <Field>
                <FieldLabel htmlFor="txn-note">
                  Note <span className="text-neutral-500">(optional)</span>
                </FieldLabel>
                <Textarea
                  id="txn-note"
                  value={field.state.value}
                  onChange={(event) => field.handleChange(event.target.value)}
                  onBlur={field.handleBlur}
                  maxLength={LIMITS.transactionNoteMax}
                  rows={2}
                  placeholder="Extra context"
                  aria-invalid={invalid}
                />
                <FieldError errors={invalid ? field.state.meta.errors : undefined} />
              </Field>
            );
          }}
        </form.Field>
      </FieldGroup>

      {submitError ? <FieldError>{submitError}</FieldError> : null}

      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(isSubmitting) => (
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Saving…" : `Add ${TYPE_LABEL[type].toLowerCase()}`}
          </Button>
        )}
      </form.Subscribe>
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
