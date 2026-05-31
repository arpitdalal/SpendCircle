import { useCircle } from "~/routes/layouts/circle-layout.js";

/** Circle-scoped Categories surface (PRD stories 47–61). */
export default function CircleCategories() {
  const circle = useCircle();
  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold">Categories</h2>
      <p className="text-sm text-neutral-500">
        Expense and Income categories for {circle.name} will appear here.
      </p>
    </div>
  );
}
