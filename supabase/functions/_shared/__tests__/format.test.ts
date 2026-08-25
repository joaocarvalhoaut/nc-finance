/**
 * TDD — formatBRL: formata valores monetários para o padrão brasileiro,
 * usado no template de cobrança (WhatsApp Cloud) e em qualquer texto de valor.
 *
 * Run:  npx tsx supabase/functions/_shared/__tests__/format.test.ts
 *
 * Escrito ANTES da implementação (red → green). Regras esperadas:
 *  - sempre 2 casas decimais, vírgula decimal, ponto de milhar, prefixo "R$ ".
 *  - arredonda para o centavo mais próximo.
 *  - entradas inválidas (NaN, Infinity, null/undefined) → "R$ 0,00" (nunca quebra a cobrança).
 *  - negativos preservam o sinal antes do "R$".
 */

import { formatBRL } from "../format.ts";

let passed = 0, failed = 0;
function eq(got: string, want: string, label: string) {
  if (got === want) { console.log(`  ✓ ${label} → ${got}`); passed++; }
  else { console.error(`  ✗ FAIL: ${label} — esperado "${want}", veio "${got}"`); failed++; process.exitCode = 1; }
}

console.log("\n══ formatBRL ══════════════════════════════════════════════");

// Casos base
eq(formatBRL(0),        "R$ 0,00",        "zero");
eq(formatBRL(1),        "R$ 1,00",        "unidade");
eq(formatBRL(1250),     "R$ 1.250,00",    "milhar");
eq(formatBRL(1250.5),   "R$ 1.250,50",    "uma casa decimal → duas");
eq(formatBRL(5400),     "R$ 5.400,00",    "milhar redondo");
eq(formatBRL(715.66),   "R$ 715,66",      "centavos exatos");
eq(formatBRL(1234567.89), "R$ 1.234.567,89", "milhões");

// Arredondamento ao centavo (casos representáveis, sem ambiguidade de float)
eq(formatBRL(1.999),    "R$ 2,00",        "arredonda p/ cima");
eq(formatBRL(1.994),    "R$ 1,99",        "arredonda p/ baixo");
eq(formatBRL(0.1 + 0.2), "R$ 0,30",       "absorve ruído de float (0.30000000004)");

// Negativos
eq(formatBRL(-99.9),    "-R$ 99,90",      "negativo preserva sinal");

// Entradas inválidas → nunca quebra a cobrança
eq(formatBRL(Number.NaN),        "R$ 0,00", "NaN → zero");
eq(formatBRL(Number.POSITIVE_INFINITY), "R$ 0,00", "Infinity → zero");
// @ts-expect-error — testando robustez com tipo inválido
eq(formatBRL(null),     "R$ 0,00",        "null → zero");
// @ts-expect-error — testando robustez com tipo inválido
eq(formatBRL(undefined), "R$ 0,00",       "undefined → zero");

console.log(`\n══════════════════════════════════════════════════════════`);
console.log(`  Tests: ${passed + failed}  ✓ passed: ${passed}  ✗ failed: ${failed}`);
console.log(`══════════════════════════════════════════════════════════\n`);
