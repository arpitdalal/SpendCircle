/**
 * The viewer's presentation locale for money/number/date formatting.
 *
 * Money is formatted with an EXPLICIT locale everywhere (ADR 0021): an omitted
 * locale makes `Intl` fall back to the ambient runtime locale, which leaks the
 * server/terminal language into the UI and makes tests pass or fail by terminal
 * language. The browser's `navigator.language` is the viewer's locale; in a
 * non-browser context (SSR, render/unit tests) there is no viewer, so we fall
 * back to a fixed `en-US` rather than the ambient default — deterministic, and
 * never the process locale.
 */
export const VIEWER_LOCALE_FALLBACK = "en-US";

export function viewerLocale(): string {
  if (typeof navigator !== "undefined" && navigator.language) {
    return navigator.language;
  }
  return VIEWER_LOCALE_FALLBACK;
}
