import { render } from "@testing-library/react";
import { createRoutesStub } from "react-router";
import { SnackbarProvider } from "~/lib/snackbar.js";

/**
 * The "stub + deferred loader" seam for driving the router's PENDING navigation state
 * in component tests (issue #121). The shared `MemoryRouter` render helpers always
 * report `navigation.state === "idle"` (no data router), so they cannot exercise the
 * shell skeleton's `useNavigation()`; `createRoutesStub` builds a real data router that
 * does. Encoded once here (CLAUDE.md) so layout tests state only their route tree.
 */

type StubRoutes = Parameters<typeof createRoutesStub>[0];

/**
 * A promise plus its resolver. Hand `promise` to a route's `loader` to hold that
 * navigation in `"loading"` for as long as the test wants, then call `resolve()` to
 * let the navigation settle — the controllable stand-in for a slow route-chunk download.
 */
export function deferred() {
  let resolve!: () => void;
  const promise = new Promise<null>((res) => {
    resolve = () => res(null);
  });
  return { promise, resolve };
}

/** Renders a `createRoutesStub` route tree under the app's `SnackbarProvider` (the
 * Circle guard's resolver needs it), seeding the address bar via `initialEntries`. */
export function renderRouteStub(routes: StubRoutes, initialEntries: string[]) {
  const Stub = createRoutesStub(routes);
  return render(
    <SnackbarProvider>
      <Stub initialEntries={initialEntries} />
    </SnackbarProvider>,
  );
}
