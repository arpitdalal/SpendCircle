import type { TransactionType } from "@spend-circle/domain";

export const TYPE_LABEL: Record<TransactionType, string> = {
  expense: "Expense",
  income: "Income",
};
