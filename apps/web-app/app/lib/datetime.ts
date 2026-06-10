import type { PlainMonth } from "@spend-circle/domain";
import { viewerLocale } from "./locale.js";

/**
 * "YYYY-MM" months are plain calendar buckets with no timezone (domain/date.ts), so
 * they are labelled by formatting their first day pinned to UTC — a local-zone Date
 * would let a negative offset slide the label into the previous month. The viewer
 * locale drives the month name's language (ADR 0021: explicit locale, never ambient).
 */
function monthFormatter(options: Intl.DateTimeFormatOptions) {
  return (month: PlainMonth) => {
    const [year, monthIndex] = month.split("-").map(Number) as [number, number];
    return new Intl.DateTimeFormat(viewerLocale(), { timeZone: "UTC", ...options }).format(
      new Date(Date.UTC(year, monthIndex - 1, 1)),
    );
  };
}

/** Full month label, e.g. "June 2026" — list headings, table rows, tooltips. */
export const formatMonthLabel = monthFormatter({ month: "long", year: "numeric" });

/** Compact month label, e.g. "Jun" — chart axis ticks where space is tight. */
export const formatMonthTick = monthFormatter({ month: "short" });

/**
 * Formats an Audit Metadata / Transaction History timestamp (TXN-4).
 *
 * Audit timestamps are stored as epoch millis — an absolute instant with NO captured
 * offset (domain/date.ts: operational timestamps are epoch millis). The Audit Metadata
 * glossary requires they display with their stored offset and explicitly NOT converted
 * to the viewer's timezone. With no offset stored, the faithful behavior is to render in
 * a single FIXED reference zone (UTC) for every viewer, so the displayed wall-clock never
 * shifts with the reader's location — the `timeZone: "UTC"` below pins it, and the
 * `timeZoneName` makes the zone explicit so the value is never mistaken for local time.
 *
 * (A true per-write offset would need a schema change to capture it at write time, which
 * is out of scope for this read-only detail slice and would require an ADR to reshape the
 * audited tables — see the PR notes. Until then UTC is the honest, deterministic choice.)
 *
 * The viewer LOCALE still applies — it only governs language/format of the parts (month
 * name, digit grouping), never the zone — mirroring the explicit-locale rule money
 * formatting follows (ADR 0021); a non-browser context falls back to a fixed locale.
 */
export function formatAuditTimestamp(epochMillis: number): string {
  return new Intl.DateTimeFormat(viewerLocale(), {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(epochMillis));
}
