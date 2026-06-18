import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LoadingStatus, PageSkeleton, RowsSkeleton, Skeleton, SkeletonRegion } from "./skeleton.js";

/**
 * Contract of the shared skeleton primitives (issue #121): a polite busy region that
 * announces ONCE with a screen-reader label, while the placeholder blocks themselves
 * stay hidden from assistive tech (the visual SHAPE is the only cue).
 */
describe("skeleton primitives", () => {
  it("Skeleton is a presentational, aria-hidden pulse block", () => {
    const { container } = render(<Skeleton className="h-4 w-10" />);
    const block = container.firstElementChild;
    expect(block).toHaveAttribute("aria-hidden", "true");
    expect(block).toHaveClass("animate-pulse-soft");
  });

  it("SkeletonRegion announces a labelled busy status with an addressable testid", () => {
    render(
      <SkeletonRegion label="Loading widgets…" testId="widgets-skeleton">
        <Skeleton className="h-4 w-10" />
      </SkeletonRegion>,
    );
    const region = screen.getByTestId("widgets-skeleton");
    expect(region).toHaveRole("status");
    expect(region).toHaveAttribute("aria-busy", "true");
    expect(within(region).getByText("Loading widgets…")).toBeInTheDocument();
  });

  it("RowsSkeleton renders the requested number of placeholder rows", () => {
    render(<RowsSkeleton rows={3} />);
    // One addressable card-row per requested row (testid, not DOM structure).
    expect(screen.getAllByTestId("skeleton-row")).toHaveLength(3);
  });

  it("LoadingStatus announces once while loading and disappears when done", () => {
    const { rerender } = render(<LoadingStatus loading label="Loading dashboard…" />);
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Loading dashboard…");

    rerender(<LoadingStatus loading={false} label="Loading dashboard…" />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("PageSkeleton is the generic Phase-1 content region", () => {
    render(<PageSkeleton />);
    const region = screen.getByTestId("route-skeleton");
    expect(region).toHaveRole("status");
    expect(region).toHaveAttribute("aria-busy", "true");
  });
});
