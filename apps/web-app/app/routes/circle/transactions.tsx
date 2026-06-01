import { useCircle } from "~/routes/layouts/circle-layout.js";

/** Monthly Ledger / Transactions surface (PRD stories 62–67). Object-detail
 * routes (`transactions/:transactionRef`) attach here using the same staged
 * guard primitive as the Circle guard, resolving within this Circle. */
export default function CircleTransactions() {
  const circle = useCircle();
  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold">Transactions</h2>
      <p className="text-sm text-neutral-500">
        The Monthly Ledger and search for {circle.name} will appear here.
      </p>
    </div>
  );
}
