/**
 * Unit tests for agrupamento.ts (vários títulos do mesmo cliente numa mensagem).
 * Run:  npx tsx supabase/functions/_shared/__tests__/agrupamento.test.ts
 */

import { chaveDeAgrupamento, linhasDeBoleto, preencherMensagem } from "../agrupamento.ts";

let passed = 0;
let failed = 0;

function iguais(got: unknown, want: unknown, label: string) {
  if (JSON.stringify(got) === JSON.stringify(want)) { passed++; }
  else { failed++; console.error(`  ✗ ${label}\n    → ${JSON.stringify(got)}\n    esperado ${JSON.stringify(want)}`); }
}
function contem(got: string, trecho: string, label: string) {
  if (got.includes(trecho)) { passed++; }
  else { failed++; console.error(`  ✗ ${label}: faltou ${JSON.stringify(trecho)}\n${got}`); }
}
function naoContem(got: string, trecho: string, label: string) {
  if (!got.includes(trecho)) { passed++; }
  else { failed++; console.error(`  ✗ ${label}: não devia ter ${JSON.stringify(trecho)}\n${got}`); }
}

// ── Chave ────────────────────────────────────────────────────────────────────
const k = (n: string, f: string, c: string) => chaveDeAgrupamento(n, f, c);
iguais(k("Adilson Pereira Lima", "33988402061", "vencidos"), k("ADILSON  PEREIRA LIMA ", "5533988402061", "vencidos"), "mesmo cliente: caixa, espaços e 55");
iguais(k("José Silva", "(33) 8840-2061", "vencidos"), k("JOSE SILVA", "33988402061", "vencidos"), "acento e nono dígito");
iguais(k("Adilson", "33988402061", "vencidos") === k("Adilson", "33988402061", "a_vencer"), false, "tipos diferentes não juntam");
iguais(k("Adilson", "33988402061", "vencidos") === k("Adilson", "33977771111", "vencidos"), false, "outro WhatsApp não junta");
iguais(k("Adilson", "33988402061", "liquidado"), null, "liquidado não agrupa");
iguais(k("Adilson", "", "vencidos"), null, "sem telefone não agrupa");

// ── Mensagem ─────────────────────────────────────────────────────────────────
const NEUTRO = `Olá {nome_cliente},
Segue o acompanhamento do título abaixo para sua verificação.

Documento: {documento}
Boleto: {documento_boleto}
Vencimento: {vencimento}
Valor: R$ {valor_atualizado}

O título consta em aberto em nosso acompanhamento.
Solicitamos a confirmação do pagamento ou o envio do comprovante para atualização do status.

Atenciosamente, equipe financeira {empresa}.`;

const t1 = { documento: "1270-2", vencimento: "18/07/2026", valor: 1575.75, diasAtraso: 109 };
const t2 = { documento: "1192/005", vencimento: "20/07/2026", valor: 1760, diasAtraso: 107 };

iguais(
  preencherMensagem(NEUTRO, { nomeCliente: "ADILSON", titulos: [t1], empresa: "Orthomax" }),
  `Olá ADILSON,
Segue o acompanhamento do título abaixo para sua verificação.

Documento: 1270-2
Boleto: 1270-2
Vencimento: 18/07/2026
Valor: R$ 1.575,75

O título consta em aberto em nosso acompanhamento.
Solicitamos a confirmação do pagamento ou o envio do comprovante para atualização do status.

Atenciosamente, equipe financeira Orthomax.`,
  "um título: igual a antes",
);

iguais(
  preencherMensagem(NEUTRO, { nomeCliente: "ADILSON", titulos: [t1, t2], empresa: "Orthomax" }),
  `Olá ADILSON,
Segue o acompanhamento dos títulos abaixo para sua verificação.

Documento: 1270-2
Boleto: 1270-2
Vencimento: 18/07/2026
Valor: R$ 1.575,75

Documento: 1192/005
Boleto: 1192/005
Vencimento: 20/07/2026
Valor: R$ 1.760,00

Total: R$ 3.335,75

Os títulos constam em aberto em nosso acompanhamento.
Solicitamos a confirmação do pagamento ou o envio do comprovante para atualização do status.

Atenciosamente, equipe financeira Orthomax.`,
  "dois títulos: bloco repetido, total e plural",
);

const FIRME = `Olá {nome_cliente},
Precisamos tratar com prioridade a pendência financeira abaixo.

Documento: {documento}
Valor: R$ {valor_atualizado}

O título acumula {dias_atraso} dia(s) de atraso e exige uma definição imediata.`;
const firme2 = preencherMensagem(FIRME, { nomeCliente: "A", titulos: [t1, t2] });
contem(firme2, "as pendências financeiras abaixo", "firme: plural da pendência");
contem(firme2, "Os títulos acumulam até 109 dia(s)", "firme: maior atraso");

// Modelo só em prosa (sem bloco de campos): lista e total na frase.
const PROSA = "Consta o boleto abaixo com vencimento em {vencimento} no valor de R$ {valor_atualizado} (Documento: {documento}).";
iguais(
  preencherMensagem(PROSA, { nomeCliente: "A", titulos: [t1, t2] }),
  "Consta os boletos abaixo com vencimento em 18/07/2026 e 20/07/2026 no valor de R$ 3.335,75 (Documento: 1270-2 e 1192/005).",
  "prosa: listas e total",
);

const tres = preencherMensagem(NEUTRO, { nomeCliente: "A", titulos: [t1, t2, { ...t2, documento: "1192/006" }] });
naoContem(tres, "{", "três títulos: nenhum campo sobra");
contem(tres, "Total: R$ 5.095,75", "três títulos: total");

// ── Boletos ──────────────────────────────────────────────────────────────────
iguais(linhasDeBoleto([]), "", "sem boleto");
iguais(linhasDeBoleto([{ documento: "1", url: "u1" }]), "📎 Boleto: u1", "um boleto");
iguais(linhasDeBoleto([{ documento: "1", url: "u1" }, { documento: "2", url: "u2" }]), "📎 Boleto 1: u1\n📎 Boleto 2: u2", "vários boletos");

console.log(`\n  Tests: ${passed + failed}  ✓ passed: ${passed}  ✗ failed: ${failed}\n`);
if (failed > 0) process.exit(1);
