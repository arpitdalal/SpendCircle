/**
 * Centralized access to client environment. `MOCKS` couples MSW vendor mocking
 * and the dev auth bypass behind a single flag (ADR 0006). Reading it through
 * one module keeps the `import.meta.env.VITE_MOCKS` check in a single place so
 * the production build can dead-code-eliminate everything it guards.
 */
export const MOCKS = import.meta.env.VITE_MOCKS === "true";

/**
 * True-E2E mode (ADR 0019): the app runs against a REAL self-hosted Convex backend
 * with the real session path and real queries — NOT the `MOCKS` fixtures path. It
 * only enables the gated test-auth helper (so Playwright can establish a session
 * without Google). Build-time constant, so prod drops everything it guards.
 */
export const E2E = import.meta.env.VITE_E2E === "true";

export const CONVEX_URL = import.meta.env.VITE_CONVEX_URL;

/** Sentry DSN for client error monitoring (ADR 0012). Unset locally → init no-ops. */
export const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN;
