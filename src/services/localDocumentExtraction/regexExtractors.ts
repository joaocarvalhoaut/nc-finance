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

/**
 * Telefone com espaço ou ponto entre os grupos, sem hífen — comum em planilha
 * digitada à mão e em relatório: "77 9 9932 3232", "(77) 99932 3232",
 * "+55 77 9 9932 3232", "0 77 9932 3232", "77.99932.3232".
 * Antes nenhum desses era reconhecido no texto corrido, e o relatório inteiro
 * vinha sem telefone. Exige separador depois do DDD (o número colado já é
 * coberto pelo PHONE_RE) e não pode estar grudado em outro número, data ou valor.
 */
export const PHONE_SPACED_RE =
  /(?<![\d/,.])(?:\+?\s?55[\s.-]+)?(?:0[\s.-]?)?(?:\(\s*\d{2}\s*\)|\d{2})[\s.-]+(?:9[\s.-]?)?\d{4}[\s.-]?\d{4}(?![\d/,]|\.\d)/g;

/**
 * Dígitos de um telefone → DDD + número (10 ou 11 dígitos), sem DDI 55 e sem o
 * 0 de discagem; null se não for um telefone brasileiro com DDD válido.
 */
export function normalizarDigitosTelefone(raw: string): string | null {
  let d = (raw ?? "").replace(/\D/g, "");
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) d = d.slice(2);
  if (d.startsWith("0") && (d.length === 11 || d.length === 12)) d = d.slice(1);
  if (d.length !== 10 && d.length !== 11) return null;
  if (!/^[1-9][1-9]/.test(d)) return null; // DDD 11 a 99, sem zero
  if (d.length === 11 && d[2] !== "9") return null; // 11 dígitos: celular, começa com 9
  return d;
}

/**
 * Datas em formatos comuns de relatórios brasileiros e exportações de sistema:
 *   DD/MM/YYYY · DD/MM/YY · DD-MM-YYYY · DD-MM-YY · DD.MM.YYYY · DD.MM.YY ·
 *   YYYY-MM-DD (ISO, comum em CSV exportado por sistemas)
 * A alternativa ISO vem primeiro para vencer no início de "2026-06-15"
 * (a partir do meio da string, \b entre dígitos impede falso match).
 */
export const DATE_RE =
  /\b(?:\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{2,4}|\d{2}-\d{2}-\d{4}|\d{2}-\d{2}-\d{2}(?!\d)|\d{2}\.\d{2}\.\d{4}|\d{2}\.\d{2}\.\d{2}(?!\d))\b/g;

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
  return findFirstPhoneMatch(text)?.phone ?? null;
}

/**
 * Como findFirstPhone, mas diz também ONDE o telefone está no texto. Os
 * parsers usam a posição para saber onde termina o nome do cliente — procurar
 * os dígitos com indexOf falhava sempre que o número vinha formatado
 * ("(77) 99988-7766" não contém "77999887766").
 */
export function findFirstPhoneMatch(text: string): { phone: string; start: number; end: number } | null {
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
      // Remove o DDI 55 quando vier (12 ou 13 dígitos). O slice(-11) antigo
      // cortava errado número com DDI e sem o 9: "557799887720" virava
      // "57799887720", com o 5 do país no lugar do DDD.
      const phone = (digits.length === 12 || digits.length === 13) && digits.startsWith("55")
        ? digits.slice(2)
        : digits.length > 11 ? digits.slice(digits.length - 11) : digits;
      if (phone.length >= 10 && phone.length <= 11) return { phone, start, end };
    }
  }

  // Pass 2: DDD in parens + 8-9 digit run (no hyphen)
  for (const m of text.matchAll(new RegExp(PHONE_PARENS_RE.source, "g"))) {
    const start = m.index!;
    const end = start + m[0].length;
    if (!inExclusion(start, end)) {
      const digits = m[0].replace(/\D/g, "");
      if (digits.length >= 10 && digits.length <= 11) return { phone: digits, start, end };
    }
  }

  // Pass 3: grupos separados por espaço ou ponto ("77 9 9932 3232") ou
  // dígitos colados (10-11) — vale o que aparecer primeiro no texto.
  let melhor: { phone: string; start: number; end: number } | null = null;
  for (const m of text.matchAll(new RegExp(PHONE_SPACED_RE.source, "g"))) {
    const start = m.index!;
    const end = start + m[0].length;
    if (inExclusion(start, end)) continue;
    const phone = normalizarDigitosTelefone(m[0]);
    if (phone) { melhor = { phone, start, end }; break; }
  }
  for (const m of text.matchAll(new RegExp(PHONE_RE.source, "g"))) {
    const start = m.index!;
    const end = start + m[0].length;
    if (inExclusion(start, end)) continue;
    if (!melhor || start < melhor.start) melhor = { phone: m[0], start, end };
    break;
  }

  return melhor;
}

/**
 * Parse a Brazilian Real amount string into a JavaScript number.
 * Handles "1.234,56" (pt-BR) and "1234.56" (en-US).
 */
export function parseBRLAmount(raw: string): number {
  const s = raw.trim().replace(/R\$\s*/gi, "");
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");

  if (lastComma >= 0 && lastDot >= 0) {
    // Ambos presentes: o separador que aparece POR ÚLTIMO é o decimal.
    // "1.234,56" (BR) → 1234.56 · "1,234.56" (US) → 1234.56
    return lastComma > lastDot
      ? parseFloat(s.replace(/\./g, "").replace(",", "."))
      : parseFloat(s.replace(/,/g, ""));
  }
  if (lastComma >= 0) {
    // Só vírgula: decimal pt-BR ("1234,56")
    return parseFloat(s.replace(",", "."));
  }
  // Só ponto (ou nenhum): "1.234" com grupos de 3 é milhar pt-BR (→ 1234);
  // caso contrário é decimal ("1234.5" vindo de célula numérica de Excel).
  if (/^\d{1,3}(?:\.\d{3})+$/.test(s)) {
    return parseFloat(s.replace(/\./g, ""));
  }
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
