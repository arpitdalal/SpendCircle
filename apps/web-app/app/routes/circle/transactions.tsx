import {
  LIMITS,
  type PlainMonth,
  TRANSACTION_TYPES,
  type TransactionType,
  addMonths,
  currentMonth,
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
import { useEffect, useRef, useState } from "react";
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
  type Member,
  type MonthlySummary,
  type PaginatedTransactions,
  type Transaction,
  useCategories,
  useCreateTransaction,
  useMembers,
  useMonthlyLedger,
  useUpdateTransaction,
} from "~/lib/data.js";
import { cn } from "~/lib/utils.js";
import { useCircle } from "~/routes/layouts/circle-layout.js";

const TYPE_LABEL: Record<TransactionType, string> = {
  expense: "Expense",
  income: "Income",
};

const STALE_PAID_BY_ERROR =
  "The selected payer is no longer a member of this circle. Pick a current member.";

/**
 * Resolves a selected Paid By (a form string) to a current Member's branded id.
 *
 * Returns `{ ok: false }` only when a NON-EMPTY selection no longer matches a current
 * Member AND isn't the Transaction's existing Paid By — i.e. the picked Member was
 * removed from the Circle while the form was open. The caller BLOCKS submit on that
 * with a visible message rather than silently dropping the change to self / leaving it
 * unchanged (README §4 "no silent failures"; a stale form must never "succeed" — see
 * QA-1). Keeping the existing Paid By (even a now-Removed one) stays an allowed no-op,
 * and an empty selection defers to the server default — mirroring the keep-attached /
 * block-newly-added asymmetry the archived-Category guard uses (QA-2). The server is
 * the authority either way (ADR 0015); this is the courtesy that surfaces the hazard.
 *
 * No cast: the resolved id is the branded `Member["id"]` off the loaded `members` row
 * or the Transaction's own Paid By — never the opaque form string widened to an id.
 */
function resolvePaidBy(
  selected: string,
  members: Member[],
  currentPaidById?: Member["id"],
): { ok: true; memberId?: Member["id"] } | { ok: false } {
  if (!selected) {
    return { ok: true, memberId: undefined }; // nothing picked → server applies its default
  }
  const current = members.find((member) => member.id === selected)?.id;
  if (current) {
    return { ok: true, memberId: current };
  }
  if (currentPaidById && selected === currentPaidById) {
    return { ok: true, memberId: currentPaidById }; // unchanged existing Paid By — a no-op
  }
  return { ok: false }; // selected Member is gone — block, don't drop
}

/**
 * The Monthly Ledger — the Circle's operational Transaction management surface and
 * its default view (glossary; PRD stories 62–67). It shows ONE selected month: that
 * month's Income / Expense / Net totals, that month's active Transactions (sorted
 * Transaction Date desc then created-at desc), and month/year navigation (PRD 64).
 * Archived Transactions are excluded (TXN-3). Dedicated Add Expense / Add Income
 * CTAs (not a type dropdown — PRD 27, 28) open a Transaction form scoped to that
 * type; the live list confirms a create landed. Search/filters are RPT-2.
 *
 * The totals come from `getMonthlyLedger` (a bounded server-side aggregate over the
 * whole month — never summed from the page) and the list from the month-scoped,
 * paginated `listTransactions`; `useMonthlyLedger` fuses the two for the selected
 * month and re-runs when navigation changes it.
 */
/**
 * The open form: a create scoped to a CTA-chosen type, an edit of one saved
 * Transaction, or closed (`null`). Only one is ever open — opening an edit closes a
 * create and vice versa, and the `key` derived from it remounts the form so it never
 * carries another Transaction's state.
 */
type OpenForm =
  | { kind: "create"; type: TransactionType }
  | { kind: "edit"; transaction: Transaction };

const openFormKey = (form: OpenForm) =>
  form.kind === "create" ? `create-${form.type}` : `edit-${form.transaction.id}`;

