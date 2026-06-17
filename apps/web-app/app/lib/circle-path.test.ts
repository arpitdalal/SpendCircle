import { describe, expect, it } from "vitest";
import routes from "~/routes.js";
import {
  CIRCLES_SEGMENT,
  circlePath,
  circleRefOf,
  isCircleScopedPath,
  RESERVED_CIRCLE_REFS,
} from "./circle-path.js";

describe("circleRefOf", () => {
  it.each([
    ["/circles/trip-c1", "trip-c1"],
    ["/circles/trip-c1/transactions", "trip-c1"],
    ["/circles/trip-c1/transactions?month=2026-05#x", "trip-c1"],
    ["/circles/new", null],
    ["/circles/%6e%65%77", null],
    ["/circles/%6E%65%77", null],
    ["/circles/new/anything", null],
    ["/circles/%6e%65%77/anything", null],
    ["/circles/", null],
    ["/circles", null],
    ["/settings", null],
    ["/circlesX/y", null],
  ] as const)("%s → %s", (path, expected) => {
    expect(circleRefOf(path)).toBe(expected);
  });
});

describe("isCircleScopedPath", () => {
  it.each([
    ["/circles/trip-c1", true],
    ["/circles/trip-c1/transactions?month=2026-05#x", true],
    ["/circles/new", false],
    ["/circles/%6e%65%77", false],
    ["/circles/", false],
    ["/circles", false],
    ["/settings", false],
    ["/circlesX/y", false],
  ] as const)("%s → %s", (path, expected) => {
    expect(isCircleScopedPath(path)).toBe(expected);
  });
});

describe("circlePath", () => {
  it("builds in-Circle paths from a ref and child segments", () => {
    expect(circlePath("trip-c1", "transactions")).toBe("/circles/trip-c1/transactions");
    expect(circlePath("trip-c1", "categories")).toBe("/circles/trip-c1/categories");
    expect(circlePath("trip-c1")).toBe("/circles/trip-c1");
  });
});

describe("route config consistency", () => {
  it("RESERVED_CIRCLE_REFS matches static segments directly under the circles prefix", () => {
    const protectedLayout = routes.find(
      (entry) => entry.file === "routes/layouts/protected-layout.tsx",
    );
    expect(protectedLayout?.children).toBeDefined();

    const prefixPrefix = `${CIRCLES_SEGMENT}/`;
    const directCircleChildren = (protectedLayout?.children ?? [])
      .flatMap((entry) => (entry.path?.startsWith(prefixPrefix) ? [entry.path] : []))
      .map((path) => path.slice(prefixPrefix.length))
      .filter((segment) => !segment.includes("/"));

    const dynamicRef = directCircleChildren.find((segment) => segment.startsWith(":"));
    expect(dynamicRef).toBe(":circleRef");

    const staticSegments = directCircleChildren.filter((segment) => !segment.startsWith(":"));
    for (const segment of staticSegments) {
      expect(RESERVED_CIRCLE_REFS).toContain(segment);
    }
    for (const reserved of RESERVED_CIRCLE_REFS) {
      expect(staticSegments).toContain(reserved);
    }
  });
});
