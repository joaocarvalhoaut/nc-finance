/**
 * sanitize.ts — mascaramento de PII antes de log/DB/response.
 * Crítico (LGPD): nenhuma dessas saídas pode conter telefone/CPF/token completo.
 *
 * Run:  npx tsx supabase/functions/_shared/__tests__/sanitize.test.ts
 */

import { maskPhone, messagePreview, maskToken, maskCpf, maskCnpj, sanitizeError } from "../sanitize.ts";

let passed = 0, failed = 0;
function eq(got: unknown, want: unknown, label: string) {
  if (got === want) { console.log(`  ✓ ${label} → ${String(got)}`); passed++; }
  else { console.error(`  ✗ FAIL: ${label} — esperado "${String(want)}", veio "${String(got)}"`); failed++; process.exitCode = 1; }
}
function truthy(cond: boolean, label: string) {
  if (cond) { console.log(`  ✓ ${label}`); passed++; }
  else { console.error(`  ✗ FAIL: ${label}`); failed++; process.exitCode = 1; }
}

console.log("\n══ maskPhone ══════════════════════════════════════════════");
eq(maskPhone("5511987654321"), "5511******321", "13 dígitos");
eq(maskPhone("11987654321"),   "1198****321",   "11 dígitos");
eq(maskPhone("123456"),         "123***",        "6 dígitos");
eq(maskPhone("12345"),          "***",           "curto → ***");
truthy(!maskPhone("5511987654321").includes("987654"), "não vaza o miolo do número");

console.log("\n══ messagePreview ═════════════════════════════════════════");
eq(messagePreview("vou pagar amanhã"), "vou pagar amanhã", "curta mantém");
eq(messagePreview("  espaços  "),      "espaços",          "trim");
eq(messagePreview(""),                  "",                 "vazio");
eq(messagePreview("abcdefghij", 5),     "abcde…",           "trunca com reticências");

console.log("\n══ maskToken / maskCpf / maskCnpj ═════════════════════════");
eq(maskToken("abcdef123456"),        "abcd...3456",          "token longo");
eq(maskToken("ab"),                   "***",                 "token curto → ***");
eq(maskCpf("123.456.789-01"),        "123.xxx.xxx-xx",       "CPF");
eq(maskCnpj("12.345.678/0001-90"),   "12.345.xxx/xxxx-xx",   "CNPJ");

console.log("\n══ sanitizeError ══════════════════════════════════════════");
eq(sanitizeError("auth: Bearer abc123XYZ"), "auth: Bearer ***", "Bearer token");
eq(sanitizeError("falha CPF 123.456.789-01 invalido"), "falha CPF ***.***.***-** invalido", "CPF no erro");
truthy(!sanitizeError("erro ao enviar p/ 5511987654321").includes("987654"), "telefone no erro é mascarado");
eq(sanitizeError(""), "", "vazio");

console.log(`\n══════════════════════════════════════════════════════════`);
console.log(`  Tests: ${passed + failed}  ✓ passed: ${passed}  ✗ failed: ${failed}`);
console.log(`══════════════════════════════════════════════════════════\n`);
