/**
 * The single seam for reporting an application-level problem — something the app
 * itself got wrong and should fix, as distinct from an expected user or
 * permission outcome. Today it logs at warning level; Sentry wiring lands here
 * (ADR 0012) without touching any call site.
 *
 * A missing or inaccessible target is NOT an app error and must never be reported
 * (it would be noise, and the anti-enumeration stance treats it as a normal
 * outcome — ADR 0016). Reserve this for things the app emitted wrong, such as an
 * unparseable in-app link.
 */
export function reportAppError(message: string, context?: Record<string, unknown>): void {
  console.warn(`[app] ${message}`, context ?? {});
}
