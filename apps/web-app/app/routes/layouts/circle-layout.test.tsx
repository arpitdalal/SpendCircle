import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SKELETON_DELAY_MS } from "~/lib/route-skeleton.js";
import { configureConvex, makeCircleView } from "~/test/convex-react.js";
import { installIntersectionObserverStub } from "~/test/intersection-observer-stub.js";
import { deferred, renderRouteStub } from "~/test/router-stub.js";

/**
 * Phase-1 shell-skeleton behavior for the Circle layout (issue #121). Drives the REAL
 * layout through a `createRoutesStub` data router so its `useNavigation()` reflects a
 * genuine pending navigation (the shared `MemoryRouter` helpers can't — they're always
 * idle). Only `convex/react` is doubled; the real `useResolvedCircle` resolves the
 * Circle from the modeled `getCircle`, then the real `usePendingRouteSkeleton` drives
 * the swap. Child routes are thin stand-ins — the layout's swap, not their content, is
 * under test. A deferred `loader` holds the destination in `"loading"` to stand in for
 * a slow route-chunk download (ADR 0006: drive the real seams, don't mock them).
 */
vi.mock("convex/react", async () => (await import("~/test/convex-react.js")).convexReactMock);

import CircleLayout from "./circle-layout.js";

// biome-ignore lint/suspicious/noExplicitAny: thin route-tree stand-ins; the layout is the unit under test.
function routesWith(transactionsLoader: () => any) {
  return [
    {
      path: "/circles/:circleRef",
      Component: CircleLayout,
      children: [
        { index: true, Component: () => <h2>Dashboard stub</h2> },
        {
          path: "transactions",
          Component: () => <h2>Transactions stub</h2>,
          loader: transactionsLoader,
        },
      ],
    },
  ];
}

function tabs() {
  return within(screen.getByRole("navigation", { name: "Circle tabs" }));
}

installIntersectionObserverStub();

afterEach(() => {
  vi.clearAllMocks();
});

describe("CircleLayout shell skeleton", () => {
  it("shows the generic skeleton while a slow tab navigation loads, keeping the chrome", async () => {
    const slow = deferred();
    configureConvex({ circle: makeCircleView() });
    renderRouteStub(
      routesWith(() => slow.promise),
      ["/circles/trip-c1"],
    );

    expect(await screen.findByText("Dashboard stub")).toBeInTheDocument();

    await userEvent.click(tabs().getByRole("link", { name: "Transactions" }));

    // The shell skeleton replaces the Outlet content once the delay elapses; the
    // Circle chrome (tabs) stays mounted — instant-navigation feel, no layout shift.
    expect(await screen.findByTestId("route-skeleton")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Circle tabs" })).toBeInTheDocument();
    expect(screen.queryByText("Dashboard stub")).not.toBeInTheDocument();

    // Settling the navigation swaps the destination in and clears the skeleton.
    slow.resolve();
    expect(await screen.findByText("Transactions stub")).toBeInTheDocument();
    expect(screen.queryByTestId("route-skeleton")).not.toBeInTheDocument();
  });

  it("does not flash a skeleton for a fast navigation (flicker guard)", async () => {
    configureConvex({ circle: makeCircleView() });
    // The loader resolves immediately, so the navigation settles well within the
    // ~120ms show-delay and the skeleton must never appear.
    renderRouteStub(
      routesWith(() => null),
      ["/circles/trip-c1"],
    );

    expect(await screen.findByText("Dashboard stub")).toBeInTheDocument();
    await userEvent.click(tabs().getByRole("link", { name: "Transactions" }));

    expect(await screen.findByText("Transactions stub")).toBeInTheDocument();
    expect(screen.queryByTestId("route-skeleton")).not.toBeInTheDocument();

    // Even past the delay window, no late skeleton appears (the timer was cleared).
    await new Promise((resolve) => setTimeout(resolve, SKELETON_DELAY_MS + 40));
    expect(screen.queryByTestId("route-skeleton")).not.toBeInTheDocument();
  });

  it("waits past the flicker delay before showing the skeleton (no immediate flash)", async () => {
    const slow = deferred();
    configureConvex({ circle: makeCircleView() });
    renderRouteStub(
      routesWith(() => slow.promise),
      ["/circles/trip-c1"],
    );

    await screen.findByText("Dashboard stub");
    await userEvent.click(tabs().getByRole("link", { name: "Transactions" }));

    // Immediately after the click the navigation is loading, but the skeleton is held
    // back by the show-delay — so it is NOT in the DOM yet.
    expect(screen.queryByTestId("route-skeleton")).not.toBeInTheDocument();
    // Then it appears once the delay elapses.
    await waitFor(() => expect(screen.getByTestId("route-skeleton")).toBeInTheDocument());

    slow.resolve();
  });
});
