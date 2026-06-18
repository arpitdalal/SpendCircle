import type { ReactNode } from "react";
import { cn } from "~/lib/utils.js";

/**
 * Loading-skeleton primitives (issue #121). One shared, always-loaded module so the
 * Phase-1 shell skeleton (rendered by a layout while the destination route CHUNK is
 * still downloading) never depends on the very module that is downloading. The
 * detailed per-route skeletons (Phase 2) compose these same primitives from inside
 * their route module, once it has mounted.
 *
 * Placeholders pulse via the `animate-pulse-soft` keyframe; the global
 * prefers-reduced-motion rule (app.css) freezes that to a static muted block, so the
 * placeholder SHAPE carries the cue with no motion needed.
 */

/** A single placeholder block. Purely presentational (`aria-hidden`); the announce
 * comes from the enclosing {@link SkeletonRegion}. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn("block animate-pulse-soft rounded-md bg-muted", className)} />
  );
}

/** Wraps skeleton visuals in a polite busy region with a screen-reader label, so a
 * loading surface announces ONCE while the placeholder shapes carry the visual cue.
 * `testId` lets behavior tests target the region without matching on copy. */
export function SkeletonRegion({
  label,
  testId,
  className,
  children,
}: {
  label: string;
  testId?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    // react-doctor-disable-next-line react-doctor/prefer-tag-over-role -- status live region wraps block skeleton content (RowsSkeleton/StatCardsSkeleton render <div> trees); <output> is the only native tag with implicit role="status" but it's phrasing-content only, so it can't wrap this flow content
    <div role="status" aria-busy="true" data-testid={testId} className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

/**
 * A single page-level busy announcement for a surface composed of SEVERAL
 * independently-loading widgets (e.g. the Dashboard: totals + comparison + recent).
 * Each widget keeps a presentational placeholder ({@link Skeleton}/{@link RowsSkeleton},
 * `aria-hidden`), and this one polite region announces the label ONCE while any of them
 * is still resolving — so a screen reader hears "Loading…" a single time instead of one
 * message per widget. Rendered only while `loading` so it is ADDED to the DOM when the
 * load begins (the reliable cue for live-region announcement) and removed when it ends.
 */
export function LoadingStatus({ loading, label }: { loading: boolean; label: string }) {
  if (!loading) {
    return null;
  }
  return <output className="sr-only">{label}</output>;
}

/** Three stat-card placeholders shaped like the totals grid the Dashboard and the
 * ledger's Monthly totals render. Presentational — wrap in a {@link SkeletonRegion}
 * (or let the live amounts announce) at the call site. */
function StatCardsSkeleton() {
  return (
    <div className="grid grid-cols-3 gap-3">
      {[0, 1, 2].map((index) => (
        <div key={index} className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="mt-2 h-6 w-20" />
        </div>
      ))}
    </div>
  );
}

/** A list of card-row placeholders matching the app's standard list row: a title +
 * subtitle on the left and a trailing value. Shared by every list surface
 * (transactions, search, categories, members, recent activity). */
export function RowsSkeleton({ rows = 4 }: { rows?: number }) {
  // Stable keys for static, never-reordered placeholders (avoids an array-index key).
  const keys = Array.from({ length: rows }, (_, index) => `skeleton-row-${index}`);
  return (
    <div className="space-y-2">
      {keys.map((key) => (
        <div
          key={key}
          data-testid="skeleton-row"
          className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 shadow-sm"
        >
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-3 w-3/5" />
          </div>
          <Skeleton className="h-4 w-14" />
        </div>
      ))}
    </div>
  );
}

/**
 * Generic, coarse content skeleton for the route-chunk download window (Phase 1),
 * rendered from a layout into the `<Outlet/>` slot. Kept deliberately coarse (a
 * heading, the totals grid, a few rows) so it reads as "a page is coming" across
 * every destination and resists drifting from any one real page.
 */
export function PageSkeleton() {
  return (
    <SkeletonRegion label="Loading page…" testId="route-skeleton" className="space-y-6">
      <Skeleton className="h-7 w-40" />
      <StatCardsSkeleton />
      <RowsSkeleton rows={5} />
    </SkeletonRegion>
  );
}
