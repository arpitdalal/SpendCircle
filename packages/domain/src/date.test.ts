import { describe, expect, it } from "vitest";
import {
  addMonths,
  currentMonth,
  defaultDateInMonth,
  isValidPlainDate,
  monthOf,
  monthRange,
  toPlainDate,
} from "./date.js";

describe("isValidPlainDate", () => {
  it("accepts a real date", () => {
    expect(isValidPlainDate("2026-02-28")).toBe(true);
  });

  it("rejects impossible days and bad shapes", () => {
    expect(isValidPlainDate("2026-02-30")).toBe(false);
    expect(isValidPlainDate("2026-13-01")).toBe(false);
    expect(isValidPlainDate("2026-1-1")).toBe(false);
  });
});

describe("month helpers", () => {
  it("derives the month bucket", () => {
    expect(monthOf("2026-05-29")).toBe("2026-05");
  });

  it("adds and subtracts months across year boundaries", () => {
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(addMonths("2026-11", 3)).toBe("2027-02");
  });

  it("builds an inclusive ascending month range", () => {
    expect(monthRange("2025-11", "2026-02")).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });
});

describe("toPlainDate", () => {
  it("formats a Date using local parts", () => {
    expect(toPlainDate(new Date(2026, 4, 9))).toBe("2026-05-09");
  });
});

describe("defaultDateInMonth", () => {
  const today = new Date(2026, 4, 9); // 2026-05-09

  it("uses today when today is in the selected month", () => {
    expect(defaultDateInMonth(currentMonth(today), today)).toBe("2026-05-09");
  });

  it("anchors to the first of a different selected month", () => {
    expect(defaultDateInMonth("2026-03", today)).toBe("2026-03-01");
    expect(defaultDateInMonth("2026-12", today)).toBe("2026-12-01");
  });
});
