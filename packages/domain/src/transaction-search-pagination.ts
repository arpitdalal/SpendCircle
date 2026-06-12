/**
 * Transaction search (circle /search route) uses numbered pages in the URL (#97).
 * Convex caps how far we scan/count so reads stay bounded — keep these aligned with
 * `packages/convex/convex/search.ts`.
 */
export const TRANSACTION_SEARCH_MAX_PAGE = 40;

/** Default page size for search and ledger transaction lists (Convex + client). */
export const TRANSACTION_LIST_PAGE_SIZE = 25;
