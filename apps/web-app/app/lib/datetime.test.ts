import { describe, expect, it } from "vitest";
import { formatAuditTimestamp } from "./datetime.js";

/**
 * Audit / history timestamps render in a FIXED reference zone (UTC), never the viewer's
 * timezone (Audit Metadata glossary) — there is no stored offset to honor (epoch millis),
 * so the displayed wall-clock must not shift with the reader's location.
 */
describe("formatAuditTimestamp", () => {
  it("renders the stored instant in UTC, with the zone made explicit", () => {
    // 14:05 UTC on 2026-05-16. Pinned to UTC, so the wall-clock reads 02:05 PM regardless
    // of where the viewer (or the test runner) sits.
    const out = formatAuditTimestamp(Date.UTC(2026, 4, 16, 14, 5));
    expect(out).toContain("May 16, 2026");
    expect(out).toMatch(/02:05/);
    expect(out).toContain("UTC");
  });

  it("does not convert to local time — a UTC-midnight instant stays on the same calendar day", () => {
    // 00:00 UTC. If this were rendered in a behind-UTC local zone it would slip to the
    // previous calendar day; the fixed UTC zone keeps it on Jan 1.
    const out = formatAuditTimestamp(Date.UTC(2026, 0, 1, 0, 0));
    expect(out).toContain("Jan 1, 2026");
    expect(out).toMatch(/12:00\s?AM/);
    expect(out).toContain("UTC");
  });
});
