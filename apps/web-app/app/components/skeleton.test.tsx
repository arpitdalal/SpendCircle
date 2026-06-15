import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PageSkeleton, RowsSkeleton, Skeleton, SkeletonRegion } from "./skeleton.js";

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
    expect(region).toHaveAttribute("role", "status");
    expect(region).toHaveAttribute("aria-busy", "true");
    expect(within(region).getByText("Loading widgets…")).toBeInTheDocument();
  });

  it("RowsSkeleton renders the requested number of placeholder rows", () => {
    const { container } = render(<RowsSkeleton rows={3} />);
    // One card-row wrapper per requested row.
    expect(container.querySelectorAll(":scope > div > div")).toHaveLength(3);
  });

  it("PageSkeleton is the generic Phase-1 content region", () => {
    render(<PageSkeleton />);
    const region = screen.getByTestId("route-skeleton");
    expect(region).toHaveAttribute("role", "status");
    expect(region).toHaveAttribute("aria-busy", "true");
  });
});
