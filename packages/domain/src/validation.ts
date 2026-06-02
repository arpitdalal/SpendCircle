import { z } from "zod";
import { isValidColorId } from "./color.js";
import { isSupportedCurrency } from "./currency.js";
import { isValidPlainDate } from "./date.js";
import { type AmountParseError, isValidMinorUnits, parseAmountToMinorUnits } from "./money.js";

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
 * Transaction input as entered in the form: amount is a major-unit string and is
 * transformed to positive integer minor units. Categories are de-duplicated and
 * required to have at least one entry (PRD stories 50–52).
 */
export const transactionInputSchema = z
  .object({
    ...transactionFields,
    amount: z.string(),
    paidByMemberId: z.string(),
  })
  .transform((value, ctx) => {
    const parsed = parseAmountToMinorUnits(value.amount);
    if (!parsed.ok) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["amount"],
        message: amountErrorMessage(parsed.error),
      });
      return z.NEVER;
    }
    return { ...value, amountMinorUnits: parsed.minorUnits };
  });
export type TransactionInput = z.infer<typeof transactionInputSchema>;

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
