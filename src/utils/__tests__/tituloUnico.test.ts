/**
 * Unit tests for tituloUnico.ts (mesmo cliente + documento + vencimento = mesmo título).
 * Run:  npx tsx src/utils/__tests__/tituloUnico.test.ts
 */

import type { Debtor } from "../../types";
import { chaveDoTitulo, docBase, repetidosNaCarteira, semRepetidos } from "../tituloUnico";

let passed = 0;
let failed = 0;

function iguais(got: unknown, want: unknown, label: string) {
  if (JSON.stringify(got) === JSON.stringify(want)) { passed++; }
  else { failed++; console.error(`  ✗ ${label}\n    → ${JSON.stringify(got)}\n    esperado ${JSON.stringify(want)}`); }
}

const t = (over: Partial<Debtor>): Debtor => ({
  id: "x", client: "OSCAR SANTANA DO CARMO", supplier: "", document: "1439/005", dueDate: "25/10/2026",
  value: 100, phone: "", category: "a_vencer", status: "pending", ...over,
});

// ── Documento pelos números ──────────────────────────────────────────────────
iguais(docBase("DP 1439/005"), "1439005", "prefixo DP sai");
iguais(docBase("'1439/005"), "1439005", "apóstrofo do Excel sai");
iguais(docBase("ABC"), "ABC", "sem número: letras");
iguais(docBase(""), "", "vazio");

// ── Mesmo título ─────────────────────────────────────────────────────────────
iguais(chaveDoTitulo(t({ document: "DP 1439/005" })) === chaveDoTitulo(t({})), true, "DP 1439/005 = 1439/005 (mesmo cliente e venc.)");
iguais(chaveDoTitulo(t({ client: "  oscar  santana do carmo " })) === chaveDoTitulo(t({})), true, "nome: caixa e espaços não importam");
iguais(chaveDoTitulo(t({ client: "OSCAR SANTANA DO CÁRMO" })) === chaveDoTitulo(t({})), true, "nome: acento não importa");
iguais(chaveDoTitulo(t({ dueDate: "25/11/2026" })) === chaveDoTitulo(t({})), false, "outro vencimento: outro título");
iguais(chaveDoTitulo(t({ client: "MARIA" })) === chaveDoTitulo(t({})), false, "outro cliente: outro título");
iguais(chaveDoTitulo(t({ document: "" })), null, "sem documento: sem chave");

// ── Lote ─────────────────────────────────────────────────────────────────────
const lote = semRepetidos([t({ id: "a" }), t({ id: "b", document: "DP 1439/005" }), t({ id: "c", dueDate: "25/11/2026" }), t({ id: "d", document: "" }), t({ id: "e", document: "" })]);
iguais(lote.lista.map((d) => d.id), ["a", "c", "d", "e"], "fica o primeiro; sem documento não é cortado");
iguais(lote.removidos, 1, "um removido");

// ── Carteira ─────────────────────────────────────────────────────────────────
const grupos = repetidosNaCarteira([
  t({ id: "velho", updatedAt: "2026-11-01T10:00:00Z" }),
  t({ id: "novo", document: "DP 1439/005", updatedAt: "2026-11-05T10:00:00Z" }),
  t({ id: "pago", document: "5226", client: "ANA", category: "liquidado", updatedAt: "2026-10-01T10:00:00Z" }),
  t({ id: "aberto", document: "5226", client: "ANA", category: "vencidos", updatedAt: "2026-11-05T10:00:00Z" }),
  t({ id: "sozinho", document: "999" }),
]);
iguais(grupos.map((g) => [g.fica.id, g.saem.map((d) => d.id)]), [["novo", ["velho"]], ["pago", ["aberto"]]],
  "fica o atualizado por último; se houver cópia paga, fica a paga");

console.log(`\n  Tests: ${passed + failed}  ✓ passed: ${passed}  ✗ failed: ${failed}\n`);
if (failed > 0) process.exit(1);
