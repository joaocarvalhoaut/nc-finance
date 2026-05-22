/**
 * Unit tests for the local extraction heuristics.
 * Run with:  npx tsx src/services/localDocumentExtraction/__tests__/heuristics.test.ts
 *
 * Uses real ERP text samples captured from the NC Finance import screen.
 */

import { parseErpFormat, parseLineByLine } from "../heuristics";

// ── Sample texts ──────────────────────────────────────────────────────────────

const ERP_SAMPLE = `Lista de Recebíveis Data: 07/05/2026 15:05:11 Empresa Cnpj/Cpf Empresa Sacado Telefone Tipo N° Título Vencimento Dias Valor Estado Emissão NFE Pagamento Valor Pago ORTHOMAX INDUSTRIA E COMERCIO 51.382.654/0001-68 IDERLANDIO JESUS DE OLIVEIRA 33988245284 Duplicata Mercantil 4254-2 10/05/2026 0 R$ 715,66 Aberto 11/03/2026 R$ 0,00 ORTHOMAX INDUSTRIA E COMERCIO 51.382.654/0001-68 MENEZES E BATISTA LTDA ME 3835721919 Duplicata Mercantil 4240-2 09/05/2026 0 R$ 760,20 Aberto 11/03/2026 R$ 0,00 ORTHOMAX INDUSTRIA E COMERCIO 51.382.654/0001-68 COLCHOES E CIA DE BRASILANDIA LTDA 33835622844 Duplicata Mercantil 1243/002 11/05/2026 0 R$ 833,20 Aberto 10/03/2026 R$ 0,00 ORTHOMAX INDUSTRIA E COMERCIO 51.382.654/0001-68 FRANCISCO FERREIRA MOTA 3399137848 Duplicata Mercantil CH01-3 10/05/2026 0 R$ 5.400,00 Aberto 02/02/2026 R$ 0,00`;

const LINE_SAMPLE = `JOAO DA SILVA 4254-2 10/05/2026 R$ 715,66 Aberto
MARIA SOUZA 1243/002 11/05/2026 R$ 833,20 Aberto`;

// ── Helpers ───────────────────────────────────────────────────────────────────

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error(`  ✗ FAIL: ${msg}`);
    process.exitCode = 1;
  } else {
    console.log(`  ✓ ${msg}`);
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

console.log("\n=== ERP CNPJ-anchor parser ===");

const erpRecords = parseErpFormat(ERP_SAMPLE);
assert(erpRecords.length === 4, `4 records extracted (got ${erpRecords.length})`);

if (erpRecords.length > 0) {
  const r0 = erpRecords[0];
  assert(
    r0.client?.includes("IDERLANDIO") ?? false,
    `record[0].client contains IDERLANDIO (got "${r0.client}")`,
  );
  assert(r0.dueDate === "10/05/2026", `record[0].dueDate = 10/05/2026 (got "${r0.dueDate}")`);
  assert(r0.value === 715.66, `record[0].value = 715.66 (got ${r0.value})`);
  assert(r0.document === "4254-2", `record[0].document = 4254-2 (got "${r0.document}")`);
  assert(r0.phone === "33988245284", `record[0].phone = 33988245284 (got "${r0.phone}")`);
  assert(r0.status?.toLowerCase() === "aberto", `record[0].status = Aberto (got "${r0.status}")`);
  assert(r0.confidenceScore === 100, `record[0].confidenceScore = 100 (got ${r0.confidenceScore})`);

  const r3 = erpRecords[3];
  assert(r3.value === 5400, `record[3].value = 5400 (got ${r3.value})`);
  assert(r3.document === "CH01-3", `record[3].document = CH01-3 (got "${r3.document}")`);
}

console.log("\n=== Line-by-line parser ===");

const lineRecords = parseLineByLine(LINE_SAMPLE);
assert(lineRecords.length === 2, `2 records from line-by-line (got ${lineRecords.length})`);

if (lineRecords.length > 0) {
  assert(
    lineRecords[0].client?.includes("JOAO") ?? false,
    `lineRecords[0].client contains JOAO (got "${lineRecords[0].client}")`,
  );
  assert(
    lineRecords[0].value === 715.66,
    `lineRecords[0].value = 715.66 (got ${lineRecords[0].value})`,
  );
}

console.log("\n=== All tests completed ===\n");
