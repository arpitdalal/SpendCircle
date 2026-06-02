import { describe, expect, it } from "vitest";
import { COLOR_PALETTE, colorLabel } from "./color.js";
import { LIMITS, categoryInputSchema } from "./validation.js";

/**
 * The shared category form contract (ADR 0010). These assertions are the
 * first line of defense for CAT-1's invariants — name trimming/length, the
 * type enum, and the required palette color — but never the only one: Convex
 * re-validates the same input server-side (ADR 0015).
 */
describe("categoryInputSchema", () => {
  const valid = { name: "Groceries", type: "expense", color: "green" } as const;

  it("accepts a well-formed expense category", () => {
    expect(categoryInputSchema.parse(valid)).toEqual(valid);
  });

  it("accepts a well-formed income category", () => {
    const input = { name: "Salary", type: "income", color: "teal" } as const;
    expect(categoryInputSchema.parse(input)).toEqual(input);
  });

  it("trims surrounding whitespace from the name", () => {
    expect(categoryInputSchema.parse({ ...valid, name: "  Gas  " }).name).toBe("Gas");
  });

  it("rejects an empty name", () => {
    expect(categoryInputSchema.safeParse({ ...valid, name: "" }).success).toBe(false);
  });

  it("rejects a whitespace-only name", () => {
    expect(categoryInputSchema.safeParse({ ...valid, name: "   " }).success).toBe(false);
  });

  it("accepts a name at the max length", () => {
    const name = "x".repeat(LIMITS.categoryNameMax);
    expect(categoryInputSchema.parse({ ...valid, name }).name).toBe(name);
  });

  it("rejects a name one character over the max length", () => {
    const name = "x".repeat(LIMITS.categoryNameMax + 1);
    expect(categoryInputSchema.safeParse({ ...valid, name }).success).toBe(false);
  });

  it("rejects an unsupported transaction type", () => {
    expect(categoryInputSchema.safeParse({ ...valid, type: "transfer" }).success).toBe(false);
  });

  it("rejects a missing color", () => {
    expect(categoryInputSchema.safeParse({ name: "Gas", type: "expense" }).success).toBe(false);
  });

  it("rejects a color outside the palette", () => {
    expect(categoryInputSchema.safeParse({ ...valid, color: "chartreuse" }).success).toBe(false);
  });

  it("accepts every palette color id", () => {
    for (const color of COLOR_PALETTE) {
      expect(categoryInputSchema.safeParse({ ...valid, color: color.id }).success).toBe(true);
    }
  });
});

describe("colorLabel", () => {
  it("maps a palette id to its display name", () => {
    expect(colorLabel("blue")).toBe("Blue");
    expect(colorLabel("green")).toBe("Green");
  });

  it("falls back to the id when unknown", () => {
    expect(colorLabel("chartreuse")).toBe("chartreuse");
  });
});
