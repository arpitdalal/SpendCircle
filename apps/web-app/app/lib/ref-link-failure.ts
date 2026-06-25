import { reportAppError } from "./report-error.js";
import type { UnavailableTarget } from "./snackbar.js";

/**
 * Shared deep-link ref failure handling (ADR 0016 / #237). Object-route guards
 * (`useResolvedRef`) and in-list highlight hooks (`useCategoryRefHighlight`)
 * differ in navigation and highlight UX, but both must report unparseable refs
 * and fire the same closed-vocabulary unavailable snackbar on missing targets.
 */
export function handleUnparseableRefLink(args: {
  rawRef: string;
  reportMessage: string;
  showUnavailable: (target: UnavailableTarget) => void;
  unavailableTarget?: UnavailableTarget;
  /** When true, also fires the unavailable snackbar (object guards). */
  alsoShowUnavailable?: boolean;
  onConsumed: () => void;
}) {
  reportAppError(args.reportMessage, { rawRef: args.rawRef });
  if (args.alsoShowUnavailable) {
    args.showUnavailable(args.unavailableTarget ?? "link");
  }
  args.onConsumed();
}

export function handleUnavailableRefLink(args: {
  showUnavailable: (target: UnavailableTarget) => void;
  unavailableTarget?: UnavailableTarget;
  onConsumed: () => void;
}) {
  args.showUnavailable(args.unavailableTarget ?? "link");
  args.onConsumed();
}
