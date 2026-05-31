import { StrictMode, startTransition } from "react";
import { hydrateRoot } from "react-dom/client";
import { HydratedRouter } from "react-router/dom";
import { startMocks } from "./lib/mocks.js";

// Start the MSW worker (mock mode only) before hydrating so the very first
// requests are intercepted; in production this resolves immediately and the
// dynamic import is eliminated (ADR 0006).
startMocks().then(() => {
  startTransition(() => {
    hydrateRoot(
      document,
      <StrictMode>
        <HydratedRouter />
      </StrictMode>,
    );
  });
});
