/**
 * Convex mutations sometimes reject with a stable, user-meaningful `Error.message`
 * (e.g. `assertWritable` in `packages/convex/convex/guard.ts`). Echo those verbatim;
 * everything else maps to a caller-provided fallback so transient/internal text is not
 * shown (see transaction-form tests for "Network down").
 */
const VERBATIM_MUTATION_MESSAGES = new Set(["Circle is archived"]);

export function mutationErrorMessageForUser(error: unknown, fallback: string) {
  if (error instanceof Error && error.message && VERBATIM_MUTATION_MESSAGES.has(error.message)) {
    return error.message;
  }
  return fallback;
}