export default function CircleTransactions() {
  const circle = useCircle();
  // The selected month, defaulting to the current month (the default Ledger view —
  // glossary). Navigation is pure month arithmetic via `addMonths` (no Date math), so
  // year boundaries (Dec→Jan) just work.
  const [month, setMonth] = useState<PlainMonth>(() => currentMonth(new Date()));
  const { summary, transactions } = useMonthlyLedger(circle.id, month);
  // The open create/edit form, or null when closed. The two CTAs each open a create
  // scoped to their type; a row's Edit action opens an edit, so the form never needs
  // a type dropdown for creation.
  const [openForm, setOpenForm] = useState<OpenForm | null>(null);
  const writable = circle.status === "active";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Transactions</h2>
        {writable ? (
          <div className="flex gap-2">
            <Button type="button" onClick={() => setOpenForm({ kind: "create", type: "expense" })}>
              Add expense
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpenForm({ kind: "create", type: "income" })}
            >
              Add income
            </Button>
          </div>
        ) : null}
      </div>

      <MonthNavigator month={month} onChange={setMonth} />
      <MonthlyTotals summary={summary} fallbackCurrency={circle.currency} />

      {!writable ? (
        <p className="rounded-md border border-neutral-800 p-3 text-sm text-neutral-500">
          This circle is archived. Restore it to add transactions.
        </p>
      ) : null}

      {/* Gated on `writable` too, so a Circle archived mid-edit (its reactive query
          flips status) closes the open form live; the read-only banner above then
          explains why. An inaccessible Circle is handled a layer up by the guard
          (it ejects to a safe route — ADR 0016/0017). */}
      {openForm && writable ? (
        <TransactionForm
          key={openFormKey(openForm)}
          circle={circle}
          mode={openForm}
          onClose={() => setOpenForm(null)}
        />
      ) : null}

      <TransactionList
        paginated={transactions}
        currency={circle.currency}
        monthLabel={formatMonthLabel(month)}
        canEdit={writable}
        onEdit={(transaction) => setOpenForm({ kind: "edit", transaction })}
      />
    </div>
  );
}

/** A "YYYY-MM" month as a human label, e.g. "June 2026". Built from the plain month
 * parts (no timezone parsing) so it matches the stored bucket exactly. */
