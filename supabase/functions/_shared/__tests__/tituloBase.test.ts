/**
 * Unit tests for tituloBase.ts (título sem parcela no casamento de boletos).
 * Run:  npx tsx supabase/functions/_shared/__tests__/tituloBase.test.ts
 */

import { numerosDoArquivo, tituloBase, titulosRepetidos } from "../tituloBase.ts";

let passed = 0;
let failed = 0;

function assert(cond: boolean, label: string) {
  if (cond) { passed++; }
  else { failed++; console.error(`  ✗ ${label}`); }
}

function iguais<T>(got: T, want: T, label: string) {
  assert(JSON.stringify(got) === JSON.stringify(want), `${label} → ${JSON.stringify(got)} (esperado ${JSON.stringify(want)})`);
}

// ── Título + parcela ──────────────────────────────────────────────────────────
iguais(tituloBase("2718/1"), "2718", "barra");
iguais(tituloBase("1382-5"), "1382", "hífen");
iguais(tituloBase(" 2718 / 12 "), "2718", "espaços e parcela de 2 dígitos");
iguais(tituloBase("1957/003"), "1957", "parcela com zeros");

// ── Fora do formato: a regra não se aplica ────────────────────────────────────
iguais(tituloBase("2718"), null, "sem parcela (o número completo já casa)");
iguais(tituloBase("F1/2"), null, "prefixo com letra");
iguais(tituloBase("27/1"), null, "título curto demais (2 dígitos casa por acaso)");
iguais(tituloBase("NF-2024-001"), null, "alfanumérico");
iguais(tituloBase("5942-3-1"), null, "duas separações");
iguais(tituloBase(""), null, "vazio");

// ── Títulos repetidos (várias parcelas cadastradas) ───────────────────────────
const rep = titulosRepetidos(["2718/1", "2718/2", "1382/5", "F1/2", null, "1955/1"]);
assert(rep.has("2718"), "2718 com duas parcelas é ambíguo");
assert(!rep.has("1382"), "1382 com uma parcela não é ambíguo");
assert(!rep.has("1955"), "1955 com uma parcela não é ambíguo");
iguais(rep.size, 1, "só um título repetido");

// ── Números do nome do arquivo ────────────────────────────────────────────────
iguais(numerosDoArquivo("2718 reinaldo francklin"), ["2718"], "título no começo");
iguais(numerosDoArquivo("boleto 1382-005 cliente"), ["1382005"], "separador interno vira um número só");
iguais(numerosDoArquivo("2718 a 2720 cliente"), ["2718", "2720"], "dois números");
iguais(numerosDoArquivo("kadu moveis"), [], "sem número");

console.log(`\n  Tests: ${passed + failed}  ✓ passed: ${passed}  ✗ failed: ${failed}\n`);
if (failed > 0) process.exit(1);
