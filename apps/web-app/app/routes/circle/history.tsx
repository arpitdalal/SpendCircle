import { HistoryList } from "~/components/history-list.js";
import { useCircleHistory } from "~/lib/data.js";
import { useCircle } from "~/routes/layouts/circle-layout.js";

/**
 * Circle-scoped History page (issue #219) — the Circle-level audit (CS-4),
 * moved off the Member List into its own nav surface. Any current Member may
 * read it, for active and Archived Circles alike (read-only, no write gating).
 */
export default function CircleHistoryPage() {
  const circle = useCircle();
  const { events, status, loadMore } = useCircleHistory(circle.id);
  return (
    <div className="space-y-4">
      <HistoryList events={events} status={status} loadMore={loadMore} label="Circle history" />
    </div>
  );
}
