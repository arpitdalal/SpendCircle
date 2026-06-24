import { describe, expect, it } from "vitest";
import { buildCsv, escapeCsvField, parseCsvRow } from "./csv.js";

describe("csv", () => {
  it("escapes commas, quotes, and newlines per RFC-4180", () => {
    expect(escapeCsvField("plain")).toBe("plain");
    expect(escapeCsvField("a,b")).toBe('"a,b"');
    expect(escapeCsvField('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsvField("line1\nline2")).toBe('"line1\nline2"');
    expect(escapeCsvField("line1\rline2")).toBe('"line1\rline2"');
  });

  it("round-trips escaped fields through buildCsv and parseCsvRow", () => {
    const headers = ["Title", "Note", "Categories"] as const;
    const rows = [
      {
        Title: 'Coffee, "special"',
        Note: "line1\nline2",
        Categories: "Groceries, Dining",
      },
    ];
    const csv = buildCsv(headers, rows);
    const [headerLine, rowLine] = csv.split("\r\n");
    expect(parseCsvRow(headerLine ?? "")).toEqual(["Title", "Note", "Categories"]);
    expect(parseCsvRow(rowLine ?? "")).toEqual([
      'Coffee, "special"',
      "line1\nline2",
      "Groceries, Dining",
    ]);
  });
});
