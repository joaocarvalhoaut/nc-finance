/**
 * Regex extractors for Brazilian financial document fields.
 * Never logs full field values — only lengths / presence flags.
 */

// ── Pattern constants ─────────────────────────────────────────────────────────

/** XX.XXX.XXX/XXXX-XX */
export const CNPJ_RE = /\b\d{2}\.?\d{3}\.?\d{3}[/\\]?\d{4}-?\d{2}\b/g;

/**
 * XXX.XXX.XXX-XX  — dots and dash are REQUIRED so unformatted 11-digit
 * phone numbers are not mistakenly excluded from phone detection.
 */
export const CPF_RE = /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g;

/** 10-11 isolated digits (area code + number) */
export const PHONE_RE = /\b\d{10,11}\b/g;

/** DD/MM/YYYY */
export const DATE_RE = /\b\d{2}\/\d{2}\/\d{4}\b/g;

/** R$ 1.234,56  or  R$1234.56 */
export const CURRENCY_RE = /R\$\s*([\d.,]+)/gi;

/** Brazilian document types */
export const DOC_TYPE_RE =
  /\b(Duplicata\s+Mercantil|Nota\s+Promiss[oó]ria|Cheque|Boleto|NF[e]?|Recibo|Contrato|D\.M\.|DM)\b/gi;

/** Alphanumeric codes that look like title/boleto numbers: "4254-2", "CH01-3", "1243/002" */
export const DOC_NUM_RE = /\b([A-Z]{0,4}\d[\w-]{0,15}(?:\/\d{1,6})?)\b/g;

/** Debtor status keywords */
export const STATUS_RE = /\b(Aberto|Pago|Parcial|Vencido|Cancelado|Liquidado|Protestado|Em\s+atraso)\b/gi;

// ── Extraction helpers ────────────────────────────────────────────────────────

/** All CNPJ occurrences in text with their indices */
export function findAllCNPJ(
  text: string,
): Array<{ value: string; index: number }> {
  return [...text.matchAll(new RegExp(CNPJ_RE.source, "g"))].map((m) => ({
    value: m[0],
    index: m.index!,
  }));
}

/** All dates in text */
export function findAllDates(text: string): string[] {
  return [...text.matchAll(new RegExp(DATE_RE.source, "g"))].map((m) => m[0]);
}

/**
 * All positive R$ amounts in text, in order.
 * Returns NaN entries filtered out.
 */
export function findAllCurrencies(text: string): number[] {
  return [...text.matchAll(new RegExp(CURRENCY_RE.source, "gi"))]
    .map((m) => parseBRLAmount(m[1]))
    .filter((n) => Number.isFinite(n) && n > 0);
}

/**
 * First phone number in text that doesn't overlap with a CNPJ/CPF match.
 * Returns null if none found.
 */
export function findFirstPhone(text: string): string | null {
  // Build exclusion zones from CNPJ/CPF matches
  const exclusions: Array<[number, number]> = [
    ...text.matchAll(new RegExp(CNPJ_RE.source, "g")),
    ...text.matchAll(new RegExp(CPF_RE.source, "g")),
  ].map((m) => [m.index!, m.index! + m[0].length]);

  for (const m of text.matchAll(new RegExp(PHONE_RE.source, "g"))) {
    const start = m.index!;
    const end = start + m[0].length;
    const overlaps = exclusions.some(([a, b]) => start < b && end > a);
    if (!overlaps) return m[0];
  }
  return null;
}

/**
 * Parse a Brazilian Real amount string into a JavaScript number.
 * Handles "1.234,56" (pt-BR) and "1234.56" (en-US).
 */
export function parseBRLAmount(raw: string): number {
  const s = raw.trim().replace(/R\$\s*/gi, "");
  if (s.includes(",")) {
    // pt-BR: dot = thousands, comma = decimal
    return parseFloat(s.replace(/\./g, "").replace(",", "."));
  }
  // Already decimal
  return parseFloat(s);
}

/** Normalize a phone string to digits only */
export function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, "");
}

/** Normalize a CNPJ to the formatted XX.XXX.XXX/XXXX-XX form */
export function formatCNPJ(raw: string): string {
  const d = raw.replace(/\D/g, "");
  if (d.length !== 14) return raw;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}
