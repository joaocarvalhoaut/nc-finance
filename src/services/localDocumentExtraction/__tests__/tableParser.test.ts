/**
 * Unit tests for tableParser.ts
 * Run:  npx tsx src/services/localDocumentExtraction/__tests__/tableParser.test.ts
 */

import {
  isHeaderLine,
  detectDelimiter,
  buildColumnMap,
  parseRows,
} from "../tableParser";

// ── Helpers ───────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(cond: boolean, label: string) {
  if (cond) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${label}`);
    failed++;
    process.exitCode = 1;
  }
}

function section(title: string) {
  console.log(`\n══ ${title} ${"═".repeat(Math.max(0, 60 - title.length))}`);
}

// ── isHeaderLine ──────────────────────────────────────────────────────────────

section("isHeaderLine");

assert(isHeaderLine("Empresa;Sacado;Vencimento;Valor"),         "semicolon header (pt)");
assert(isHeaderLine("empresa;sacado;vencimento;valor"),         "lowercase header");
assert(isHeaderLine("Empresa\tCliente\tTítulo\tVencimento"),    "tab header with accents");
assert(isHeaderLine("Fornecedor;Sacado;CNPJ;Documento;Vencimento;Valor"), "6-col header");
assert(isHeaderLine("Cliente,Documento,Vencimento,Valor"),      "comma header");

// Lines with only 1 keyword must NOT be headers
assert(!isHeaderLine("Empresa: ALFA LTDA"),    "single keyword not a header");
assert(!isHeaderLine("data: 07/05/2026"),      "date line not a header");
assert(!isHeaderLine("JOAO SILVA 10/05/2026 R$ 715,66 Aberto"), "data row not a header");
assert(!isHeaderLine(""),                      "empty string not a header");

// ── detectDelimiter ───────────────────────────────────────────────────────────

section("detectDelimiter");

const semiLines   = ["Empresa;Sacado;Valor", "ALFA;JOAO;1000"];
const tabLines    = ["Empresa\tSacado\tValor", "ALFA\tJOAO\t1000"];
const commaLines  = ["Empresa,Sacado,Valor", "ALFA,JOAO,1000"];
const pipeLines   = ["Empresa|Sacado|Valor", "ALFA|JOAO|1000"];

assert(detectDelimiter(semiLines)  === ";",  "detects semicolon");
assert(detectDelimiter(tabLines)   === "\t", "detects tab");
assert(detectDelimiter(commaLines) === ",",  "detects comma");
assert(detectDelimiter(pipeLines)  === "|",  "detects pipe");

// Mixed — semicolons win (more splits)
const mixedLines = ["Empresa;Sacado;Valor,extra", "ALFA;JOAO;1000,x"];
assert(detectDelimiter(mixedLines) === ";", "semicolon wins over comma in mixed");

// ── buildColumnMap ────────────────────────────────────────────────────────────

section("buildColumnMap");

const header1 = "Empresa;Sacado;CNPJ/CPF;Telefone;Título;Vencimento;Valor;Estado";
const map1 = buildColumnMap(header1, ";");

assert(map1.supplier === 0,  `supplier at col 0 (got ${map1.supplier})`);
assert(map1.client   === 1,  `client at col 1 (got ${map1.client})`);
assert(map1.cnpj     === 2,  `cnpj at col 2 (got ${map1.cnpj})`);
assert(map1.phone    === 3,  `phone at col 3 (got ${map1.phone})`);
assert(map1.document === 4,  `document at col 4 (got ${map1.document})`);
assert(map1.dueDate  === 5,  `dueDate at col 5 (got ${map1.dueDate})`);
assert(map1.value    === 6,  `value at col 6 (got ${map1.value})`);
assert(map1.status   === 7,  `status at col 7 (got ${map1.status})`);

// Alternative keyword aliases
const header2 = "Fornecedor\tCliente\tDocumento\tVcto\tSaldo";
const map2 = buildColumnMap(header2, "\t");
assert(map2.supplier === 0, "Fornecedor → supplier");
assert(map2.client   === 1, "Cliente → client");
assert(map2.document === 2, "Documento → document");
assert(map2.dueDate  === 3, "Vcto → dueDate");
assert(map2.value    === 4, "Saldo → value");

// Unknown columns should not appear in map
const header3 = "Empresa;Observacao;Valor";
const map3 = buildColumnMap(header3, ";");
assert(!("observacao" in map3), "unknown column not mapped");
assert(map3.value === 2, "known column still mapped correctly");

// ── parseRows ────────────────────────────────────────────────────────────────

section("parseRows");

const csvData = `EMPRESA ABC;JOAO DA SILVA;15/06/2026;R$ 1.250,00;Aberto
EMPRESA ABC;MARIA SOUZA;20/06/2026;R$ 875,50;Aberto
EMPRESA XYZ;CARLOS MOTTA;01/07/2026;R$ 3.000,00;Vencido`;

const colMap = { supplier: 0, client: 1, dueDate: 2, value: 3, status: 4 };
const rows = parseRows(csvData, colMap, ";");

assert(rows.length === 3, `3 data rows parsed (got ${rows.length})`);
assert(rows[0].fields.client   === "JOAO DA SILVA",  `row[0].client (got "${rows[0].fields.client}")`);
assert(rows[0].fields.dueDate  === "15/06/2026",     `row[0].dueDate (got "${rows[0].fields.dueDate}")`);
assert(rows[0].fields.value    === "R$ 1.250,00",    `row[0].value (got "${rows[0].fields.value}")`);
assert(rows[0].fields.status   === "Aberto",         `row[0].status (got "${rows[0].fields.status}")`);
assert(rows[0].fields.supplier === "EMPRESA ABC",    `row[0].supplier (got "${rows[0].fields.supplier}")`);
assert(rows[2].fields.status   === "Vencido",        `row[2].status = Vencido (got "${rows[2].fields.status}")`);

// Header line embedded in data should be skipped
const withHeaderInData = `EMPRESA;SACADO;VENCIMENTO;VALOR
EMPRESA ABC;JOAO;15/06/2026;R$ 500,00`;
const map4 = { supplier: 0, client: 1, dueDate: 2, value: 3 };
const rows4 = parseRows(withHeaderInData, map4, ";");
assert(rows4.length === 1, `header row skipped, 1 data row (got ${rows4.length})`);

// Empty lines should be ignored
const withBlanks = `EMPRESA A;JOAO;15/06/2026;R$ 500,00\n\n\nEMPRESA B;MARIA;20/06/2026;R$ 700,00`;
const rows5 = parseRows(withBlanks, map4, ";");
assert(rows5.length === 2, `blank lines skipped, 2 rows (got ${rows5.length})`);

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${"═".repeat(62)}`);
console.log(`  Tests: ${passed + failed}  ✓ passed: ${passed}  ✗ failed: ${failed}`);
console.log(`${"═".repeat(62)}\n`);

if (failed > 0) process.exit(1);
