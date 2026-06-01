/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CONVEX_URL: string;
  readonly VITE_CONVEX_SITE_URL: string;
  /** When "true", enables mock mode: MSW vendor mocking + dev auth bypass. */
  readonly VITE_MOCKS?: string;
  /** When "true", true-E2E mode: real backend + real session + gated test-auth helper (ADR 0019). */
  readonly VITE_E2E?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
