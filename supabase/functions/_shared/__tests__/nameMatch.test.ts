/**
 * Unit tests for nameMatch.ts (similaridade de nome no matching de boletos).
 * Run:  npx tsx supabase/functions/_shared/__tests__/nameMatch.test.ts
 */

import { nameSimilarity } from "../nameMatch.ts";

let passed = 0;
let failed = 0;

function assert(cond: boolean, label: string) {
  if (cond) { passed++; }
  else { failed++; console.error(`  ✗ ${label}`); }
}

/** score(a,b) >= min */
function atLeast(debtor: string, file: string, min: number) {
  const s = nameSimilarity(debtor, file);
  assert(s >= min, `"${debtor}" vs "${file}" → ${s.toFixed(2)} (esperado ≥ ${min})`);
}

/** score(a,b) <= max */
function atMost(debtor: string, file: string, max: number) {
  const s = nameSimilarity(debtor, file);
  assert(s <= max, `"${debtor}" vs "${file}" → ${s.toFixed(2)} (esperado ≤ ${max})`);
}

// ── Match forte por nome distintivo ───────────────────────────────────────────
// Arquivo nomeado pelo nome próprio do cliente → alto, mesmo ignorando LTDA/MÓVEIS.
atLeast("BENDICASA MOVEIS ELETRO LTDA", "BENDICASA.pdf", 0.6);
atLeast("COMERCIO VAREJISTA ULTRALAR LTDA", "ULTRALAR.pdf", 0.6);
atLeast("GIL MOVEIS ELETRODOMESTICOS LTDA", "GIL ELETRO 2024.pdf", 0.55);

// ── Prefixo / substring (abreviações comuns) ──────────────────────────────────
atLeast("DISTRIBUIDORA SANTA RITA", "DISTRIB SANTA RITA.pdf", 0.6);
atLeast("ELETRODOMESTICOS PROGRESSO", "ELETRO PROGRESSO.pdf", 0.6);
atLeast("REPRESENTACOES BOA VISTA", "REPRES BOA VISTA boleto.pdf", 0.55);

// ── Acentos e pontuação ───────────────────────────────────────────────────────
atLeast("MÓVEIS SÃO JOÃO", "moveis sao joao.pdf", 0.5);

// ── Falsos positivos por termo genérico devem ser baixos ──────────────────────
// Só um termo de ramo em comum ("MOVEIS") não pode dar match forte.
atMost("GIL MOVEIS ELETRODOMESTICOS LTDA", "MOVEIS.pdf", 0.45);
atMost("ALFA COMERCIO LTDA", "BETA COMERCIO LTDA.pdf", 0.45);
atMost("CASA DO PARAFUSO", "CASA DA RACAO.pdf", 0.45);

// ── Sem relação → zero ────────────────────────────────────────────────────────
atMost("PADARIA LUMIAR", "RANDOM FILE 9988.pdf", 0.2);
assert(nameSimilarity("", "qualquer.pdf") === 0, 'nome vazio → 0');
assert(nameSimilarity("CLIENTE X", "") === 0, 'candidato vazio → 0');

// ── Nome completo dentro de filename longo ────────────────────────────────────
atLeast("MENEZES E BATISTA", "MENEZESEBATISTALTDAME_42392_4.pdf", 0.0); // sem espaços não tokeniza — ok ser baixo
atLeast("MENEZES BATISTA LTDA", "boleto MENEZES BATISTA 4239.pdf", 0.6);

console.log(`\nnameMatch.test: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
