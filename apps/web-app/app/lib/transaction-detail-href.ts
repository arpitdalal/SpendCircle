import type { PlainMonth } from "@spend-circle/domain";
import type { Circle, Transaction } from "~/lib/data.js";
import { ledgerSearch, withQuery } from "~/lib/ledger-url.js";

/** Detail path for a Transaction; optional `ledgerMonth` preserves the Monthly Ledger slice (ADR 0017). */
export function transactionDetailHref(circle: Circle, txn: Transaction, ledgerMonth?: PlainMonth) {
  const base = `/circles/${circle.ref}/transactions/${txn.ref}`;
  return ledgerMonth ? withQuery(base, ledgerSearch({ month: ledgerMonth })) : base;
}
