import { describe, expect, it } from "vitest";
import { starterCategories } from "./setup.js";

describe("starterCategories", () => {
  it("includes shared defaults for every setup answer", () => {
    expect(starterCategories({}).map((category) => category.name)).toEqual([
      "Groceries",
      "Dining",
      "Transport",
      "Utilities",
      "Health",
      "Entertainment",
      "Shopping",
      "Education",
      "Travel",
    ]);
  });

  it("adds Rent for a leased residence, not Mortgage", () => {
    const names = starterCategories({ purpose: "residence", residenceType: "leased" }).map(
      (category) => category.name,
    );

    expect(names).toContain("Rent");
    expect(names).not.toContain("Mortgage");
  });

  it("adds Mortgage for an owned residence, not Rent", () => {
    const names = starterCategories({ purpose: "residence", residenceType: "owned" }).map(
      (category) => category.name,
    );

    expect(names).toContain("Mortgage");
    expect(names).not.toContain("Rent");
  });

  it("does not add residence categories for non-residence circles", () => {
    const names = starterCategories({ purpose: "trip", residenceType: "leased" }).map(
      (category) => category.name,
    );

    expect(names).not.toContain("Rent");
    expect(names).not.toContain("Mortgage");
  });

  it("does not derive duplicate names within one type", () => {
    const categories = starterCategories({ purpose: "residence", residenceType: "leased" });
    const keys = categories.map((category) => `${category.type}:${category.name.toLowerCase()}`);

    expect(new Set(keys).size).toBe(keys.length);
  });
});
