import { describe, expect, it } from "vitest";
import { coversCircleNavigation, coversShellNavigation, isCircleRoute } from "./route-skeleton.js";

/**
 * The route-tree partition the two shell layouts split on (issue #121). These pure
 * predicates decide which layout owns a given navigation's skeleton; the layout
 * integration tests then exercise the debounce + swap on top of them.
 */
describe("isCircleRoute", () => {
  it("matches Circle-scoped routes", () => {
    expect(isCircleRoute("/circles/trip-c1")).toBe(true);
    expect(isCircleRoute("/circles/trip-c1/transactions")).toBe(true);
    expect(isCircleRoute("/circles/trip-c1/transactions/groceries-t1/edit")).toBe(true);
  });

  it("does NOT match the Create Circle flow or non-Circle routes", () => {
    // `/circles/new` lives above the Circle guard — a protected-layout child, not a Circle.
    expect(isCircleRoute("/circles/new")).toBe(false);
    expect(isCircleRoute("/circles/new/anything")).toBe(false);
    expect(isCircleRoute("/")).toBe(false);
    expect(isCircleRoute("/settings")).toBe(false);
    expect(isCircleRoute("/onboarding")).toBe(false);
  });
});

describe("layout navigation partition", () => {
  it("the Circle layout covers only SAME-Circle navigations (chrome stays correct)", () => {
    expect(coversCircleNavigation("/circles/trip-c1", "/circles/trip-c1/transactions")).toBe(true);
    expect(coversCircleNavigation("/circles/trip-c1/transactions", "/circles/trip-c1/search")).toBe(
      true,
    );
    // Crossing a Circle boundary or staying outside is NOT the Circle layout's.
    expect(coversCircleNavigation("/circles/trip-c1", "/settings")).toBe(false);
    expect(coversCircleNavigation("/", "/circles/trip-c1")).toBe(false);
    expect(coversCircleNavigation("/", "/settings")).toBe(false);
  });

  it("treats a switch BETWEEN Circles as a shell navigation (avoids stale source chrome)", () => {
    // Both are Circle routes, but different refs — the source Circle's chrome would be
    // wrong for the destination, so the shell (not the Circle layout) owns the swap.
    expect(coversCircleNavigation("/circles/trip-c1/transactions", "/circles/home-c2")).toBe(false);
    expect(coversShellNavigation("/circles/trip-c1/transactions", "/circles/home-c2")).toBe(true);
  });

  it("the shell layout covers exactly the complement", () => {
    // Every case is owned by exactly one layout — they never both swap at once.
    const cases: [string, string][] = [
      ["/circles/trip-c1", "/circles/trip-c1/transactions"],
      ["/circles/trip-c1/transactions", "/circles/home-c2"],
      ["/circles/trip-c1", "/settings"],
      ["/", "/circles/trip-c1"],
      ["/", "/settings"],
      ["/settings", "/circles/new"],
    ];
    for (const [from, to] of cases) {
      expect(coversShellNavigation(from, to)).toBe(!coversCircleNavigation(from, to));
    }
  });
});
