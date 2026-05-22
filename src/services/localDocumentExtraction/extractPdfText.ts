/**
 * Enhanced PDF text extractor using pdfjs-dist.
 *
 * Uses the x/y coordinates of each text item to reconstruct the original
 * row structure.  Items on the same row (within Y_TOLERANCE px) are joined
 * with a space; rows are separated with \n.
 *
 * This gives the heuristics much better input than a flat space-joined string.
 */

import {
  getDocument,
  GlobalWorkerOptions,
} from "pdfjs-dist/legacy/build/pdf.mjs";
import pdfWorkerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";

GlobalWorkerOptions.workerSrc = pdfWorkerSrc;

/** Y-coordinate bucket size in PDF units (~1 pt = 1 unit) */
const Y_TOLERANCE = 4;

/** Minimum average characters per page to consider the PDF digital (not scanned). */
const SCANNED_THRESHOLD_CPP = 60;

export interface PdfExtractionResult {
  /** Structured text: items in the same row joined by space, rows by \n */
  text: string;
  /** Number of pages in the PDF */
  pages: number;
  /** Average characters per page (low = probably scanned) */
  avgCharsPerPage: number;
  /** True when the PDF appears to be scanned / image-based */
  isLikelyScanned: boolean;
}

interface RawTextItem {
  str: string;
  x: number;
  y: number;
}

/**
 * Extract structured text from a PDF File object.
 * Groups text items by Y-coordinate into logical rows.
 */
export async function extractStructuredPdfText(
  file: File,
): Promise<PdfExtractionResult> {
  const buffer = await file.arrayBuffer();
  const pdf = await getDocument({ data: new Uint8Array(buffer) }).promise;

  const pageLines: string[] = [];
  let totalChars = 0;

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();

    // Collect items with their position
    const items: RawTextItem[] = (content.items as Array<Record<string, unknown>>)
      .filter(
        (item) =>
          typeof item.str === "string" &&
          item.str.trim().length > 0 &&
          Array.isArray(item.transform) &&
          (item.transform as number[]).length >= 6,
      )
      .map((item) => ({
        str: (item.str as string).replace(/\s+/g, " "),
        x: (item.transform as number[])[4],
        y: (item.transform as number[])[5],
      }));

    if (items.length === 0) continue;

    // Bucket items by quantised Y (rows)
    const rowMap = new Map<number, RawTextItem[]>();
    for (const item of items) {
      const bucket = Math.round(item.y / Y_TOLERANCE) * Y_TOLERANCE;
      const row = rowMap.get(bucket) ?? [];
      row.push(item);
      rowMap.set(bucket, row);
    }

    // Sort rows top-to-bottom (higher Y = higher on page in PDF coordinates)
    const sortedRows = [...rowMap.entries()]
      .sort(([a], [b]) => b - a) // descending Y
      .map(([, rowItems]) =>
        rowItems
          .sort((a, b) => a.x - b.x) // left to right
          .map((it) => it.str)
          .join(" ")
          .replace(/\s+/g, " ")
          .trim(),
      )
      .filter((row) => row.length > 0);

    pageLines.push(...sortedRows);
    totalChars += sortedRows.join("").length;
  }

  const avgCharsPerPage = totalChars / Math.max(pdf.numPages, 1);

  return {
    text: pageLines.join("\n"),
    pages: pdf.numPages,
    avgCharsPerPage,
    isLikelyScanned: avgCharsPerPage < SCANNED_THRESHOLD_CPP,
  };
}
