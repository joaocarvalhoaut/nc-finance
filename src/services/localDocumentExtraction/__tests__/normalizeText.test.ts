/**
 * Unit tests for normalizeText.ts
 * Run:  npx tsx src/services/localDocumentExtraction/__tests__/normalizeText.test.ts
 */

import { normalizeText, assessTextQuality, looksLikeDelimited } from "../normalizeText";

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

// ── normalizeText ─────────────────────────────────────────────────────────────

section("normalizeText — basic whitespace");

assert(
  normalizeText("  hello   world  ") === "hello world",
  "collapses horizontal whitespace and trims",
);

assert(
  normalizeText("line1\r\nline2\rline3") === "line1\nline2\nline3",
  "normalises CR+LF and bare CR to LF",
);

assert(
  normalizeText("a\n\n\n\nb") === "a\n\nb",
  "collapses 3+ blank lines to max 1",
);

section("normalizeText — noise line removal");

const noiseInput = `Página 1
Dados de cobrança
Impresso em 07/05/2026
www.empresa.com.br
-----------
Empresa;Sacado;Valor`;

const noiseOut = normalizeText(noiseInput);
assert(!noiseOut.includes("Página 1"),       "drops 'Página N' line");
assert(!noiseOut.includes("Impresso em"),     "drops 'Impresso em' line");
assert(!noiseOut.includes("www."),            "drops URL line");
assert(!noiseOut.includes("---"),             "drops separator line");
assert(noiseOut.includes("Dados de cobrança"), "keeps regular data line");
assert(noiseOut.includes("Empresa;Sacado"),   "keeps header line");

section("normalizeText — page number format");

// "1/5" style page counter must be dropped
const pageCounter = "CLIENTE ABC\n1/5\nVALOR R$ 500,00";
const pageOut = normalizeText(pageCounter);
assert(!pageOut.includes("1/5"), "drops '1/5' page counter line");
assert(pageOut.includes("CLIENTE ABC"), "keeps client line");

// ── assessTextQuality ─────────────────────────────────────────────────────────

section("assessTextQuality");

assert(assessTextQuality("") === "empty",     "empty string → 'empty'");
assert(assessTextQuality("   ") === "empty",  "whitespace only → 'empty'");
assert(assessTextQuality("ab") === "empty",   "< 20 chars → 'empty'");

// 19 non-space chars → empty (threshold is 20)
assert(assessTextQuality("a".repeat(19)) === "empty", "19 chars → 'empty'");
// 20 non-space chars but only 1 page → 20/1=20 < 80 → 'poor'
assert(assessTextQuality("a".repeat(20)) === "poor",  "20 chars, 1 page → 'poor'");

// 80 chars/page threshold
assert(
  assessTextQuality("a".repeat(80), 1) === "good",
  "exactly 80 chars/page → 'good'",
);
assert(
  assessTextQuality("a".repeat(79), 1) === "poor",
  "79 chars/page → 'poor'",
);

// Multi-page
const twoPageText = "a".repeat(160);
assert(
  assessTextQuality(twoPageText, 2) === "good",
  "160 chars / 2 pages = 80/page → 'good'",
);
assert(
  assessTextQuality(twoPageText, 3) === "poor",
  "160 chars / 3 pages ≈ 53/page → 'poor'",
);

// Realistic financial text
const financialText = `EMPRESA ALFA LTDA 12.345.678/0001-90 JOAO SILVA 11987654321
Duplicata Mercantil NF-001 20/05/2026 R$ 1.500,00 Aberto`;
assert(
  assessTextQuality(financialText, 1) === "good",
  "realistic ERP line → 'good'",
);

// ── looksLikeDelimited ────────────────────────────────────────────────────────

section("looksLikeDelimited");

const csvSemicolon = `Empresa;Sacado;Vencimento;Valor
EMPRESA;CLIENTE;10/06/2026;R$ 800,00`;
assert(looksLikeDelimited(csvSemicolon), "semicolon CSV detected");

const csvTab = `Empresa\tSacado\tVencimento\tValor
EMPRESA\tCLIENTE\t10/06/2026\tR$ 800,00`;
assert(looksLikeDelimited(csvTab), "tab-delimited CSV detected");

const csvPipe = `Empresa|Cliente|Titulo|Vencimento|Valor
EMPRESA|JOAO|DOC-001|15/06/2026|R$ 500,00`;
assert(looksLikeDelimited(csvPipe), "pipe-delimited CSV detected");

// Plain ERP text must NOT be detected as delimited
const erpText = `EMPRESA ALFA 12.345.678/0001-90 JOAO SILVA 11987654321
Duplicata Mercantil NF-001 20/05/2026 R$ 1.500,00 Aberto`;
assert(!looksLikeDelimited(erpText), "ERP text not classified as delimited");

// Text with delimiter but missing header keywords → not delimited
const fakeDelimited = `alpha;beta;gamma
one;two;three`;
assert(!looksLikeDelimited(fakeDelimited), "delimiter without header keywords not classified as CSV");

// Only 1 header keyword (needs >= 2)
const oneKeyword = `empresa;coluna2;coluna3
EMPRESA A;x;y`;
assert(!looksLikeDelimited(oneKeyword), "only 1 header keyword → not delimited");

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${"═".repeat(62)}`);
console.log(`  Tests: ${passed + failed}  ✓ passed: ${passed}  ✗ failed: ${failed}`);
console.log(`${"═".repeat(62)}\n`);

if (failed > 0) process.exit(1);
