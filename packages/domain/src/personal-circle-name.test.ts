import { describe, expect, it } from "vitest";
import { initials } from "./initials.js";
import { personalCircleName } from "./personal-circle-name.js";

describe("personalCircleName", () => {
  it("names from the first whitespace-delimited token", () => {
    expect(personalCircleName("Ada Lovelace")).toBe("Ada's Circle");
    expect(personalCircleName("Mary Jane Watson")).toBe("Mary's Circle");
  });

  it("supports a mononym", () => {
    expect(personalCircleName("Madonna")).toBe("Madonna's Circle");
  });

  it('falls back to "Personal Circle" for empty or whitespace-only names', () => {
    expect(personalCircleName("")).toBe("Personal Circle");
    expect(personalCircleName("   ")).toBe("Personal Circle");
  });

  it('falls back to "Personal Circle" when the first token is emoji-only', () => {
    expect(personalCircleName("🦊")).toBe("Personal Circle");
    expect(personalCircleName("🦊 Alex")).toBe("Personal Circle");
  });

  it("pairs with initials for the Personal Circle mark", () => {
    expect(initials(personalCircleName("Ada Lovelace"))).toBe("AC");
    expect(initials(personalCircleName("Madonna"))).toBe("MC");
    expect(initials(personalCircleName(""))).toBe("PC");
  });
});
