import { z } from "zod";
import { isValidColorId } from "./color.js";
import { isSupportedCurrency } from "./currency.js";
import { isValidPlainDate } from "./date.js";
import { type AmountParseError, isValidMinorUnits, parseAmountToMinorUnits } from "./money.js";
import { circleSetupAnswersSchema } from "./setup.js";

/**
 * Shared form-facing validation. These Zod schemas (ADR 0010) are reused by the
 * web app and any future client. Convex functions still re-validate inputs at
 * the backend boundary with Convex validators — these never replace server-side
 * enforcement (ADR 0015).
 */
export const TRANSACTION_TYPES = ["expense", "income"] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const LIMITS = {
  circleNameMax: 60,
  categoryNameMax: 40,
  transactionTitleMax: 120,
  transactionNoteMax: 1_000,
  maxCategoriesPerTransaction: 10,
} as const;

const colorId = z.string().refine(isValidColorId, { message: "Unsupported color" });

/** Server-facing profile edit input (USR-1). */
export const profileUpdateSchema = z.object({
  displayName: z.string().trim().min(1, "Name is required").max(LIMITS.circleNameMax),
});
export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;

export type ProfileUpdateParseResult =
  | { ok: true; value: ProfileUpdateInput }
  | { ok: false; error: string };

/** Shared profile-edit parse contract for client forms and Convex mutations (USR-1). */
export function parseProfileUpdate(input: { displayName: string }): ProfileUpdateParseResult {
  const parsed = profileUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid display name",
    };
  }
  return { ok: true, value: parsed.data };
}

export const circleInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(LIMITS.circleNameMax),
  currency: z.string().refine(isSupportedCurrency, { message: "Unsupported currency" }),
  color: colorId,
  mark: z.string().trim().min(1).max(2),
});
export type CircleInput = z.infer<typeof circleInputSchema>;

export const categoryInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(LIMITS.categoryNameMax),
  type: z.enum(TRANSACTION_TYPES),
  color: colorId,
});
export type CategoryInput = z.infer<typeof categoryInputSchema>;

/**
 * Server-facing edit-Category input (ADR 0010), the CAT-2 counterpart to
 * {@link categoryInputSchema}. Both fields are optional: an absent field means
 * "leave it unchanged", and each present field is validated by the SAME rule as on
 * create so the two entry points can't drift. `type` is deliberately absent — a
 * Category's type is immutable (Expense and Income Categories never convert; a
 * Transaction Type Change clears Categories instead).
 */
export const categoryUpdateSchema = z.object({
  name: categoryInputSchema.shape.name.optional(),
  color: colorId.optional(),
});
export type CategoryUpdateInput = z.infer<typeof categoryUpdateSchema>;

/**
 * Server-facing Circle Settings input (CS-2), parallel to {@link categoryUpdateSchema}.
 * Both fields are optional: an absent field means "leave it unchanged", and each present
 * field is validated by the same rule as on create/setup so the entry points can't drift.
 */
export const circleSettingsUpdateSchema = z.object({
  color: colorId.optional(),
  setupAnswers: circleSetupAnswersSchema.optional(),
});
export type CircleSettingsUpdateInput = z.infer<typeof circleSettingsUpdateSchema>;

/**
 * The Transaction fields shared by the form schema and the server-facing create
 * schema. Factoring them here keeps the two entry points (form: amount as a
 * string; backend: amount already parsed to minor units) from drifting on title
 * length, note bounds, the type enum, the date format, or the ≥1 / no-duplicate
 * Category rule (PRD stories 50–52).
 */
const transactionFields = {
  type: z.enum(TRANSACTION_TYPES),
  title: z.string().trim().min(1, "Title is required").max(LIMITS.transactionTitleMax),
  note: z.string().trim().max(LIMITS.transactionNoteMax).optional(),
  date: z.string().refine(isValidPlainDate, { message: "Invalid date" }),
  categoryIds: z
    .array(z.string())
    .min(1, "Pick at least one category")
    .max(LIMITS.maxCategoriesPerTransaction)
    .refine((ids) => new Set(ids).size === ids.length, {
      message: "Duplicate categories are not allowed",
    }),
} as const;

/**
 * The amount field as entered in the form: a major-unit string that must parse to
 * positive integer minor units. Kept as its own schema (no transform) so the form
 * can validate it per-field on blur and surface the precise failure (empty vs zero
 * vs over-precision) on the `amount` path — see {@link transactionFieldSchemas}.
 * The major→minor conversion itself happens later, explicitly, in
 * {@link toMutationArgs}; validation and transformation stay separate seams (ADR 0020).
 */
const amountField = z.string().superRefine((value, ctx) => {
  const parsed = parseAmountToMinorUnits(value);
  if (!parsed.ok) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: amountErrorMessage(parsed.error) });
  }
});

/**
 * The note field as entered in the form: always a (possibly empty) string, since a
 * controlled textarea is never absent. Distinct from the entity's optional note
 * ({@link transactionFields}) so the form schema's shape matches the form's values
 * exactly — an empty note is dropped later by {@link toMutationArgs}, not modeled as
 * `undefined` here.
 */
const noteField = z.string().trim().max(LIMITS.transactionNoteMax);

/**
 * Transaction input as entered in the form — a PURE validation schema with no
 * transform (ADR 0020). It validates the shape the form binds to (amount as a
 * major-unit string, `paidByMemberId` as an opaque member id or "" for self); it
 * does not reshape into mutation args. Per-field slices ({@link transactionFieldSchemas})
 * drive on-blur validation, this whole schema is the submit-time gate, and
 * {@link toMutationArgs} performs the form→server transform separately.
 */
