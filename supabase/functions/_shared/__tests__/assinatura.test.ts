/**
 * Unit tests for assinatura.ts ({empresa} na assinatura das cobranças).
 * Run:  npx tsx supabase/functions/_shared/__tests__/assinatura.test.ts
 */

import { aplicarEmpresa } from "../assinatura.ts";

let passed = 0;
let failed = 0;

function iguais(got: string, want: string, label: string) {
  if (got === want) { passed++; }
  else { failed++; console.error(`  ✗ ${label} → ${JSON.stringify(got)} (esperado ${JSON.stringify(want)})`); }
}

iguais(aplicarEmpresa("Equipe financeira {empresa}.", "Móveis Silva"), "Equipe financeira Móveis Silva.", "com nome");
iguais(aplicarEmpresa("Equipe financeira {empresa}.", ""), "Equipe financeira.", "sem nome: some com o espaço");
iguais(aplicarEmpresa("Equipe financeira {empresa}.", null), "Equipe financeira.", "nome nulo");
iguais(aplicarEmpresa("Equipe financeira {empresa}.", "   "), "Equipe financeira.", "nome só com espaços");
iguais(aplicarEmpresa("Equipe {empresa}.\nAtt, {empresa}", "Silva"), "Equipe Silva.\nAtt, Silva", "várias ocorrências");
iguais(aplicarEmpresa("Linha 1\n{empresa}", ""), "Linha 1\n", "sozinho na linha não come a quebra");
iguais(aplicarEmpresa("Sem placeholder.", "Silva"), "Sem placeholder.", "texto sem {empresa}");
iguais(aplicarEmpresa("Equipe financeira {empresa}.", "  Silva  "), "Equipe financeira Silva.", "nome com espaços nas pontas");

console.log(`\n  Tests: ${passed + failed}  ✓ passed: ${passed}  ✗ failed: ${failed}\n`);
if (failed > 0) process.exit(1);
