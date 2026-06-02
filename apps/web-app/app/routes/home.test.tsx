import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MOCK_CIRCLES } from "~/lib/fixtures.js";
import { configureConvex, renderWithRouter } from "~/test/convex-react.js";

/**
 * Fast render smoke (jsdom, no backend). The only thing doubled is Convex's reactive
 * client (`convex/react` — the network boundary, via the shared helper); the real
 * `useMyCircles` hook and the route run against it, so the route↔data-layer wiring
 * is exercised rather than mocked away. The full frontend↔backend path is covered by
 * the Playwright E2E suite against a self-hosted backend (ADR 0019) — left to CI.
 */
vi.mock("convex/react", async () => (await import("~/test/convex-react.js")).convexReactMock);

import Home from "./home.js";

afterEach(() => {
  vi.clearAllMocks();
});

describe("Home (render smoke)", () => {
  it("renders the user's circles once loaded", () => {
    configureConvex({ circles: MOCK_CIRCLES }); // the `listMyCircles` subscription resolved
    renderWithRouter(<Home />);
    expect(screen.getByRole("heading", { name: "Your circles" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Personal/ })).toBeInTheDocument();
  });

  it("shows the loading splash before circles resolve", () => {
    configureConvex({ circles: undefined }); // subscription still loading
    renderWithRouter(<Home />);
    expect(screen.getByText(/Loading your circles/)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Your circles" })).not.toBeInTheDocument();
  });
});
