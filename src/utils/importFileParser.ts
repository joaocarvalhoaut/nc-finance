/**
 * File-to-text converter for the import screen.
 *
 * PDF parsing now groups text items by their Y-coordinate so that each
 * visual row in the PDF becomes one line in the output.  This gives the
 * local extraction heuristics much better signal than a flat space-joined
 * string.
 */

import { getDocument, GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs";
import pdfWorkerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import * as XLSX from "xlsx";

GlobalWorkerOptions.workerSrc = pdfWorkerSrc;

/** Y-coordinate tolerance for grouping items on the same visual row (PDF units ≈ pt). */
const Y_TOLERANCE = 4;

// ── PDF ───────────────────────────────────────────────────────────────────────

const parsePdfFile = async (file: File): Promise<string> => {
  const buffer = await file.arrayBuffer();
  const pdf = await getDocument({ data: new Uint8Array(buffer) }).promise;
  const pageLines: string[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();

    // Collect items with their positions
    type RawItem = { str: string; transform: number[] };
    const items = (content.items as unknown[])
      .filter(
        (item): item is RawItem =>
          typeof (item as RawItem).str === "string" &&
          (item as RawItem).str.trim().length > 0 &&
          Array.isArray((item as RawItem).transform) &&
          (item as RawItem).transform.length >= 6,
      );

    if (items.length === 0) continue;

    // Group by quantised Y coordinate (same visual row)
    const rowMap = new Map<number, Array<{ str: string; x: number }>>();
    for (const item of items) {
      const y = item.transform[5];
      const bucket = Math.round(y / Y_TOLERANCE) * Y_TOLERANCE;
      const row = rowMap.get(bucket) ?? [];
      row.push({ str: item.str, x: item.transform[4] });
      rowMap.set(bucket, row);
    }

    // Sort rows top-to-bottom, items left-to-right
    const sortedRows = [...rowMap.entries()]
      .sort(([a], [b]) => b - a) // descending Y = top first
      .map(([, row]) =>
        row
          .sort((a, b) => a.x - b.x)
          .map((it) => it.str.replace(/\s+/g, " "))
          .join(" ")
          .trim(),
      )
      .filter((row) => row.length > 0);

    pageLines.push(...sortedRows);
  }

  // Join rows with newline, collapse 3+ consecutive blank lines
  return pageLines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

// ── Plain text / CSV ──────────────────────────────────────────────────────────

const parseTextFile = async (file: File): Promise<string> => {
  const text = await file.text();
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
};

// ── Spreadsheet ───────────────────────────────────────────────────────────────

const parseSpreadsheetFile = async (file: File): Promise<string> => {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheets = workbook.SheetNames.map((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    return XLSX.utils.sheet_to_csv(sheet, { FS: ";", blankrows: false });
  });
  return sheets.join("\n").trim();
};

// ── Public API ────────────────────────────────────────────────────────────────

export const parseImportFile = async (file: File): Promise<string> => {
  const name = file.name.toLowerCase();

  if (name.endsWith(".pdf")) return parsePdfFile(file);
  if (name.endsWith(".txt") || name.endsWith(".csv")) return parseTextFile(file);
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) return parseSpreadsheetFile(file);

  throw new Error("Formato de arquivo não suportado. Use PDF, TXT, CSV ou Excel (.xlsx/.xls).");
};
