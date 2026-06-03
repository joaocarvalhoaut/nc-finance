/**
 * Heuristic record assembly.
 *
 * Two strategies:
 *   1. ERP / freeform text  →  CNPJ-anchor segmentation
 *   2. Delimited (CSV/XLSX) →  Table row mapping
 *
 * Both return RecordCandidate[] with a confidenceScore (0–100).
 */

import {
  findAllCNPJ,
  findAllDates,
  findAllCurrencies,
  findFirstPhone,
  parseBRLAmount,
  CURRENCY_RE,
  DATE_RE,
  DOC_TYPE_RE,
  STATUS_RE,
} from "./regexExtractors";
import {
  isHeaderLine,
  detectDelimiter,
  buildColumnMap,
  parseRows,
  ParsedRow,
} from "./tableParser";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RecordCandidate {
  /** Debtor / client name (sacado) */
  client: string | null;
  /** Creditor / issuer name */
  supplier: string | null;
  /** Issuer's CNPJ */
  cnpj: string | null;
  /** Document / título number */
  document: string | null;
  /** Due date DD/MM/YYYY */
  dueDate: string | null;
  /** Face value in BRL */
  value: number | null;
  /** Amount already paid */
  valuePaid: number | null;
  /** Phone (digits only) */
  phone: string | null;
  /** Status keyword (Aberto, Pago, …) */
  status: string | null;
  /** Document type (Duplicata Mercantil, …) */
  docType: string | null;
  /** 0–100 extraction confidence */
  confidenceScore: number;
  /** Which extractor produced this record */
  extractionMethod: string;
}

// ── Confidence scoring ────────────────────────────────────────────────────────

function score(r: RecordCandidate): number {
  let s = 0;
  if ((r.client && r.client.length >= 3) || (r.supplier && r.supplier.length >= 3)) s += 30;
  if (r.document) s += 25;
  if (r.dueDate) s += 25;
  if (r.value != null && r.value >= 0) s += 20;
  return s;
}

// ── Noise / header word detection ────────────────────────────────────────────

const HEADER_WORDS = new Set([
  "empresa", "sacado", "telefone", "tipo", "titulo", "titulo", "vencimento",
  "dias", "valor", "estado", "emissao", "emissão", "pagamento", "pago",
  "cnpj", "cpf", "lista", "recebiveis", "recebíveis", "data", "registro",
  "nfe", "nf", "serie", "numero", "n°", "no",
]);

function isHeaderWord(word: string): boolean {
  const norm = word
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  return HEADER_WORDS.has(norm);
}

/** Remove all header-like words from a candidate name string */
function cleanName(raw: string): string {
  return raw
    .split(/\s+/)
    .filter((t) => {
      if (t.length <= 1) return false;
      if (isHeaderWord(t)) return false;
      // Remove pure numbers
      if (/^\d+$/.test(t)) return false;
      // Remove document-number tokens like "1227/3", "1244/002", "CH01-3", "NF2024/01"
      if (/^[A-Z]{0,4}\d[\d\-/]{1,15}$/i.test(t)) return false;
      return true;
    })
    .join(" ")
    .trim();
}

/**
 * Extrai apenas o nome da empresa do texto antes do CNPJ.
 * Remove tudo a partir do primeiro valor monetário, data, número de documento
 * ou status — que são resíduos do registro anterior.
 */
function cleanSupplierName(raw: string): string {
  // Trunca no primeiro sinal de dado financeiro (resíduo do registro anterior)
  const noiseRe = /R\$|[\d]{2}\/[\d]{2}\/[\d]{4}|[\d]{2}\/[\d]{2}\/[\d]{2}|\bAberto\b|\bPago\b|\bLiquidado\b|\bFechado\b|\bAberta\b/i;
  const noiseMatch = raw.search(noiseRe);
  const trimmed = noiseMatch > 0 ? raw.slice(0, noiseMatch) : raw;

  // Remove tokens que parecem número de documento (ex: 1244/002, CH01-3)
  const withoutDocNums = trimmed.replace(/\b[A-Z]{0,4}\d[\w/-]{1,20}\b/gi, " ");

  return cleanName(withoutDocNums);
}

