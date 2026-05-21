import { getDocument, GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs";
import pdfWorkerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import * as XLSX from "xlsx";

GlobalWorkerOptions.workerSrc = pdfWorkerSrc;

const normalizeWhitespace = (value: string) => value.replace(/\s+/g, " ").trim();

const parsePdfFile = async (file: File) => {
  const buffer = await file.arrayBuffer();
  const pdf = await getDocument({ data: new Uint8Array(buffer) }).promise;
  const chunks: string[] = [];

  for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex += 1) {
    const page = await pdf.getPage(pageIndex);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ");

    chunks.push(normalizeWhitespace(pageText));
  }

  return normalizeWhitespace(chunks.join("\n"));
};

const parseTextFile = async (file: File) => {
  const text = await file.text();
  return normalizeWhitespace(text);
};

const parseSpreadsheetFile = async (file: File) => {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheets = workbook.SheetNames.map((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    return XLSX.utils.sheet_to_csv(sheet, { FS: ";", blankrows: false });
  });

  return normalizeWhitespace(sheets.join("\n"));
};

export const parseImportFile = async (file: File) => {
  const lowerName = file.name.toLowerCase();

  if (lowerName.endsWith(".pdf")) {
    return parsePdfFile(file);
  }

  if (lowerName.endsWith(".txt") || lowerName.endsWith(".csv")) {
    return parseTextFile(file);
  }

  if (lowerName.endsWith(".xlsx") || lowerName.endsWith(".xls")) {
    return parseSpreadsheetFile(file);
  }

  throw new Error("Formato de arquivo não suportado. Use PDF, TXT, CSV ou Excel.");
};
