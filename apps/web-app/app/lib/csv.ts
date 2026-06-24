/**
 * Spreadsheet formula injection guard (OWASP CSV injection).
 * Excel/Sheets treat leading `=`, `+`, `-`, `@` (even after whitespace) as formulas.
 * A leading apostrophe forces literal text without changing the displayed value.
 */
function neutralizeSpreadsheetFormula(value: string) {
  if (/^[\s]*[=+\-@]/.test(value)) {
    return `'${value}`;
  }
  return value;
}

/** RFC-4180 field escaping for CSV export, with spreadsheet-formula neutralization. */
export function escapeCsvField(value: string) {
  const safe = neutralizeSpreadsheetFormula(value);
  if (/[,"\r\n]/.test(safe)) {
    return `"${safe.replaceAll('"', '""')}"`;
  }
  return safe;
}

/** Builds a CSV string with a header row and `\r\n` line endings. */
export function buildCsv(headers: readonly string[], rows: readonly Record<string, string>[]) {
  const lines = [
    headers.map(escapeCsvField).join(","),
    ...rows.map((row) => headers.map((header) => escapeCsvField(row[header] ?? "")).join(",")),
  ];
  return lines.join("\r\n");
}

/** Parses a single RFC-4180 CSV row into fields (for tests). */
export function parseCsvRow(line: string) {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (inQuotes) {
      if (char === '"') {
        const next = line[index + 1];
        if (next === '"') {
          current += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
      continue;
    }
    if (char === ",") {
      fields.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  fields.push(current);
  return fields;
}

/** Triggers a CSV download in the browser. */
export function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export const TRANSACTION_EXPORT_HEADERS = [
  "Date",
  "Type",
  "Title",
  "Note",
  "Amount",
  "Currency",
  "Categories",
  "Recorded By",
  "Paid By",
  "Status",
] as const;

export function buildTransactionExportCsv(
  rows: readonly {
    date: string;
    type: string;
    title: string;
    note: string;
    amount: string;
    currency: string;
    categories: string;
    recordedBy: string;
    paidBy: string;
    status: string;
  }[],
) {
  return buildCsv(
    TRANSACTION_EXPORT_HEADERS,
    rows.map((row) => ({
      Date: row.date,
      Type: row.type,
      Title: row.title,
      Note: row.note,
      Amount: row.amount,
      Currency: row.currency,
      Categories: row.categories,
      "Recorded By": row.recordedBy,
      "Paid By": row.paidBy,
      Status: row.status,
    })),
  );
}
