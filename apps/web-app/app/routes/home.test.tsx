import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { MOCK_CIRCLES } from "~/lib/fixtures.js";

/**
 * Fast render smoke (jsdom, no backend, no Convex/auth providers). This is the
 * dev inner-loop sanity check: does the shell render given data? The real
 * frontend↔backend path is covered by the Playwright E2E suite against a
 * self-hosted backend (ADR 0019) — left to CI, not run on every save.
 *
 * `useMyCircles` is mocked so the route renders deterministically without a live
 * query; the hook itself (the MOCKS fork) is exercised elsewhere.
 */
vi.mock("~/lib/data.js", () => ({ useMyCircles: vi.fn() }));
import { useMyCircles } from "~/lib/data.js";
import Home from "./home.js";

const mockUseMyCircles = vi.mocked(useMyCircles);

function renderHome() {
  return render(
    <MemoryRouter>
      <Home />
    </MemoryRouter>,
  );
}

describe("Home (render smoke)", () => {
  it("renders the user's circles once loaded", () => {
    mockUseMyCircles.mockReturnValue(MOCK_CIRCLES);
    renderHome();
    expect(screen.getByRole("heading", { name: "Your circles" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Personal/ })).toBeInTheDocument();
  });

  it("shows the loading splash before circles resolve", () => {
    mockUseMyCircles.mockReturnValue(undefined);
    renderHome();
    expect(screen.getByText(/Loading your circles/)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Your circles" })).not.toBeInTheDocument();
  });
});
