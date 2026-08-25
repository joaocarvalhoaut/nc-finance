/**
 * isOptOutMessage — detecta pedidos de "não me contate" do devedor.
 * Crítico: falso negativo = continua cobrando quem pediu pra parar (ban + LGPD);
 *          falso positivo = para de cobrar quem não pediu.
 *
 * Run:  npx tsx supabase/functions/_shared/__tests__/optOut.test.ts
 */

import { isOptOutMessage } from "../optOut.ts";

let passed = 0, failed = 0;
function eq(got: boolean, want: boolean, label: string) {
  if (got === want) { console.log(`  ✓ ${label}`); passed++; }
  else { console.error(`  ✗ FAIL: ${label} — esperado ${want}, veio ${got}`); failed++; process.exitCode = 1; }
}

console.log("\n══ isOptOutMessage — deve detectar (true) ═════════════════");
eq(isOptOutMessage("PARE"),                 true, "PARE");
eq(isOptOutMessage("pare de me mandar msg"), true, "pare no meio da frase");
eq(isOptOutMessage("quero cancelar"),        true, "cancelar");
eq(isOptOutMessage("me tira dessa lista"),   true, "me tira (multipalavra)");
eq(isOptOutMessage("não perturbe"),          true, "acento normalizado");
eq(isOptOutMessage("STOP"),                  true, "stop em maiúsculas");
eq(isOptOutMessage("nao quero mais"),        true, "nao quero");

console.log("\n══ isOptOutMessage — NÃO deve detectar (false) ════════════");
eq(isOptOutMessage("já foi separado o pagamento"), false, "'separado' não casa 'pare'");
eq(isOptOutMessage("vou pagar amanhã"),      false, "mensagem normal");
eq(isOptOutMessage(""),                       false, "vazio");
eq(isOptOutMessage("obrigado pelo contato"), false, "sem palavra-chave");

console.log(`\n══════════════════════════════════════════════════════════`);
console.log(`  Tests: ${passed + failed}  ✓ passed: ${passed}  ✗ failed: ${failed}`);
console.log(`══════════════════════════════════════════════════════════\n`);
