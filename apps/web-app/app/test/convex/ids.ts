/**
 * Mints a synthetic branded Convex Id for fixtures. The brand (`Id<"...">`) is a
 * nominal string with no runtime constructor, and jsdom tests have no backend to
 * issue real ones — so this single, documented assertion is the one sanctioned
 * cast; every call site stays cast-free. The return type is inferred as `Brand`.
 *
 * The `as` below is intentional and fine: Convex ids are compile-time-only brands
 * on `string`, so there is no type-safe minting path; centralizing it here matches
 * AGENTS.md (avoid scattered casts, one documented boundary).
 */
export const testId = <Brand extends string>(value: string) => value as Brand;
