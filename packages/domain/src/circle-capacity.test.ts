import { describe, expect, it } from "vitest";
import {
  CIRCLE_CAPACITY_LIMIT,
  isCircleAtCapacity,
  remainingCircleSeats,
} from "./circle-capacity.js";

describe("CIRCLE_CAPACITY_LIMIT", () => {
  it("is 256", () => {
    expect(CIRCLE_CAPACITY_LIMIT).toBe(256);
  });
});

describe("isCircleAtCapacity", () => {
  it("returns false below the limit", () => {
    expect(isCircleAtCapacity(255)).toBe(false);
  });

  it("returns true at the limit", () => {
    expect(isCircleAtCapacity(256)).toBe(true);
  });

  it("returns true above the limit", () => {
    expect(isCircleAtCapacity(257)).toBe(true);
  });
});

describe("remainingCircleSeats", () => {
  it("returns remaining seats below the limit", () => {
    expect(remainingCircleSeats(200)).toBe(56);
  });

  it("returns zero at capacity", () => {
    expect(remainingCircleSeats(256)).toBe(0);
  });

  it("floors at zero when over capacity", () => {
    expect(remainingCircleSeats(300)).toBe(0);
  });
});
