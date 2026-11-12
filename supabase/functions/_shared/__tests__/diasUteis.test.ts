/**
 * Unit tests for diasUteis.ts (vencimento em dia sem expediente — Lei 7.089/1983)
 * e o efeito em encargos.ts.
 * Run:  npx tsx supabase/functions/_shared/__tests__/diasUteis.test.ts
 */

import { ehDiaUtil, feriadosBancarios, hojeLocal, noPrazoDoDiaUtil, pascoa, proximoDiaUtil, ymdDeDataBr } from "../diasUteis.ts";

let passed = 0;
let failed = 0;

function iguais(got: unknown, want: unknown, label: string) {
  if (JSON.stringify(got) === JSON.stringify(want)) { passed++; }
  else { failed++; console.error(`  ✗ ${label}\n    → ${JSON.stringify(got)}\n    esperado ${JSON.stringify(want)}`); }
}

// ── Páscoa e feriados móveis ─────────────────────────────────────────────────
iguais([2024, 2025, 2026, 2027].map(pascoa), ["2024-03-31", "2025-04-20", "2026-04-05", "2027-03-28"], "Páscoa");
const f2026 = feriadosBancarios(2026);
iguais(["2026-02-16", "2026-02-17", "2026-04-03", "2026-06-04", "2026-11-20", "2026-11-02"].every((d) => f2026.has(d)), true, "Carnaval, Sexta Santa, Corpus Christi, 20/11, Finados");
iguais(feriadosBancarios(2023).has("2023-11-20"), false, "20/11 só a partir de 2024");

// ── Dia útil ─────────────────────────────────────────────────────────────────
iguais(ehDiaUtil("2026-11-13"), true, "sexta comum");
iguais(ehDiaUtil("2026-11-14"), false, "sábado");
iguais(ehDiaUtil("2026-11-15"), false, "domingo e feriado");
iguais(proximoDiaUtil("2026-11-14"), "2026-11-16", "sábado → segunda");
iguais(proximoDiaUtil("2026-11-20"), "2026-11-23", "sexta feriado → segunda");
iguais(proximoDiaUtil("2026-02-14"), "2026-02-18", "sábado de Carnaval → quarta de Cinzas");
iguais(proximoDiaUtil("2026-11-13"), "2026-11-13", "dia útil fica");

// ── Prazo do dia útil ────────────────────────────────────────────────────────
iguais(noPrazoDoDiaUtil("2026-11-14", "2026-11-15"), true, "venceu sábado, hoje domingo");
iguais(noPrazoDoDiaUtil("2026-11-14", "2026-11-16"), true, "venceu sábado, hoje segunda (1º dia útil)");
iguais(noPrazoDoDiaUtil("2026-11-14", "2026-11-17"), false, "venceu sábado, hoje terça: atrasado");
iguais(noPrazoDoDiaUtil("2026-11-13", "2026-11-16"), false, "venceu em dia útil: regra não se aplica");
iguais(noPrazoDoDiaUtil("", "2026-11-16"), false, "sem data: cálculo segue como antes");
iguais(noPrazoDoDiaUtil("13/11/2026", "2026-11-16"), false, "formato errado: cálculo segue como antes");

// ── Conversões ───────────────────────────────────────────────────────────────
iguais(ymdDeDataBr("14/11/2026"), "2026-11-14", "DD/MM/AAAA");
iguais(ymdDeDataBr("2026-11-14T00:00:00"), "2026-11-14", "ISO");
iguais(hojeLocal(new Date(2026, 10, 5, 23, 59)), "2026-11-05", "hoje local");

console.log(`diasUteis: ${passed} ok, ${failed} falha(s)`);
if (failed > 0) process.exit(1);
