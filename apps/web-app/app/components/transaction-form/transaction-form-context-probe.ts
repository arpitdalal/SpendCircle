import type { TransactionFormValues } from "@spend-circle/domain";

const defaultValues: TransactionFormValues = {
  type: "expense",
  title: "",
  amount: "",
  note: "",
  date: "2000-01-01",
  categoryIds: [],
  paidByMemberId: "",
};

/**
 * Type-only shape for `useTypedAppFormContext` (TanStack Form): narrows `useFormContext`
 * to `TransactionFormValues` inside `app.AppForm` without passing `form` through props.
 */
export const transactionFormContextProbe = { defaultValues };