function formatMonthLabel(month: PlainMonth): string {
  const parts = month.split("-");
  const year = Number(parts[0]);
  const monthIndex = Number(parts[1]);
  return new Date(year, monthIndex - 1, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

/**
 * Month/year navigation for the Ledger (PRD 64): previous / next step by one month
 * (`addMonths`, so Dec↔Jan crosses the year correctly), and the native month input
 * jumps to any month. The input is the single source of the value; the buttons drive
 * it through the same `onChange`.
 */
function MonthNavigator({
  month,
  onChange,
}: {
  month: PlainMonth;
  onChange: (month: PlainMonth) => void;
}) {
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
        id="ledger-month"
        type="month"
        value={month}
        onChange={(event) => {
          // The native control clears to "" when emptied; ignore that so the Ledger
          // always has a selected month.
          if (event.target.value) {
            onChange(event.target.value);
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

/**
 * The selected month's Income / Expense / Net header. Totals are minor units summed
 * server-side and formatted ONCE here in the Circle Currency (ADR 0009) — never
 * summed from formatted strings. `summary` is `undefined` while loading (placeholders
 * shown) and `null` only for an inaccessible Circle (the guard ejects before this
 * renders); the currency falls back to the Circle's until the summary resolves.
 */
function MonthlyTotals({
  summary,
  fallbackCurrency,
}: {
  summary: MonthlySummary | null | undefined;
  fallbackCurrency: string;
}) {
  const currency = toCurrencyCode(summary?.currency ?? fallbackCurrency);
  const totals = summary?.totals;
  const stats: { label: string; amount: number | undefined; tone: string }[] = [
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
      <legend className="sr-only">Monthly totals</legend>
      <dl className="grid grid-cols-3 gap-3">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-md border border-neutral-800 p-3">
            <dt className="text-xs text-neutral-500">{stat.label}</dt>
            <dd className={cn("text-sm font-semibold tabular-nums", stat.tone)}>
              {stat.amount === undefined ? "…" : formatMinorUnits(stat.amount, currency)}
            </dd>
          </div>
        ))}
      </dl>
    </fieldset>
  );
}

/** The form's value shape. `type` lives here (not just as a prop) so the whole-form
 * submit validator covers it and the edit form's type switch drives it. Ids are plain
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
 * The open form, scoped to a CTA-chosen type for a create or to one saved
 * Transaction for an edit (TXN-2). The discriminant drives the defaults, the type
 * control, and which mutation the submit calls.
 */
type TransactionFormMode =
  | { kind: "create"; type: TransactionType }
  | { kind: "edit"; transaction: Transaction };

/**
 * The Add / Edit Transaction form, built on TanStack Form (ADR 0020) so it shares one
 * form model with the future native app. Amount is entered in major units and
 * converted to minor units at submit (ADR 0009); the date is a plain `YYYY-MM-DD`;
 * Categories are a multi-select of the active Categories of the current type; Paid By
 * defaults to the creator and can be set to any current Member.
 *
 * Create scopes the type to the CTA. Edit prefills from the saved Transaction and adds
 * a segmented Expense/Income switch: switching on a saved Transaction is a Type Change
 * (PRD 29, 30), so it asks for confirmation, then CLEARS the Category selection and
 * requires re-picking from the new type's active Categories before save — the server
 * enforces the same (≥1 active Category of the new type, old ones cleared) and owns
 * every invariant (ADR 0015); the UI is the courtesy on top.
 *
 * Validation mirrors the shared schemas: each field validates on blur, errors reveal
 * on-blur-then-live (once a field is both blurred and dirty, or once submit was
 * attempted), and the whole-form `transactionFormSchema` is the submit gate.
 */
function TransactionForm({
  circle,
  mode,
  onClose,
}: {
  circle: Circle;
  mode: TransactionFormMode;
  onClose: () => void;
}) {
  const createTransaction = useCreateTransaction();
  const updateTransaction = useUpdateTransaction();
  const isEdit = mode.kind === "edit";
  // The Transaction's saved type on open; the segmented switch can move `activeType`
  // away from it in edit mode (a Type Change).
  const initialType = mode.kind === "create" ? mode.type : mode.transaction.type;
  const [activeType, setActiveType] = useState<TransactionType>(initialType);
  const isTypeChanged = activeType !== initialType;

  // Include archived Categories so a Category archived mid-edit (by another Member)
  // stays visible and resolvable rather than silently vanishing — only ACTIVE
  // Categories are newly pickable (PRD story 57). The query follows `activeType`, so a
  // Type Change re-lists the new type's Categories.
  const categories = useCategories(circle.id, activeType, { includeArchived: true });
  const members = useMembers(circle.id);
  const allCategories = categories ?? [];
  const activeCategories = allCategories.filter((category) => category.status === "active");
  const categoryById = new Map<string, Category>(
    allCategories.map((category) => [category.id, category]),
  );

  // Categories already attached to the Transaction at open: an edit may KEEP an
  // already-attached archived Category but never NEWLY add one (PRD 57), mirroring the
  // server's `alreadyAttached`. After a Type Change nothing carries over (the old
  // Categories are of the old type and get cleared), so the set is empty.
  const alreadyAttached = new Set<string>(
    mode.kind === "edit" && !isTypeChanged
      ? mode.transaction.categories.map((category) => category.id)
      : [],
  );

  // The caller's own Member, used as the create Paid By default (PRD story 36).
  const selfMemberId = (members ?? []).find((member) => member.isSelf)?.id ?? "";

  // Paid By options: current Members, plus — in edit — the Transaction's current Paid
  // By if it is a Removed Member no longer in the list, so the existing value still
  // shows. Only current Members can be NEWLY selected (the server rejects assigning a
  // Removed Member); keeping the existing one is a no-op the server allows.
  const paidByOptions = (members ?? []).map((member) => ({
    value: member.id,
    label: member.isSelf ? `${member.displayName} (You)` : member.displayName,
  }));
  if (mode.kind === "edit") {
    const current = mode.transaction.paidBy;
    if (!paidByOptions.some((option) => option.value === current.id)) {
      paidByOptions.push({ value: current.id, label: `${current.displayName} (removed)` });
    }
  }

  // A failed save (an unexpected/transient server error) shown generically.
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Flipped on a rejected submit so every field reveals its error at once — this is
  // how an untouched required field surfaces (it stays quiet on blur until here).
  const [showAllErrors, setShowAllErrors] = useState(false);
  // The type awaiting confirmation (edit-only), or null. Set when the user picks the
  // other segment; confirming applies the Type Change and clears the categories.
  const [pendingType, setPendingType] = useState<TransactionType | null>(null);
  const confirmTypeRef = useRef<HTMLButtonElement>(null);
  // Move focus into the confirmation so it's keyboard-operable and announced.
  useEffect(() => {
    if (pendingType) {
      confirmTypeRef.current?.focus();
    }
  }, [pendingType]);

  const defaultValues: TransactionFormValues =
    mode.kind === "create"
      ? {
          type: initialType,
          title: "",
          amount: "",
          note: "",
          date: toPlainDate(new Date()),
          categoryIds: [],
          paidByMemberId: "",
        }
      : {
          type: mode.transaction.type,
          title: mode.transaction.title,
          amount: minorUnitsToMajorString(mode.transaction.amountMinorUnits),
          note: mode.transaction.note ?? "",
          date: mode.transaction.date,
          categoryIds: mode.transaction.categories.map((category) => category.id),
          paidByMemberId: mode.transaction.paidBy.id,
        };

  const form = useForm({
    defaultValues,
    // The whole-form submit gate. Field-level validators (below) drive the live
    // on-blur feedback; this re-checks everything (incl. cross-field rules) at submit.
    validators: { onSubmit: transactionFormSchema },
    onSubmitInvalid: () => setShowAllErrors(true),
    onSubmit: async ({ value }) => {
      setSubmitError(null);
      // Resolve every selected id back to its loaded Category (its own branded id — no
      // cast). Block the submit if a selection is unresolvable (only when the whole
      // list went `null` — the Circle just became inaccessible, ADR 0016, and the guard
      // is already tearing the form down) or if an ARCHIVED Category is being newly
      // added (PRD 57) — an already-attached archived one may stay. The server enforces
      // the same rules as the backstop (ADR 0015).
      const selectedCategories = value.categoryIds
        .map((id) => categoryById.get(id))
        .filter((category) => category !== undefined);
      const allResolved = selectedCategories.length === value.categoryIds.length;
      const newlyArchived = selectedCategories.filter(
        (category) => category.status === "archived" && !alreadyAttached.has(category.id),
      );
      if (!allResolved || newlyArchived.length > 0) {
        return;
      }
      const categoryIds = selectedCategories.map((category) => category.id);

      try {
        if (mode.kind === "create") {
          const args = toMutationArgs(value, selfMemberId);
          // `toMutationArgs` already collapsed a self / unpicked Paid By to undefined;
          // resolve any explicit pick, blocking if that Member was removed mid-form
          // rather than silently defaulting back to self.
          const paidBy = resolvePaidBy(args.paidByMemberId ?? "", members ?? []);
          if (!paidBy.ok) {
            setSubmitError(STALE_PAID_BY_ERROR);
            return;
          }
          await createTransaction({
            circleId: circle.id,
            type: args.type,
            title: args.title,
            note: args.note,
            amountMinorUnits: args.amountMinorUnits,
            date: args.date,
            categoryIds,
            paidByMemberId: paidBy.memberId,
          });
        } else {
          // Re-parse the (already form-validated) amount to minor units (ADR 0009).
          const parsed = parseAmountToMinorUnits(value.amount);
          if (!parsed.ok) {
            throw new Error("amount failed to parse after validation");
          }
          // Resolve the selected Paid By to a current Member's id, keeping the existing
          // (possibly Removed) Paid By as a no-op; a pick that was removed mid-edit can't
          // resolve, so block rather than silently leave Paid By unchanged.
          const selected = value.paidByMemberId || selfMemberId;
          const paidBy = resolvePaidBy(selected, members ?? [], mode.transaction.paidBy.id);
          if (!paidBy.ok) {
            setSubmitError(STALE_PAID_BY_ERROR);
            return;
          }
          // Send every field the form owns; the server diffs against the stored
          // Transaction and records only what changed. `note` is sent always (""
          // clears it); `type` + the new Categories drive the Type Change path.
          await updateTransaction({
            transactionId: mode.transaction.id,
            type: value.type,
            title: value.title,
            note: value.note.trim(),
            amountMinorUnits: parsed.minorUnits,
            date: value.date,
            categoryIds,
            ...(paidBy.memberId ? { paidByMemberId: paidBy.memberId } : {}),
          });
        }
        onClose();
      } catch (error) {
        // Known rejections are already mirrored by the schema, so anything reaching
        // here is unexpected — surface it (Sentry once it lands, ADR 0012) rather than
        // swallow it, and show the user a generic retry message.
        console.error("saveTransaction failed", error);
        setSubmitError("Couldn't save the transaction. Please try again.");
      }
    },
  });

  // Request a Type Change: in edit mode, switching the segment is destructive (it
  // clears categories), so it goes through a confirmation first.
  const requestType = (next: TransactionType) => {
    if (next === activeType) {
      return;
    }
    setPendingType(next);
  };
  const confirmTypeChange = () => {
    if (!pendingType) {
      return;
    }
    setActiveType(pendingType);
    form.setFieldValue("type", pendingType);
    form.setFieldValue("categoryIds", []); // Expense and Income Categories must not mix
    setPendingType(null);
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void form.handleSubmit();
      }}
      aria-label={isEdit ? "Edit transaction" : `Add ${TYPE_LABEL[activeType].toLowerCase()}`}
      className="space-y-4 rounded-lg border border-neutral-800 p-4"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          {isEdit ? "Edit transaction" : `Add ${TYPE_LABEL[activeType].toLowerCase()}`}
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-neutral-400 hover:text-neutral-100"
        >
          Cancel
        </button>
      </div>

      {/* Type is fixed for a create (the CTA chose it); an edit can switch it, which is
          a confirmed Type Change. */}
      {isEdit ? (
        <FieldSet>
          {/* The FieldSet + FieldLegend already group and label these controls. */}
          <FieldLegend>Type</FieldLegend>
          <div className="flex gap-2">
            {TRANSACTION_TYPES.map((option) => {
              const pressed = activeType === option;
              return (
                <button
                  key={option}
                  type="button"
                  aria-pressed={pressed}
                  onClick={() => requestType(option)}
                  className={cn(
                    "rounded-md border px-3 py-1 text-sm transition-colors",
                    pressed
                      ? "border-neutral-100 bg-neutral-100 text-neutral-900"
                      : "border-neutral-700 text-neutral-300 hover:text-neutral-100",
                  )}
                >
                  {TYPE_LABEL[option]}
                </button>
              );
            })}
          </div>
          {pendingType ? (
            <div
              role="alertdialog"
              aria-labelledby="txn-type-confirm-title"
              aria-describedby="txn-type-confirm-desc"
              className="space-y-2 rounded-md border border-amber-600/70 bg-amber-950/30 p-3"
            >
              <p id="txn-type-confirm-title" className="text-sm font-semibold text-amber-200">
                Change to {TYPE_LABEL[pendingType].toLowerCase()}?
              </p>
              <p id="txn-type-confirm-desc" className="text-sm text-amber-300/90">
                This clears the selected categories. You'll re-pick from{" "}
                {TYPE_LABEL[pendingType].toLowerCase()} categories before saving.
              </p>
              <div className="flex gap-2">
                <Button ref={confirmTypeRef} type="button" onClick={confirmTypeChange}>
                  Change type
                </Button>
                <Button type="button" variant="outline" onClick={() => setPendingType(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : null}
        </FieldSet>
      ) : null}

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
            // Selected Categories that are archived: kept VISIBLE (not silently dropped)
            // and deselectable. An already-attached one may STAY on an edit (PRD 57); a
            // newly-added archived one blocks submit until removed.
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
                  <p className="text-xs text-neutral-500">
                    No {activeType} categories yet. Create one first to record a {activeType}.
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
                    {archivedSelected.map((category) => {
                      const blocking = !alreadyAttached.has(category.id);
                      return (
                        <button
                          key={category.id}
                          type="button"
                          aria-pressed={true}
                          onClick={() => deselect(category.id)}
                          className="rounded-full border border-amber-600/70 bg-amber-950/40 px-3 py-1 text-sm text-amber-300 transition-colors hover:text-amber-100"
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
                {!isEdit && selfMemberId === "" ? <option value="">Loading…</option> : null}
                {paidByOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
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
            {isSubmitting
              ? "Saving…"
              : isEdit
                ? "Save changes"
                : `Add ${TYPE_LABEL[activeType].toLowerCase()}`}
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
 *
 * An Edit affordance shows only where the server marked the viewer as able to edit
 * (`canEditFields` — the Recorded By Member) and the Circle is writable; the server
 * re-checks on save, so this is the courtesy, not the enforcement (ADR 0015).
 */
function TransactionList({
  paginated,
  currency,
  monthLabel,
  canEdit,
  onEdit,
}: {
  paginated: PaginatedTransactions;
  currency: string;
  monthLabel: string;
  canEdit: boolean;
  onEdit: (transaction: Transaction) => void;
}) {
  const { transactions, status, loadMore } = paginated;

  if (status === "LoadingFirstPage") {
    return <p className="text-sm text-neutral-500">Loading transactions…</p>;
  }
  // An inaccessible Circle (ADR 0016) and a month with no active Transactions both
  // arrive as an empty page — the Circle guard already gated entry, so treat both as
  // nothing to show, naming the month so an empty view reads as "this month is empty"
  // rather than "this circle is empty".
  if (transactions.length === 0) {
    return <p className="text-sm text-neutral-500">No transactions in {monthLabel}.</p>;
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
            {canEdit && txn.canEditFields ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => onEdit(txn)}
                aria-label={`Edit ${txn.title}`}
              >
                Edit
              </Button>
            ) : null}
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
