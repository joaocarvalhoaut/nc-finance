/**
 * Unit tests for regexExtractors.ts
 * Run:  npx tsx src/services/localDocumentExtraction/__tests__/regexExtractors.test.ts
 */

import {
  findAllCNPJ,
  findAllDates,
  findAllCurrencies,
  findFirstPhone,
  parseBRLAmount,
} from "../regexExtractors";

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

// ── findAllCNPJ ───────────────────────────────────────────────────────────────

section("findAllCNPJ");

const cnpjText = "Empresa 12.345.678/0001-90 e 98.765.432/0001-09 aqui.";
const cnpjs = findAllCNPJ(cnpjText);
assert(cnpjs.length === 2, `detects 2 CNPJs (got ${cnpjs.length})`);
assert(cnpjs[0].value === "12.345.678/0001-90", `first CNPJ value (got "${cnpjs[0].value}")`);
assert(cnpjs[0].index > 0, `CNPJ index > 0 (got ${cnpjs[0].index})`);

// CPF-formatted string must NOT match CNPJ
const cpfText = "CPF: 123.456.789-01 não é CNPJ";
assert(findAllCNPJ(cpfText).length === 0, "CPF not matched as CNPJ");

// 11-digit phone must NOT match CNPJ
assert(findAllCNPJ("tel: 11987654321").length === 0, "bare phone not matched as CNPJ");

assert(findAllCNPJ("sem numeros").length === 0, "empty match on plain text");

// ── findAllDates ──────────────────────────────────────────────────────────────

section("findAllDates");

const dateText = "Vencimentos: 10/05/2026 e 01/01/2027 e 31/12/2025";
const dates = findAllDates(dateText);
assert(dates.length === 3, `3 dates found (got ${dates.length})`);
assert(dates[0] === "10/05/2026", `first date (got "${dates[0]}")`);
assert(dates[2] === "31/12/2025", `last date (got "${dates[2]}")`);

// Partial date MM/YYYY must NOT match
assert(
  !findAllDates("vence em 05/2026 próximo mês").includes("05/2026"),
  "partial date MM/YYYY not matched",
);

assert(findAllDates("sem datas aqui").length === 0, "no false date matches");

// ── findAllCurrencies ─────────────────────────────────────────────────────────

section("findAllCurrencies");

const currencyText = "Valor: R$ 1.250,00 e R$ 3.400,75 e R$ 500,00";
const amounts = findAllCurrencies(currencyText);
assert(amounts.length === 3, `3 amounts found (got ${amounts.length})`);
assert(amounts[0] === 1250,    `R$1.250,00 → 1250 (got ${amounts[0]})`);
assert(amounts[1] === 3400.75, `R$3.400,75 → 3400.75 (got ${amounts[1]})`);
assert(amounts[2] === 500,     `R$500,00 → 500 (got ${amounts[2]})`);

// Zero amounts must be filtered out
const zeroText = "Pago: R$ 0,00 pendente R$ 750,00";
const zeroAmounts = findAllCurrencies(zeroText);
assert(zeroAmounts.length === 1, `zero amount filtered out (got ${zeroAmounts.length})`);
assert(zeroAmounts[0] === 750, `only 750 remains (got ${zeroAmounts[0]})`);

assert(findAllCurrencies("sem moeda").length === 0, "no false currency matches");

// ── findFirstPhone ────────────────────────────────────────────────────────────

section("findFirstPhone");

// Typical 11-digit Brazilian mobile
assert(findFirstPhone("cliente 11987654321 boleto") === "11987654321", "11-digit mobile found");

// 10-digit landline
assert(findFirstPhone("tel 1133334444 vencimento") === "1133334444", "10-digit landline found");

// CNPJ digits must NOT be returned as phone
const withCnpj = "51.382.654/0001-68 cliente 33988245284 venc";
assert(
  findFirstPhone(withCnpj) === "33988245284",
  `CNPJ excluded, phone returned (got "${findFirstPhone(withCnpj)}")`,
);

// CPF with separators must NOT be returned as phone
const withCpf = "123.456.789-01 fatura";
assert(findFirstPhone(withCpf) === null, `CPF not matched as phone (got "${findFirstPhone(withCpf)}")`);

// 9-digit number too short — must not match
assert(findFirstPhone("codigo 123456789 fim") === null, "9-digit code not matched as phone");

assert(findFirstPhone("sem telefone aqui") === null, "null when no phone");

// ── parseBRLAmount ────────────────────────────────────────────────────────────

section("parseBRLAmount");

assert(parseBRLAmount("1.250,00") === 1250,     `"1.250,00" → 1250`);
assert(parseBRLAmount("5.400,00") === 5400,     `"5.400,00" → 5400`);
assert(parseBRLAmount("715,66")   === 715.66,   `"715,66" → 715.66`);
assert(parseBRLAmount("760,20")   === 760.20,   `"760,20" → 760.20`);
assert(parseBRLAmount("2500.00")  === 2500,     `"2500.00" (en-US) → 2500`);
assert(parseBRLAmount("1800.50")  === 1800.5,   `"1800.50" (en-US) → 1800.5`);
assert(parseBRLAmount("R$ 500,00") === 500,     `"R$ 500,00" (with prefix) → 500`);
assert(parseBRLAmount("0,00")     === 0,        `"0,00" → 0`);

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${"═".repeat(62)}`);
console.log(`  Tests: ${passed + failed}  ✓ passed: ${passed}  ✗ failed: ${failed}`);
console.log(`${"═".repeat(62)}\n`);

if (failed > 0) process.exit(1);
