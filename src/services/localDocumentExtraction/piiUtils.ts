/**
 * PII masking helpers for safe logging.
 *
 * RULE: No log statement in the local extraction pipeline may emit a raw
 * CPF, CNPJ, phone number, or full personal name.  Pass any string that may
 * contain such data through maskPII() before logging.
 *
 * Usage:
 *   console.log(maskPII(`phone=${phone} cnpj=${cnpj}`));
 */

/**
 * Mask PII tokens in a string:
 *  - CNPJ XX.XXX.XXX/XXXX-XX  →  XX.XXX.***‌/**-**
 *  - CPF  XXX.XXX.XXX-XX      →  XXX.***.***-**
 *  - Phone 10-11 digits        →  first 2 + ***** + last 4
 */
export function maskPII(s: string): string {
  if (!s) return s;

  // CNPJ: keep first block + second block, mask the rest
  s = s.replace(
    /\b(\d{2}\.\d{3})\.\d{3}\/\d{4}-\d{2}\b/g,
    "$1.***/**-**",
  );

  // CPF (with mandatory separators — same requirement as regexExtractors.ts)
  s = s.replace(
    /\b(\d{3})\.\d{3}\.\d{3}-\d{2}\b/g,
    "$1.***.***-**",
  );

  // Phone (10–11 consecutive digits NOT already inside a CNPJ/CPF)
  // Keep area code (first 2) + last 4, mask the middle
  s = s.replace(/\b(\d{2})\d{5,7}(\d{4})\b/g, "$1*****$2");

  return s;
}

/**
 * Truncate a name for safe logging — shows only length and first initial.
 * "JOAO DA SILVA" → "J. (13 chars)"
 */
export function maskName(name: string | null | undefined): string {
  if (!name) return "(null)";
  const trimmed = name.trim();
  if (trimmed.length === 0) return "(empty)";
  return `${trimmed[0]}. (${trimmed.length} chars)`;
}
