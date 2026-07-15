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
  // Uma linha com data real (qualquer separador, ano 2 ou 4 dígitos, ou ISO)
  // ou valor monetário (com R$ ou em formato BR "1.234,56") é linha de DADOS,
  // mesmo que contenha palavras como "titulo" ou "vencimento".
  if (
    /\d{2}[/\-.]\d{2}[/\-.]\d{2,4}/.test(norm) ||
    /\d{4}-\d{2}-\d{2}/.test(norm) ||
    /r\$/.test(norm) ||
    /\b\d{1,3}(?:\.\d{3})*,\d{2}\b/.test(norm)
  ) {
    return false;
  }
  let hits = 0;
  for (const aliases of Object.values(HEADER_ALIASES)) {
    if (aliases.some((a) => norm.includes(a))) hits++;
  }
  return hits >= 2;
}

/**
 * Divide uma linha delimitada respeitando aspas duplas (padrão CSV):
 * `"MOVEIS, LTDA",123` com delimitador "," → ["MOVEIS, LTDA", "123"].
 * Aspas duplas escapadas ("") viram uma aspa literal.
 */
export function splitDelimitedLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === delimiter && !inQuotes) {
      cells.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  cells.push(cur);
  return cells;
}

/** Detect the best column delimiter for a set of sample lines. */
export function detectDelimiter(lines: string[]): string {
  const candidates = [";", "\t", ",", "|"];
  // Vírgula decimal ("4.512,80") não conta como separador de coluna — senão
  // arquivos com valores BR em várias colunas elegeriam "," erroneamente.
  const countCells = (line: string, d: string): number =>
    d === ","
      ? (line.match(/(?<!\d),(?!\d)/g)?.length ?? 0) + 1
      : line.split(d).length;

  let best = ";";
  let bestAvg = 0;
  for (const d of candidates) {
    const avg =
      lines.reduce((s, l) => s + countCells(l, d), 0) / Math.max(lines.length, 1);
    if (avg > bestAvg) {
      bestAvg = avg;
      best = d;
    }
  }
  return best;
}

/** Build a ColumnMap from a header line and delimiter. */
export function buildColumnMap(headerLine: string, delimiter: string): ColumnMap {
  const cells = splitDelimitedLine(headerLine, delimiter);
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
    const cells = splitDelimitedLine(line, delimiter);
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
