/**
 * Centralized access to client environment. `MOCKS` couples MSW vendor mocking
 * and the dev auth bypass behind a single flag (ADR 0006). Reading it through
 * one module keeps the `import.meta.env.VITE_MOCKS` check in a single place so
 * the production build can dead-code-eliminate everything it guards.
 */
export const MOCKS = import.meta.env.VITE_MOCKS === "true";

export const CONVEX_URL = import.meta.env.VITE_CONVEX_URL;
