/**
 * brPhone — nono dígito e formato de envio para WhatsApp.
 *
 * Run:  npx tsx supabase/functions/_shared/__tests__/brPhone.test.ts
 *
 * Inclui os dois casos reais dos relatórios de ERP usados nos testes do parser:
 * FRANCISCO FERREIRA MOTA (celular sem o 9) e MENEZES E BATISTA (fixo).
 */

import { ensureNinthDigit, toWhatsappNumber } from "../brPhone.ts";

let passed = 0, failed = 0;
function eq(got: string, want: string, label: string) {
  if (got === want) { console.log(`  ✓ ${label} → ${got}`); passed++; }
  else { console.error(`  ✗ FAIL: ${label} — esperado "${want}", veio "${got}"`); failed++; process.exitCode = 1; }
}

console.log("\n══ ensureNinthDigit — celular sem o 9 ganha o 9 ═══════════");
eq(ensureNinthDigit("3399137848"),       "33999137848",   "Francisco (caso real do ERP)");
eq(ensureNinthDigit("33 9913-7848"),     "33999137848",   "com espaço e hífen");
eq(ensureNinthDigit("(77) 8812-3456"),   "77988123456",   "começa com 8");
eq(ensureNinthDigit("11 7012-3456"),     "11970123456",   "começa com 7");
eq(ensureNinthDigit("21 6012-3456"),     "21960123456",   "começa com 6");
eq(ensureNinthDigit("+55 77 9988-7720"), "5577999887720", "com DDI: mantém o 55");
eq(ensureNinthDigit("557799887720"),     "5577999887720", "DDI sem formatação");
eq(ensureNinthDigit("0 77 9988-7720"),   "77999887720",   "zero de discagem removido");

console.log("\n══ ensureNinthDigit — fixo NÃO ganha o 9 ═════════════════");
eq(ensureNinthDigit("3835721919"),       "3835721919",    "Menezes (caso real do ERP)");
eq(ensureNinthDigit("38 3572-1919"),     "38 3572-1919",  "fixo formatado fica intacto");
eq(ensureNinthDigit("11 2345-6789"),     "11 2345-6789",  "começa com 2");
eq(ensureNinthDigit("11 4004-1234"),     "11 4004-1234",  "começa com 4");
eq(ensureNinthDigit("553835721919"),     "553835721919",  "fixo com DDI");

console.log("\n══ ensureNinthDigit — o que já está certo fica intacto ═════");
eq(ensureNinthDigit("77 99988-7720"),    "77 99988-7720", "já tem o 9: formatação preservada");
eq(ensureNinthDigit("33988245284"),      "33988245284",   "Iderlandio (caso real, já com 9)");
eq(ensureNinthDigit("5577999887720"),    "5577999887720", "DDI + 9");
eq(ensureNinthDigit("0800 777 1234"),    "0800 777 1234", "0800 não é celular");
eq(ensureNinthDigit("12345"),            "12345",         "curto demais: intacto");
eq(ensureNinthDigit("sem telefone"),     "sem telefone",  "texto: intacto, não apaga");
eq(ensureNinthDigit(""),                 "",              "vazio");

console.log("\n══ toWhatsappNumber — formato de envio ════════════════════");
eq(toWhatsappNumber("33 9913-7848"),     "5533999137848", "celular antigo → 55 + 9");
eq(toWhatsappNumber("+55 77 9988-7720"), "5577999887720", "DDI sem 9 → ganha o 9");
eq(toWhatsappNumber("77 9 9988-7720"),   "5577999887720", "já com 9 → só prefixa 55");
eq(toWhatsappNumber("011 98765-4321"),   "5511987654321", "zero de discagem");
eq(toWhatsappNumber("(11) 98765-4321"),  "5511987654321", "parênteses");
eq(toWhatsappNumber("38 3572-1919"),     "553835721919",  "fixo: 55 sem 9");
eq(toWhatsappNumber("5577999887720"),    "5577999887720", "já no formato final");

console.log(`\n══════════════════════════════════════════════════════════`);
console.log(`  Tests: ${passed + failed}  ✓ passed: ${passed}  ✗ failed: ${failed}`);
console.log(`══════════════════════════════════════════════════════════\n`);