// ── ERP / freeform parser ─────────────────────────────────────────────────────

/**
 * Segments ERP-style text using CNPJ occurrences as record anchors.
 *
 * In ORTHOMAX-style reports, each record line looks like:
 *   EMPRESA CNPJ SACADO PHONE DOC_TYPE DOC_NUM DUE_DATE DAYS R$VALUE STATUS EMIT_DATE R$PAID
 */
export function parseErpFormat(text: string): RecordCandidate[] {
  const cnpjs = findAllCNPJ(text);
  if (cnpjs.length === 0) return [];

  const records: RecordCandidate[] = [];

  for (let i = 0; i < cnpjs.length; i++) {
    const { value: cnpjValue, index: cnpjStart } = cnpjs[i];
    const cnpjEnd = cnpjStart + cnpjValue.length;

    // Empresa name = text between previous record end and current CNPJ
    const prevEnd =
      i === 0 ? 0 : cnpjs[i - 1].index + cnpjs[i - 1].value.length;
    const beforeCnpj = text.slice(prevEnd, cnpjStart);

    // Tail = text from after CNPJ to start of next CNPJ
    const nextStart = cnpjs[i + 1]?.index ?? text.length;
    const tail = text.slice(cnpjEnd, nextStart);

    // ── Empresa ──────────────────────────────────────────────────────────────
    const supplier = cleanSupplierName(beforeCnpj).slice(0, 120) || null;

    // ── Phone ────────────────────────────────────────────────────────────────
    const phone = findFirstPhone(tail);

    // ── Client name (text before phone, or before first date) ────────────────
    let clientEnd = tail.length;
    if (phone) {
      clientEnd = tail.indexOf(phone);
    } else {
      const firstDateMatch = tail.match(new RegExp(DATE_RE.source));
      if (firstDateMatch) clientEnd = tail.indexOf(firstDateMatch[0]);
    }
    const clientRaw = tail.slice(0, clientEnd);
    const client = cleanName(clientRaw).slice(0, 120) || null;

    // ── Text after phone ─────────────────────────────────────────────────────
    const afterPhone = phone
      ? tail.slice(tail.indexOf(phone) + phone.length)
      : tail.slice(clientEnd);

    // ── Document type ────────────────────────────────────────────────────────
    const docTypeMatch = afterPhone.match(new RegExp(DOC_TYPE_RE.source, "i"));
    const docType = docTypeMatch
      ? docTypeMatch[0].replace(/\s+/g, " ").trim()
      : null;

    // ── Document number ──────────────────────────────────────────────────────
    let docNumber: string | null = null;
    if (docType) {
      const afterDocType = afterPhone
        .slice(
          afterPhone.toLowerCase().indexOf(docType.toLowerCase()) + docType.length,
        )
        .trim();
      // First "word" that looks like an ID: letters+digits with optional - or /
      const m = afterDocType.match(/^([A-Z]{0,4}\d[\w/-]{0,20})/i);
      docNumber = m ? m[1] : null;
    }
    if (!docNumber) {
      // Fallback: scan for codes like "4254-2", "CH01-3", "1243/002", "2427/5"
      // Exclude matches that look like date fragments (DD/MM or similar short slash patterns)
      const docFallbackRe =
        /\b([A-Z]{1,4}\d[\d-]{0,15}(?:\/\d{1,6})?|\d{3,}[-/]\d{1,}(?:[-/]\d{1,})?)\b/gi;
      for (const m of afterPhone.matchAll(docFallbackRe)) {
        const candidate = m[1];
        // Skip if it looks like DD/MM/YYYY or DD/MM
        if (/^\d{2}\/\d{2}(\/\d{4})?$/.test(candidate)) continue;
        // Skip pure short numbers (less than 3 chars — too ambiguous)
        if (candidate.replace(/\D/g, "").length < 2) continue;
        docNumber = candidate;
        break;
      }
    }

    // ── Dates ────────────────────────────────────────────────────────────────
    const dates = findAllDates(tail);
    const dueDate = dates[0] ?? null;

    // ── Currencies ───────────────────────────────────────────────────────────
    const currencies = findAllCurrencies(tail);
    const value = currencies[0] ?? null;
    const valuePaid =
      currencies.length > 1 ? currencies[currencies.length - 1] : null;

    // ── Status ───────────────────────────────────────────────────────────────
    const statusMatch = tail.match(new RegExp(STATUS_RE.source, "i"));
    const status = statusMatch ? statusMatch[0] : null;

    const record: RecordCandidate = {
      client,
      supplier,
      cnpj: cnpjValue,
      document: docNumber,
      dueDate,
      value,
      valuePaid,
      phone,
      status,
      docType,
      confidenceScore: 0,
      extractionMethod: "erp-cnpj-anchor",
    };
    record.confidenceScore = score(record);

    if (record.confidenceScore >= 30) records.push(record);
  }

  return records;
}

