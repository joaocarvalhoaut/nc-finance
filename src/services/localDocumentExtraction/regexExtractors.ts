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

/** 10-11 isolated digits (area code + number, no surrounding digits) */
export const PHONE_RE = /\b\d{10,11}\b/g;

/**
 * Formatted Brazilian phone — requires hyphen as explicit formatting signal.
 * Matches: (77) 99988-7766 | (77)99988-7766 | (77) 9 9988-7766
 *          77 99988-7766   | 77 3333-4444
 *          +55 77 99988-7766 | 55 77 99988-7766
 */
export const PHONE_FORMATTED_RE =
  /(?:(?:\+?55)[\s-]?)?(?:\(\d{2}\)|(?<!\d)\d{2})[\s-]?(?:\d[\s-]?)?\d{4}-\d{4}/g;

/**
 * DDD in parens + 8-9 raw digit run (no hyphen).
 * Matches: (77) 999887766 | (77)99988776
 */
export const PHONE_PARENS_RE = /\(\d{2}\)[\s-]?\d{8,9}/g;

/** DD/MM/YYYY ou DD/MM/YY (relatórios/ERP usam ano de 2 dígitos) */
export const DATE_RE = /\b\d{2}\/\d{2}\/\d{2,4}\b/g;

/** R$ 1.234,56  or  R$1234.56 */
export const CURRENCY_RE = /R\$\s*([\d.,]+)/gi;

/**
 * Valor monetário em formato brasileiro SEM o símbolo R$ (ex.: "4.512,80").
 * Exige os centavos (",dd") para não capturar dias/quantidades inteiras.
 */
export const CURRENCY_BARE_RE = /\b\d{1,3}(?:\.\d{3})*,\d{2}\b/g;

/** Brazilian document types */
export const DOC_TYPE_RE =
  /\b(Duplicata\s*Mercantil|Nota\s+Promiss[oó]ria|Cheque|Boleto|NF[e]?|Recibo|Contrato|D\.M\.|DM)\b/gi;

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
  const withSymbol = [...text.matchAll(new RegExp(CURRENCY_RE.source, "gi"))]
    .map((m) => parseBRLAmount(m[1]))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (withSymbol.length > 0) return withSymbol;

  // Fallback: valores em formato BR sem o símbolo R$ (relatórios/ERP/boletos).
  return [...text.matchAll(new RegExp(CURRENCY_BARE_RE.source, "g"))]
    .map((m) => parseBRLAmount(m[0]))
    .filter((n) => Number.isFinite(n) && n > 0);
}

/**
 * First phone number in text that doesn't overlap with a CNPJ/CPF match.
 * Tries three passes in descending specificity:
 *   1. Formatted phone with hyphen: (77) 99988-7766 / 77 99988-7766 / +55 77 …
 *   2. DDD in parens + raw 8-9 digit run: (77)999887766
 *   3. Raw 10-11 digit sequence (original behaviour)
 * Always returns digits only (non-digit chars stripped).
 */
export function findFirstPhone(text: string): string | null {
  // Build exclusion zones from CNPJ/CPF matches
  const exclusions: Array<[number, number]> = [
    ...text.matchAll(new RegExp(CNPJ_RE.source, "g")),
    ...text.matchAll(new RegExp(CPF_RE.source, "g")),
  ].map((m) => [m.index!, m.index! + m[0].length]);

  const inExclusion = (start: number, end: number) =>
    exclusions.some(([a, b]) => start < b && end > a);

  // Pass 1: formatted phone with hyphen (strong formatting signal)
  for (const m of text.matchAll(new RegExp(PHONE_FORMATTED_RE.source, "gu"))) {
    const start = m.index!;
    const end = start + m[0].length;
    if (!inExclusion(start, end)) {
      const digits = m[0].replace(/\D/g, "");
      // Strip leading country code "55" if result is 12-13 digits
      const phone = digits.length > 11 ? digits.slice(digits.length - 11) : digits;
      if (phone.length >= 10 && phone.length <= 11) return phone;
    }
  }

  // Pass 2: DDD in parens + 8-9 digit run (no hyphen)
  for (const m of text.matchAll(new RegExp(PHONE_PARENS_RE.source, "g"))) {
    const start = m.index!;
    const end = start + m[0].length;
    if (!inExclusion(start, end)) {
      const digits = m[0].replace(/\D/g, "");
      if (digits.length >= 10 && digits.length <= 11) return digits;
    }
  }

  // Pass 3: raw 10-11 digit sequence (original behaviour)
  for (const m of text.matchAll(new RegExp(PHONE_RE.source, "g"))) {
    const start = m.index!;
    const end = start + m[0].length;
    if (!inExclusion(start, end)) return m[0];
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
