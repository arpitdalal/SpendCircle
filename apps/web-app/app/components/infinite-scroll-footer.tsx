import type { RefObject } from "react";
import type { PaginationStatus } from "~/lib/data.js";
import { cn } from "~/lib/utils.js";

/**
 * Persistent `role="status"` live region plus optional infinite-scroll sentinel.
 * The region stays mounted with content toggling (`Loading…` ↔ nbsp) and `sr-only` when idle
 * so screen readers reliably announce pagination — mounting the region only while `LoadingMore`
 * makes announcements easy to miss (PR #111 / issue #98).
 */
export function InfiniteScrollFooter({
  status,
  loadingCopy,
  listAriaLabel,
  sentinelTestId,
  sentinelRef,
}: {
  status: PaginationStatus;
  loadingCopy: string;
  listAriaLabel: string;
  sentinelTestId: string;
  sentinelRef: RefObject<HTMLDivElement | null>;
}) {
  return (
    <>
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        aria-label={listAriaLabel}
        className={cn(
          status === "LoadingMore"
            ? "text-sm text-muted-foreground"
            : "sr-only pointer-events-none",
        )}
      >
        {status === "LoadingMore" ? loadingCopy : "\u00a0"}
      </div>
      {status === "CanLoadMore" ? (
        <div
          ref={sentinelRef}
          data-testid={sentinelTestId}
          aria-hidden
          className="h-2 w-full shrink-0"
        />
      ) : null}
    </>
  );
}