// ── Line-by-line freeform parser ──────────────────────────────────────────────

/**
 * For plain text (no CNPJ anchors, no delimiters) — parse line by line
 * looking for lines that each contain at least a date + value.
 */
export function parseLineByLine(text: string): RecordCandidate[] {
  const lines = text.split(/\n/).filter((l) => l.trim().length > 10);
  const records: RecordCandidate[] = [];

  for (const line of lines) {
    if (isHeaderLine(line)) continue;

    const dates = findAllDates(line);
    const currencies = findAllCurrencies(line);
    if (dates.length === 0 || currencies.length === 0) continue;

    const phone = findFirstPhone(line);
    const statusMatch = line.match(new RegExp(STATUS_RE.source, "i"));
    const docMatch = line.match(/\b([A-Z]{0,3}\d[\d-]{1,10}(?:\/\d{1,6})?)\b/i);

    // Client = longest run of words before the first date
    const beforeDate = line.slice(0, line.indexOf(dates[0]));
    const client = cleanName(beforeDate).slice(0, 120) || null;

    const record: RecordCandidate = {
      client,
      supplier: null,
      cnpj: null,
      document: docMatch ? docMatch[1] : null,
      dueDate: dates[0],
      value: currencies[0],
      valuePaid: currencies.length > 1 ? currencies[currencies.length - 1] : null,
      phone,
      status: statusMatch ? statusMatch[0] : null,
      docType: null,
      confidenceScore: 0,
      extractionMethod: "line-by-line",
    };
    record.confidenceScore = score(record);
    if (record.confidenceScore >= 30) records.push(record);
  }

  return records;
}

// ── Delimited (CSV / XLSX) parser ─────────────────────────────────────────────

export function parseDelimitedFormat(text: string): RecordCandidate[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());

  const sampleLines = lines.slice(0, 5);
  const delimiter = detectDelimiter(sampleLines);

  const headerIdx = lines.findIndex((l) => isHeaderLine(l));
  if (headerIdx < 0) return [];

  const map = buildColumnMap(lines[headerIdx], delimiter);
  if (Object.keys(map).length < 2) return [];

  const dataText = lines.slice(headerIdx + 1).join("\n");
  const rows: ParsedRow[] = parseRows(dataText, map, delimiter);

  return rows
    .map((row): RecordCandidate => {
      const valueRaw = row.fields.value ?? "";
      const currencyMatches = [...valueRaw.matchAll(new RegExp(CURRENCY_RE.source, "gi"))];
      const value =
        currencyMatches.length > 0
          ? parseBRLAmount(currencyMatches[0][1])
          : parseBRLAmount(valueRaw);

      const record: RecordCandidate = {
        client: row.fields.client?.trim() || null,
        supplier: row.fields.supplier?.trim() || null,
        cnpj: row.fields.cnpj?.trim() || null,
        document: row.fields.document?.trim() || null,
        dueDate: row.fields.dueDate?.trim() || null,
        value: Number.isFinite(value) && value > 0 ? value : null,
        valuePaid: null,
        phone: row.fields.phone?.replace(/\D/g, "") || null,
        status: row.fields.status?.trim() || null,
        docType: row.fields.docType?.trim() || null,
        confidenceScore: 0,
        extractionMethod: "delimited-table",
      };
      record.confidenceScore = score(record);
      return record;
    })
    .filter((r) => r.confidenceScore >= 50);
}
