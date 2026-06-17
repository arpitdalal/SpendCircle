import { ConvexError } from "convex/values";

/**
 * Convex redacts plain server errors to a generic "Server Error" in production; only
 * ConvexError data reaches the client. So: echo allowlisted ConvexError string data
 * verbatim (e.g. assertWritable's "Circle is archived" in packages/convex/convex/guard.ts);
 * map everything else — including plain Errors, whose .message is dev-only — to the
 * caller's fallback.
 */
const VERBATIM_MUTATION_ERRORS = new Set([
  "Circle is archived",
  "A category with this name already exists for this type",
]);

export function mutationErrorMessageForUser(error: unknown, fallback: string) {
  if (
    error instanceof ConvexError &&
    typeof error.data === "string" &&
    VERBATIM_MUTATION_ERRORS.has(error.data)
  ) {
    return error.data;
  }
  return fallback;
}
