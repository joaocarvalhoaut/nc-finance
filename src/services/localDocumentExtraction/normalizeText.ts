/**
 * Text normalization helpers for financial document extraction.
 */

/** Lines matching these patterns are page noise and should be dropped. */
const SKIP_PATTERNS: RegExp[] = [
  /^\s*p[áa]gina\s+\d+/i,
  /^\s*\d+\s*\/\s*\d+\s*$/, // "1/5" page counter
  /^\s*impresso\s+em\b/i,
  /^[-=_*]{5,}$/, // separator lines
  /^\s*www\.\S+\s*$/, // URLs
  /^\s*<\s*\/?\s*\w+/, // HTML tags (OCR artifact)
];

/**
 * Normalise raw extracted text:
 * - Collapse horizontal whitespace within a line
 * - Drop known noise lines
 * - Preserve blank lines (max 1 consecutive) so paragraph structure survives
 */
export function normalizeText(raw: string): string {
  const lines = raw
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .filter((l) => !SKIP_PATTERNS.some((p) => p.test(l)));

  // Collapse 2+ consecutive blank lines to 1
  const out: string[] = [];
  let blanks = 0;
  for (const line of lines) {
    if (line === "") {
      blanks++;
      if (blanks <= 1) out.push("");
    } else {
      blanks = 0;
      out.push(line);
    }
  }

  return out.join("\n").trim();
}

/**
 * Quality assessment of extracted text.
 * - "empty"  < 20 meaningful chars
 * - "poor"   likely scanned / very little text per page
 * - "good"   usable for regex/heuristic extraction
 */
export function assessTextQuality(
  text: string,
  numPages = 1,
): "empty" | "poor" | "good" {
  const chars = text.replace(/\s/g, "").length;
  if (chars < 20) return "empty";
  const charsPerPage = chars / Math.max(numPages, 1);
  if (charsPerPage < 80) return "poor"; // scanned PDF threshold
  return "good";
}

/**
 * True when the text appears to come from a CSV / XLSX
 * (contains a delimiter and a recognisable header).
 */
export function looksLikeDelimited(text: string): boolean {
  const firstLines = text.split("\n").slice(0, 6);
  const hasDelimiter = firstLines.some((l) => /[;\t|]/.test(l));
  if (!hasDelimiter) return false;
  const headerKeywords = [
    "vencimento",
    "vcto",
    "valor",
    "cliente",
    "sacado",
    "titulo",
    "título",
    "documento",
    "cnpj",
  ];
  const joined = firstLines.join(" ").toLowerCase();
  const hits = headerKeywords.filter((k) => joined.includes(k)).length;
  return hits >= 2;
}
