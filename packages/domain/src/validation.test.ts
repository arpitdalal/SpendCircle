import { describe, expect, it } from "vitest";
import { COLOR_PALETTE, colorLabel } from "./color.js";
import { MAX_AMOUNT_MINOR } from "./money.js";
import {
  LIMITS,
  categoryInputSchema,
  transactionCreateSchema,
  transactionInputSchema,
} from "./validation.js";

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

describe("transactionInputSchema (form contract)", () => {
  const valid = {
    type: "expense",
    title: "Lunch",
    amount: "12.50",
    date: "2026-05-15",
    categoryIds: ["cat-1"],
    paidByMemberId: "mem-1",
  } as const;

  it("parses the amount string into positive minor units", () => {
    const parsed = transactionInputSchema.parse(valid);
    expect(parsed.amountMinorUnits).toBe(1250);
    expect(parsed.title).toBe("Lunch");
  });

  it("trims the title and note", () => {
    const parsed = transactionInputSchema.parse({
      ...valid,
      title: "  Lunch  ",
      note: "  with the team  ",
    });
    expect(parsed.title).toBe("Lunch");
    expect(parsed.note).toBe("with the team");
  });

  it("accepts an income transaction", () => {
    expect(transactionInputSchema.safeParse({ ...valid, type: "income" }).success).toBe(true);
  });

  it("rejects an empty title", () => {
    expect(transactionInputSchema.safeParse({ ...valid, title: "" }).success).toBe(false);
  });

  it("rejects a whitespace-only title", () => {
    expect(transactionInputSchema.safeParse({ ...valid, title: "   " }).success).toBe(false);
  });

  it("rejects a title over the max length", () => {
    const title = "x".repeat(LIMITS.transactionTitleMax + 1);
    expect(transactionInputSchema.safeParse({ ...valid, title }).success).toBe(false);
  });

  it("rejects a note over the max length", () => {
    const note = "x".repeat(LIMITS.transactionNoteMax + 1);
    expect(transactionInputSchema.safeParse({ ...valid, note }).success).toBe(false);
  });

  it("rejects an unsupported transaction type", () => {
    expect(transactionInputSchema.safeParse({ ...valid, type: "transfer" }).success).toBe(false);
  });

  it("surfaces the amount error message on the amount path", () => {
    const result = transactionInputSchema.safeParse({ ...valid, amount: "0" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path[0] === "amount");
      expect(issue?.message).toBe("Amount must be greater than zero");
    }
  });

  it("rejects an invalid date format", () => {
    expect(transactionInputSchema.safeParse({ ...valid, date: "15-05-2026" }).success).toBe(false);
  });

  it("requires at least one category", () => {
    expect(transactionInputSchema.safeParse({ ...valid, categoryIds: [] }).success).toBe(false);
  });

  it("rejects duplicate categories", () => {
    expect(transactionInputSchema.safeParse({ ...valid, categoryIds: ["c", "c"] }).success).toBe(
      false,
    );
  });

  it("rejects more than the max categories", () => {
    const categoryIds = Array.from(
      { length: LIMITS.maxCategoriesPerTransaction + 1 },
      (_, i) => `c${i}`,
    );
    expect(transactionInputSchema.safeParse({ ...valid, categoryIds }).success).toBe(false);
  });
});

describe("transactionCreateSchema (server contract)", () => {
  const valid = {
    type: "expense",
    title: "Lunch",
    amountMinorUnits: 1250,
    date: "2026-05-15",
    categoryIds: ["cat-1"],
  } as const;

  it("accepts a well-formed payload without an explicit paidByMemberId", () => {
    const parsed = transactionCreateSchema.parse(valid);
    expect(parsed.amountMinorUnits).toBe(1250);
    expect(parsed.paidByMemberId).toBeUndefined();
  });

  it("accepts the maximum amount and an explicit paidByMemberId", () => {
    expect(
      transactionCreateSchema.safeParse({
        ...valid,
        amountMinorUnits: MAX_AMOUNT_MINOR,
        paidByMemberId: "mem-2",
      }).success,
    ).toBe(true);
  });

  it.each([
    ["zero", 0],
    ["negative", -1],
    ["non-integer", 12.5],
    ["one minor unit over max", MAX_AMOUNT_MINOR + 1],
  ])("rejects a %s amount", (_label, amountMinorUnits) => {
    expect(transactionCreateSchema.safeParse({ ...valid, amountMinorUnits }).success).toBe(false);
  });

  it("rejects an invalid date", () => {
    expect(transactionCreateSchema.safeParse({ ...valid, date: "2026-13-01" }).success).toBe(false);
  });

  it("rejects zero categories and duplicates", () => {
    expect(transactionCreateSchema.safeParse({ ...valid, categoryIds: [] }).success).toBe(false);
    expect(transactionCreateSchema.safeParse({ ...valid, categoryIds: ["x", "x"] }).success).toBe(
      false,
    );
  });

  it("trims the title and treats an empty trimmed note as still valid", () => {
    const parsed = transactionCreateSchema.parse({ ...valid, title: "  Lunch  ", note: "  " });
    expect(parsed.title).toBe("Lunch");
    expect(parsed.note).toBe("");
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
