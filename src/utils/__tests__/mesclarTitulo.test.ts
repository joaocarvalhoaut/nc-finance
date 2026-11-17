/**
 * Unit tests for mesclarTitulo.ts — título que chega na importação: novo,
 * duplicata (igual) ou atualização (muda algo, mantém o resto).
 * Run:  npx tsx src/utils/__tests__/mesclarTitulo.test.ts
 */

import type { Debtor } from "../../types";
import { separarImportacao } from "../mesclarTitulo";

let passed = 0;
let failed = 0;

function iguais(got: unknown, want: unknown, label: string) {
  if (JSON.stringify(got) === JSON.stringify(want)) { passed++; }
  else { failed++; console.error(`  ✗ ${label}\n    → ${JSON.stringify(got)}\n    esperado ${JSON.stringify(want)}`); }
}

const t = (over: Partial<Debtor>): Debtor => ({
  id: "x", client: "CARLOS MENDES ROCHA", supplier: "", document: "1439/005", dueDate: "25/10/2026",
  value: 100, phone: "", category: "vencidos", status: "pending", ...over,
});

// Título já gravado, com dados que o relatório não traz.
const gravado = t({
  id: "db-1", phone: "77999998888", notes: "pediu prazo", bank: "SICOOB", status: "sent",
  lastSentDate: "2026-11-10", lastSentMessage: "Olá…", cobradorId: "cob-1",
});

// 1. Mesmo título, nada mudou (relatório sem telefone): duplicata, nada gravado.
{
  const s = separarImportacao([t({ id: "ext-1", document: "DP 1439/005", client: "Carlos Mendes Rocha" })], [gravado]);
  iguais([s.novos.length, s.atualizar.length, s.iguais.length], [0, 0, 1], "igual → duplicata");
  iguais(s.iguais[0]?.id, "db-1", "duplicata devolve o título gravado");
}

// 2. Valor mudou: atualiza o valor e mantém telefone, notas, banco, situação, envio e cobrador.
{
  const s = separarImportacao([t({ id: "ext-1", value: 150 })], [gravado]);
  iguais([s.novos.length, s.atualizar.length, s.iguais.length], [0, 1, 0], "valor mudou → atualizar");
  const a = s.atualizar[0];
  iguais(
    [a.id, a.value, a.phone, a.notes, a.bank, a.status, a.lastSentDate, a.cobradorId],
    ["db-1", 150, "77999998888", "pediu prazo", "SICOOB", "sent", "2026-11-10", "cob-1"],
    "atualização mantém o que o arquivo não traz",
  );
}

// 3. Telefone novo no arquivo: atualiza o telefone.
{
  const s = separarImportacao([t({ phone: "(77) 98888-7777" })], [gravado]);
  iguais(s.atualizar[0]?.phone, "(77) 98888-7777", "telefone do arquivo vence");
}

// 4. Mesmo telefone em outro formato: duplicata.
{
  const s = separarImportacao([t({ phone: "(77) 99999-8888" })], [gravado]);
  iguais(s.iguais.length, 1, "mesmo número formatado → igual");
}

// 5. Documento novo do mesmo cliente e vencimento: título novo.
{
  const s = separarImportacao([t({ document: "1440/001" })], [gravado]);
  iguais([s.novos.length, s.atualizar.length, s.iguais.length], [1, 0, 0], "outro documento → novo");
}

// 6. Mesmo documento, outro vencimento (próxima parcela): novo.
{
  const s = separarImportacao([t({ dueDate: "25/11/2026" })], [gravado]);
  iguais(s.novos.length, 1, "outro vencimento → novo");
}

// 7. Mesmo documento e vencimento, outro cliente: novo.
{
  const s = separarImportacao([t({ client: "MARIA SOUZA" })], [gravado]);
  iguais(s.novos.length, 1, "outro cliente → novo");
}

// 8. Arquivado que volta no relatório: atualiza (volta para a lista) e conta.
{
  const arq = { ...gravado, archivedAt: "2026-11-01T00:00:00Z" };
  const s = separarImportacao([t({})], [arq]);
  iguais([s.atualizar.length, s.voltaram], [1, 1], "arquivado volta");
}

// 9. Cópia ativa e arquivada do mesmo título: vale a ativa.
{
  const arq = { ...gravado, id: "db-arq", archivedAt: "2026-11-01T00:00:00Z" };
  const s = separarImportacao([t({})], [arq, gravado]);
  iguais(s.iguais[0]?.id, "db-1", "ativa vence a arquivada");
}

// 10. Tipo mudou (a vencer → vencidos): atualiza.
{
  const s = separarImportacao([t({ category: "a_vencer" })], [gravado]);
  iguais(s.atualizar[0]?.category, "a_vencer", "tipo mudou → atualizar");
}

console.log(`\n  Tests: ${passed + failed}  ✓ passed: ${passed}  ✗ failed: ${failed}\n`);
if (failed > 0) process.exit(1);