export const transactionFormSchema = z.object({
  ...transactionFields,
  note: noteField,
  amount: amountField,
  paidByMemberId: z.string(),
});
export type TransactionFormValues = z.infer<typeof transactionFormSchema>;

/**
 * Per-field validation slices, so the form (web today, native later) can validate
 * a single field on blur and feed the resulting Standard-Schema issues straight to
 * a `FieldError` without re-deriving rules. They are the same constraints
 * {@link transactionFormSchema} enforces at submit, never a drifting copy.
 */
export const transactionFieldSchemas = {
  title: transactionFields.title,
  amount: amountField,
  date: transactionFields.date,
  categoryIds: transactionFields.categoryIds,
  note: noteField,
} as const;

/**
 * Mutation args produced from validated form values. Generic over the caller's id
 * types so a branded `Id<"categories">` / `Id<"members">` flows through unchanged —
 * the web/native seam passes branded ids in and gets branded ids out, with no cast,
 * while this module stays free of any Convex import.
 */
export interface TransactionMutationArgs<CategoryId extends string, MemberId extends string> {
  type: TransactionType;
  title: string;
  note?: string;
  amountMinorUnits: number;
  date: string;
  categoryIds: CategoryId[];
  paidByMemberId?: MemberId;
}

/**
 * Transforms validated form values into create-Transaction mutation args (ADR 0020):
 * parses the major-unit amount to minor units, drops an empty note, and collapses a
 * Paid By that equals the caller's own Member to `undefined` so the server defaults
 * it to Recorded By (PRD story 36). Expects values that already passed
 * {@link transactionFormSchema}; it re-parses the amount defensively and throws on a
 * value that somehow didn't.
 */
export function toMutationArgs<CategoryId extends string, MemberId extends string>(
  values: {
    type: TransactionType;
    title: string;
    note?: string;
    amount: string;
    date: string;
    categoryIds: readonly CategoryId[];
    paidByMemberId: MemberId | "";
  },
  selfMemberId: MemberId | "",
): TransactionMutationArgs<CategoryId, MemberId> {
  const parsed = parseAmountToMinorUnits(values.amount);
  if (!parsed.ok) {
    throw new Error(amountErrorMessage(parsed.error));
  }

  const trimmedNote = values.note?.trim();
  const note = trimmedNote && trimmedNote.length > 0 ? trimmedNote : undefined;

  // "" means the form never picked anyone, so fall back to self; then omit a Paid By
  // that is self so the server applies its own default rather than us pinning it.
  const effective = values.paidByMemberId || selfMemberId;
  const paidByMemberId = effective && effective !== selfMemberId ? effective : undefined;

  return {
    type: values.type,
    title: values.title,
    ...(note ? { note } : {}),
    amountMinorUnits: parsed.minorUnits,
    date: values.date,
    categoryIds: [...values.categoryIds],
    ...(paidByMemberId ? { paidByMemberId } : {}),
  };
}

/**
 * Server-facing create-Transaction input (ADR 0010). The amount has already been
 * parsed to positive integer minor units at the client boundary, so this schema
 * re-asserts it is a valid minor-unit integer (`isValidMinorUnits`) rather than
 * re-parsing a string; `paidByMemberId` is optional because the handler defaults
 * it to the Recorded By Member. Convex re-validates id/shape at its own boundary
 * (ADR 0015); this enforces the cross-field invariants Convex validators can't.
 */
export const transactionCreateSchema = z.object({
  ...transactionFields,
  amountMinorUnits: z
    .number()
    .refine(isValidMinorUnits, { message: "Amount must be a positive value within range" }),
  paidByMemberId: z.string().optional(),
});
export type TransactionCreateInput = z.infer<typeof transactionCreateSchema>;

/**
 * Server-facing edit-Transaction input (ADR 0010), the TXN-2 counterpart to
 * {@link transactionCreateSchema}. Every field is optional: an absent field means
 * "leave it unchanged", and each present field is validated by the SAME rule as on
 * create (title/note bounds, the date format, the ≥1 / no-duplicate Category rule,
 * the minor-unit amount) so the two entry points can't drift. A present `note` of
 * `""` is the explicit "clear the note" signal — distinct from omitting it.
 *
 * Two cross-field invariants this schema deliberately does NOT encode, because they
 * need state it can't see and so live in the handler (ADR 0015): that a Transaction
 * Type Change must arrive WITH ≥1 active Category of the new type (the schema has no
 * current type to compare against), and that a newly-added Category must be active
 * while an already-attached archived one may stay (the schema has no current
 * attachments). Both are enforced server-side against the loaded Transaction.
 */
export const transactionUpdateSchema = z.object({
  type: z.enum(TRANSACTION_TYPES).optional(),
  title: transactionFields.title.optional(),
  note: transactionFields.note,
  date: transactionFields.date.optional(),
  amountMinorUnits: z
    .number()
    .refine(isValidMinorUnits, { message: "Amount must be a positive value within range" })
    .optional(),
  categoryIds: transactionFields.categoryIds.optional(),
  paidByMemberId: z.string().optional(),
});
export type TransactionUpdateInput = z.infer<typeof transactionUpdateSchema>;

function amountErrorMessage(error: AmountParseError): string {
  switch (error) {
    case "empty":
      return "Amount is required";
    case "not-a-number":
      return "Amount must be a number";
    case "negative":
      return "Amount must be positive";
    case "zero":
      return "Amount must be greater than zero";
    case "too-many-decimals":
      return "Amount supports at most two decimals";
    case "too-large":
      return "Amount is too large";
    default:
      return "Invalid amount";
  }
}
