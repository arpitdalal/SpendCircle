import { describe, expect, it } from "vitest";
import { buildCsv, escapeCsvField, parseCsvRow } from "./csv.js";

describe("csv", () => {
  it("neutralizes spreadsheet formula starters before RFC-4180 escaping", () => {
    expect(escapeCsvField('=HYPERLINK("http://evil")')).toBe('"\'=HYPERLINK(""http://evil"")"');
    expect(escapeCsvField("+1234")).toBe("'+1234");
    expect(escapeCsvField("-cmd|'/c calc'!A0")).toBe("'-cmd|'/c calc'!A0");
    expect(escapeCsvField("@SUM(A1:A10)")).toBe("'@SUM(A1:A10)");
    expect(escapeCsvField("  =1+1")).toBe("'  =1+1");
    expect(escapeCsvField("plain")).toBe("plain");
    expect(escapeCsvField("a=b")).toBe("a=b");
  });

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

  it("round-trips formula-like member-controlled fields as literal text", () => {
    const headers = ["Title", "Note", "Categories"] as const;
    const rows = [
      {
        Title: "=1+1",
        Note: "+prompt injection",
        Categories: "@evil, safe",
      },
    ];
    const csv = buildCsv(headers, rows);
    const [, rowLine] = csv.split("\r\n");
    expect(parseCsvRow(rowLine ?? "")).toEqual(["'=1+1", "'+prompt injection", "'@evil, safe"]);
  });
});
