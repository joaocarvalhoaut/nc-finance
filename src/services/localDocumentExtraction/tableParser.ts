/**
 * Tabular data parser for delimited text (CSV / XLSX-derived).
 *
 * Detects the header line, maps column names to canonical field names,
 * and extracts rows as key→value objects.
 */

/** Canonical field names we want to produce. */
export type FieldName =
  | "client"
  | "supplier"
  | "cnpj"
  | "document"
  | "dueDate"
  | "value"
  | "phone"
  | "status"
  | "docType"
  | "bank";

/** Header keywords that map to canonical field names */
const HEADER_ALIASES: Record<FieldName, string[]> = {
  client: ["sacado", "cliente", "devedor", "nome", "razao social", "razão social"],
  supplier: ["empresa", "fornecedor", "emissor", "sacador", "cedente"],
  cnpj: ["cnpj", "cpf", "cnpj/cpf"],
  document: ["titulo", "título", "n°", "no titulo", "documento", "nosso numero", "boleto", "titulo/numero"],
  dueDate: ["vencimento", "vcto", "vecto", "data venc"],
  value: ["valor", "saldo", "total", "valor titulo", "valor original"],
  phone: ["telefone", "fone", "celular", "tel", "contato"],
  status: ["estado", "situacao", "situação", "status"],
  docType: ["tipo", "especie", "espécie", "tipo titulo"],
  bank: ["banco", "bank", "instituicao", "instituição", "inst. financeira"],
};

/** Mapping from column index to field name */
export type ColumnMap = Partial<Record<FieldName, number>>;

/** Parsed table row */
export interface ParsedRow {
  raw: string[];
  fields: Partial<Record<FieldName, string>>;
}

function deaccent(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** Return true if a line looks like a header row. */
export function isHeaderLine(line: string): boolean {
  const norm = deaccent(line);
  // A line with an actual date (DD/MM/YYYY) or currency amount (R$) is a data
  // line even if it contains words like "titulo" or "vencimento".
  if (/\d{2}\/\d{2}\/\d{4}/.test(norm) || /r\$/.test(norm)) return false;
  let hits = 0;
  for (const aliases of Object.values(HEADER_ALIASES)) {
    if (aliases.some((a) => norm.includes(a))) hits++;
  }
  return hits >= 2;
}

/** Detect the best column delimiter for a set of sample lines. */
export function detectDelimiter(lines: string[]): string {
  const candidates = [";", "\t", ",", "|"];
  let best = ";";
  let bestAvg = 0;
  for (const d of candidates) {
    const avg =
      lines.reduce((s, l) => s + l.split(d).length, 0) / Math.max(lines.length, 1);
    if (avg > bestAvg) {
      bestAvg = avg;
      best = d;
    }
  }
  return best;
}

/** Build a ColumnMap from a header line and delimiter. */
export function buildColumnMap(headerLine: string, delimiter: string): ColumnMap {
  const cells = headerLine.split(delimiter);
  const map: ColumnMap = {};
  cells.forEach((cell, idx) => {
    const norm = deaccent(cell);
    for (const [field, aliases] of Object.entries(HEADER_ALIASES) as [FieldName, string[]][]) {
      if (!(field in map) && aliases.some((a) => norm.includes(a))) {
        map[field] = idx;
      }
    }
  });
  return map;
}

/**
 * Parse a block of delimited text given a ColumnMap.
 * Skips header lines automatically.
 */
export function parseRows(text: string, map: ColumnMap, delimiter: string): ParsedRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const rows: ParsedRow[] = [];

  for (const line of lines) {
    if (isHeaderLine(line)) continue;
    const cells = line.split(delimiter);
    const fields: Partial<Record<FieldName, string>> = {};
    for (const [field, idx] of Object.entries(map) as [FieldName, number][]) {
      const val = (cells[idx] ?? "").trim();
      if (val) fields[field] = val;
    }
    if (Object.keys(fields).length > 0) {
      rows.push({ raw: cells, fields });
    }
  }
  return rows;
}
