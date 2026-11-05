/**
 * Unit tests for protecaoNumero.ts (limite diário e aquecimento do número).
 * Run:  npx tsx supabase/functions/_shared/__tests__/protecaoNumero.test.ts
 */

import {
  contarMensagens, diaDoAquecimento, hojeEmBrasilia, inicioDoDiaISO,
  limiteDeHoje, limiteDoAquecimento,
} from "../protecaoNumero.ts";

let passed = 0;
let failed = 0;

function iguais(got: unknown, want: unknown, label: string) {
  if (JSON.stringify(got) === JSON.stringify(want)) { passed++; }
  else { failed++; console.error(`  ✗ ${label}\n    → ${JSON.stringify(got)}\n    esperado ${JSON.stringify(want)}`); }
}

// ── Dia em Brasília ──────────────────────────────────────────────────────────
iguais(hojeEmBrasilia(new Date("2026-11-05T02:30:00Z")), "2026-11-04", "23h30 em Brasília ainda é o dia anterior");
iguais(hojeEmBrasilia(new Date("2026-11-05T03:00:00Z")), "2026-11-05", "meia-noite em Brasília");
iguais(inicioDoDiaISO("2026-11-05"), "2026-11-05T03:00:00.000Z", "início do dia em UTC");

// ── Aquecimento ──────────────────────────────────────────────────────────────
iguais(diaDoAquecimento(null, "2026-11-05"), 1, "sem início: dia 1");
iguais(diaDoAquecimento("2026-11-05", "2026-11-05"), 1, "primeiro dia");
iguais(diaDoAquecimento("2026-11-01", "2026-11-05"), 5, "quinto dia");
iguais(diaDoAquecimento("2026-10-31", "2026-11-01"), 2, "virada de mês");
iguais([1, 3, 4, 7, 8, 14, 15, 21, 22, 30, 31].map(limiteDoAquecimento),
  [30, 30, 50, 50, 80, 80, 120, 120, 200, 200, null], "etapas e fim do aquecimento");

// ── Limite de hoje ───────────────────────────────────────────────────────────
const hoje = "2026-11-05";
iguais(limiteDeHoje({ limiteDiario: null, aquecimentoAtivo: true, aquecimentoInicio: "2026-11-01" }, hoje),
  { limite: 50, motivo: "aquecimento", diaDoAquecimento: 5 }, "aquecimento vale sozinho");
iguais(limiteDeHoje({ limiteDiario: 20, aquecimentoAtivo: true, aquecimentoInicio: "2026-11-01" }, hoje),
  { limite: 20, motivo: "conta", diaDoAquecimento: 5 }, "limite da conta menor que o aquecimento");
iguais(limiteDeHoje({ limiteDiario: 300, aquecimentoAtivo: true, aquecimentoInicio: "2026-11-01" }, hoje),
  { limite: 50, motivo: "aquecimento", diaDoAquecimento: 5 }, "aquecimento menor que o limite da conta");
iguais(limiteDeHoje({ limiteDiario: 150, aquecimentoAtivo: true, aquecimentoInicio: "2026-09-01" }, hoje),
  { limite: 150, motivo: "conta", diaDoAquecimento: null }, "aquecimento concluído: vale a conta");
iguais(limiteDeHoje({ limiteDiario: null, aquecimentoAtivo: true, aquecimentoInicio: "2026-09-01" }, hoje),
  { limite: null, motivo: null, diaDoAquecimento: null }, "aquecimento concluído e sem limite");
iguais(limiteDeHoje({ limiteDiario: null, aquecimentoAtivo: false, aquecimentoInicio: null }, hoje),
  { limite: null, motivo: null, diaDoAquecimento: null }, "aquecimento desligado e sem limite");
iguais(limiteDeHoje({ limiteDiario: 0, aquecimentoAtivo: false, aquecimentoInicio: null }, hoje).limite,
  null, "limite 0 é tratado como sem limite");

// ── Contagem de mensagens ────────────────────────────────────────────────────
iguais(contarMensagens([
  { id: "1", status: "sucesso", providerMessageId: "A" },
  { id: "2", status: "sucesso", providerMessageId: "A" },   // foi junto com o 1
  { id: "3", status: "lido",    providerMessageId: "B" },
  { id: "4", status: "erro",    providerMessageId: null },
  { id: "5", status: "sent",    providerMessageId: null },
  { id: "6", status: "duplicado", providerMessageId: null },
]), 3, "títulos juntos contam uma vez; erro e duplicado não contam");

console.log(`\n  Tests: ${passed + failed}  ✓ passed: ${passed}  ✗ failed: ${failed}\n`);
if (failed > 0) process.exit(1);
