/**
 * normalizePhone / validatePhone — normalização e validação de celular BR.
 * Crítico: telefone errado = cobrança falha ou vai pra pessoa errada.
 *
 * Run:  npx tsx supabase/functions/_shared/__tests__/phone.test.ts
 */

import { normalizePhone, validatePhone } from "../zapi.ts";

let passed = 0, failed = 0;
function eq(got: unknown, want: unknown, label: string) {
  if (got === want) { console.log(`  ✓ ${label} → ${String(got)}`); passed++; }
  else { console.error(`  ✗ FAIL: ${label} — esperado "${String(want)}", veio "${String(got)}"`); failed++; process.exitCode = 1; }
}

console.log("\n══ normalizePhone ═════════════════════════════════════════");
eq(normalizePhone("77 9 9988-7720"),   "5577999887720", "11 dígitos → prefixa 55");
eq(normalizePhone("5577999887720"),    "5577999887720", "13 dígitos → mantém");
eq(normalizePhone("+55 77 9988-7720"), "557799887720",  "12 dígitos (DDI) → mantém");
eq(normalizePhone("011 98765-4321"),   "5511987654321", "zero inicial removido + prefixa 55");
eq(normalizePhone("(11) 98765-4321"),  "5511987654321", "pontuação/parênteses ignorados");

console.log("\n══ validatePhone ═════════════════════════════════════════");
eq(validatePhone("5577999887720"), true,  "13 dígitos 55 + DDD + 9 dígitos");
eq(validatePhone("557799887720"),  true,  "12 dígitos 55 + DDD + 8 dígitos");
eq(validatePhone("12345"),         false, "curto demais");
eq(validatePhone("6677999887720"), false, "não começa com 55");
eq(validatePhone("55779998877200"), false, "longo demais (14)");

console.log("\n══ normalize → validate (ponta a ponta) ═══════════════════");
eq(validatePhone(normalizePhone("77 9 9988-7720")), true, "entrada humana vira número válido");

console.log(`\n══════════════════════════════════════════════════════════`);
console.log(`  Tests: ${passed + failed}  ✓ passed: ${passed}  ✗ failed: ${failed}`);
console.log(`══════════════════════════════════════════════════════════\n`);
