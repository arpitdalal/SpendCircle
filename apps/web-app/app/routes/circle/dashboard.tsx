import { useCircle } from "~/routes/layouts/circle-layout.js";

/** Per-Circle Dashboard surface (PRD stories 68–75). Charts and totals are
 * layered on here; the scaffold confirms the Circle is in scope. */
export default function CircleDashboard() {
  const circle = useCircle();
  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold">Dashboard</h2>
      <p className="text-sm text-neutral-500">
        Totals, charts, and recent activity for {circle.name} will appear here.
      </p>
    </div>
  );
}
