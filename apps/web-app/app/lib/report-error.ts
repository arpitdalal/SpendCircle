import * as Sentry from "@sentry/react";

/**
 * The single seam for reporting an application-level problem — something the app
 * itself got wrong and should fix, as distinct from an expected user or
 * permission outcome. Forwards to Sentry (ADR 0012); dev still warns locally.
 *
 * A missing or inaccessible target is NOT an app error and must never be reported
 * (it would be noise, and the anti-enumeration stance treats it as a normal
 * outcome — ADR 0016). Reserve this for things the app emitted wrong, such as an
 * unparseable in-app link. Never attach financial content (titles, notes, amounts)
 * to `context` — replays are masked but extras are not scrubbed automatically.
 */
export function reportAppError(message: string, context?: Record<string, unknown>): void {
  if (import.meta.env.DEV) {
    console.warn(`[app] ${message}`, context ?? {});
  }
  Sentry.captureMessage(message, { extra: context });
}
