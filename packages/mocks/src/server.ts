import { setupServer } from "msw/node";
import { handlers } from "./handlers.js";

/**
 * Node request-interception server for Vitest. Enabled unconditionally in the
 * Vitest setup so unit/integration tests never reach real vendors (ADR 0006).
 */
export const server = setupServer(...handlers);
