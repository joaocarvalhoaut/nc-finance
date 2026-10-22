/**
 * columnHeaders — reconhecimento de cabeçalhos de planilha.
 *
 * Run:  npx tsx supabase/functions/_shared/__tests__/columnHeaders.test.ts
 *
 * Cobre o que motivou o módulo:
 *  - sinônimos de cliente ("sacado", "pagador"…) e de vencimento abreviado;
 *  - "Sacador" (fornecedor) não pode roubar a coluna do "Sacado" (cliente);
 *  - colunas de atributo do cliente ("Telefone do Sacado") não viram o cliente;
 *  - datas e valores que NÃO são vencimento/valor devido ficam de fora.
 */

import { mapHeaders, normalizeHeader, scoreHeader, countStrongFields, type HeaderField } from "../columnHeaders.ts";

let passed = 0, failed = 0;
function eq<T>(got: T, want: T, label: string) {
  if (got === want) { console.log(`  ✓ ${label}`); passed++; }
  else { console.error(`  ✗ FAIL: ${label} — esperado ${String(want)}, veio ${String(got)}`); failed++; process.exitCode = 1; }
}

const TABELA: readonly HeaderField[] = [
  "client", "supplier", "cnpj", "document", "dueDate", "value", "phone", "status", "docType", "bank",
];
const melhorCampo = (h: string): HeaderField | undefined => {
  const m = mapHeaders([h], TABELA);
  return (Object.keys(m) as HeaderField[])[0];
};

console.log("\n══ normalizeHeader ═══════════════════════════════════════");
eq(normalizeHeader("Dt. de Venc."),        "dt venc",           "pontuação e preposição");
eq(normalizeHeader("Nº Doc."),             "n doc",             "símbolo de número");
eq(normalizeHeader("Data_Vencimento"),     "data vencimento",   "sublinhado");
eq(normalizeHeader("  RAZÃO   SOCIAL "),   "razao social",      "acento, caixa e espaços");

console.log("\n══ Sinônimos de cliente ═══════════════════════════════════");
for (const h of ["Sacado", "SACADO", "Pagador", "Cliente", "Nome do Cliente", "Devedor",
                 "Razão Social", "Comprador", "Tomador", "Sacado/Pagador", "Nome"]) {
  eq(melhorCampo(h), "client", `"${h}" → cliente`);
}

console.log("\n══ Vencimento abreviado ═══════════════════════════════════");
for (const h of ["Vencimento", "Venc", "Venc.", "VENC", "Dt. Venc.", "Data Venc",
                 "Data de Vencimento", "Vcto", "Vecto", "Vencto", "Vct", "Vto.",
                 "Dt Vcto", "Data_Vencimento", "Venc. Título", "Vencimeto"]) {
  eq(melhorCampo(h), "dueDate", `"${h}" → vencimento`);
}

console.log("\n══ Datas que NÃO são o vencimento ═════════════════════════");
for (const h of ["Data de Emissão", "Data Pagamento", "Data da Baixa", "Data"]) {
  eq(scoreHeader(h, "dueDate"), 0, `"${h}" não é vencimento`);
}

console.log("\n══ Sacado x Sacador (o bug do substring) ══════════════════");
{
  // Sacador ANTES de Sacado — com a comparação antiga o cliente ia para a coluna 0.
  const m = mapHeaders(["Sacador", "Sacado", "Vencimento", "Valor"], TABELA);
  eq(m.supplier, 0, "Sacador → fornecedor (col 0)");
  eq(m.client,   1, "Sacado  → cliente    (col 1)");
}
{
  const m = mapHeaders(["Beneficiário", "Pagador", "Venc.", "Vlr. Título"], TABELA);
  eq(m.supplier, 0, "Beneficiário → fornecedor");
  eq(m.client,   1, "Pagador → cliente");
  eq(m.dueDate,  2, "Venc. → vencimento");
  eq(m.value,    3, "Vlr. Título → valor");
}

console.log("\n══ Atributos do cliente não viram o cliente ═══════════════");
{
  const m = mapHeaders(["Telefone do Sacado", "CPF/CNPJ do Pagador", "Sacado", "Vencimento"], TABELA);
  eq(m.phone,  0, "Telefone do Sacado → telefone");
  eq(m.cnpj,   1, "CPF/CNPJ do Pagador → cpf/cnpj");
  eq(m.client, 2, "a coluna Sacado continua sendo o cliente");
}
{
  const m = mapHeaders(["Tipo de Documento", "Nº Documento", "Valor do Título", "Vencimento do Título"], TABELA);
  eq(m.docType,  0, "Tipo de Documento → tipo");
  eq(m.document, 1, "Nº Documento → documento");
  eq(m.value,    2, "Valor do Título → valor");
  eq(m.dueDate,  3, "Vencimento do Título → vencimento");
}

console.log("\n══ Valor devido x valores que não se cobram ═══════════════");
for (const h of ["Valor Pago", "Juros", "Multa", "Desconto", "Valor Recebido"]) {
  eq(scoreHeader(h, "value"), 0, `"${h}" não é o valor a cobrar`);
}
{
  // A cobrança usa o valor base: com as duas colunas, a original vence.
  const m = mapHeaders(["Valor Atualizado", "Valor Original"], TABELA);
  eq(m.value, 1, "Valor Original vence Valor Atualizado");
  const so = mapHeaders(["Cliente", "Valor Atualizado"], TABELA);
  eq(so.value, 1, "sem coluna original, Valor Atualizado é usado");
}

console.log("\n══ CPF/CNPJ não é número do documento ═════════════════════");
eq(scoreHeader("CPF/CNPJ", "document"), 0, "CPF/CNPJ → não é documento");
eq(scoreHeader("Documento", "document") > 0, true, "Documento → documento");

console.log("\n══ Erros de digitação ═════════════════════════════════════");
eq(melhorCampo("Clinte"),     "client",  "Clinte → cliente (letra faltando)");
eq(melhorCampo("Telefonne"),  "phone",   "Telefonne → telefone");
eq(melhorCampo("Fornecdor"),  "supplier","Fornecdor → fornecedor");
// Ambíguo: a uma letra de "sacado" (cliente) E de "sacador" (fornecedor). Não chuta.
eq(melhorCampo("Sacadoo"),    undefined, "Sacadoo → ambíguo, não mapeia");

console.log("\n══ Detecção de linha de cabeçalho ═════════════════════════");
eq(countStrongFields("Pagador;Venc.;Vlr") >= 2,           true,  "cabeçalho com sinônimos e abreviações");
eq(countStrongFields("Empresa: ALFA LTDA") >= 2,          false, "uma palavra-chave só não é cabeçalho");
eq(countStrongFields("SACADO VENCIMENTO VALOR") >= 2,     true,  "cabeçalho separado por espaço (PDF)");

console.log(`\n══════════════════════════════════════════════════════════`);
console.log(`  Tests: ${passed + failed}  ✓ passed: ${passed}  ✗ failed: ${failed}`);
console.log(`══════════════════════════════════════════════════════════\n`);
