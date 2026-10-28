/**
 * Testes do motor de importação: campos, CSV/codificação, intérprete de
 * tabelas e reconstrução de colunas de PDF/OCR.
 * Run:  npx tsx src/services/localDocumentExtraction/__tests__/importacao.test.ts
 *
 * Dados fictícios.
 */

import { parseDateBR, detectarOrdemDatas, parseMoney, pickPhone, pareceLinhaDeTotal } from "../fieldParsers";
import { decodificarTexto, dividirDelimitado, comoTabela } from "../textoDelimitado";
import { interpretarTabela } from "../tableInterpreter";
import { agruparLinhas, detectarTabelas, juntarItens, type ItemPosicionado } from "../layout";
import { palavrasDoTsv } from "../ocr";
import { findFirstPhone } from "../regexExtractors";
import { extrairDeTexto, interpretarDocumento } from "../index";

let passed = 0;
let failed = 0;
function assert(cond: boolean, label: string) {
  if (cond) { console.log(`  ✓ ${label}`); passed++; }
  else { console.error(`  ✗ FAIL: ${label}`); failed++; process.exitCode = 1; }
}
const eq = (got: unknown, want: unknown, label: string) =>
  assert(JSON.stringify(got) === JSON.stringify(want), `${label} (got ${JSON.stringify(got)})`);
function section(t: string) { console.log(`\n══ ${t} ${"═".repeat(Math.max(0, 60 - t.length))}`); }

// ── Datas ─────────────────────────────────────────────────────────────────────
section("Datas");
eq(parseDateBR("15/06/2026"), "15/06/2026", "DD/MM/AAAA");
eq(parseDateBR("5/6/26"), "05/06/2026", "D/M/AA");
eq(parseDateBR("15.06.2026"), "15/06/2026", "com ponto");
eq(parseDateBR("2026-06-15T00:00:00"), "15/06/2026", "ISO com hora");
eq(parseDateBR("15/06/2026 00:00:00"), "15/06/2026", "com hora depois");
eq(parseDateBR("15 de junho de 2026"), "15/06/2026", "por extenso");
eq(parseDateBR("15/jun/26"), "15/06/2026", "mês abreviado");
eq(parseDateBR("31/02/2026"), null, "31/02 é inválida");
eq(parseDateBR("13/13/2026"), null, "mês 13 é inválido");
eq(parseDateBR("06/15/2026", "mdy"), "15/06/2026", "padrão americano");
eq(parseDateBR("46188", "dmy", true), "15/06/2026", "serial do Excel");
eq(parseDateBR("46188"), null, "serial só quando permitido");
eq(detectarOrdemDatas(["06/15/2026", "07/01/2026"]), "mdy", "coluna MM/DD detectada");
eq(detectarOrdemDatas(["15/06/2026", "01/07/2026"]), "dmy", "coluna DD/MM detectada");

// ── Valores ───────────────────────────────────────────────────────────────────
section("Valores");
eq(parseMoney("R$ 1.234,56"), 1234.56, "R$ BR");
eq(parseMoney("1,234.56"), 1234.56, "padrão americano");
eq(parseMoney("1234,5"), 1234.5, "célula numérica");
eq(parseMoney("-150,00"), 150, "negativo vira positivo");
eq(parseMoney("(1.500,00)"), 1500, "entre parênteses");
eq(parseMoney("1.234,56 D"), 1234.56, "com D de débito");
eq(parseMoney("Aberto"), null, "texto não é valor");

// ── Telefones ─────────────────────────────────────────────────────────────────
section("Telefones");
eq(pickPhone("(11) 98765-4321"), "11987654321", "formatado");
eq(pickPhone("+55 11 98765-4321"), "11987654321", "com DDI");
eq(pickPhone("011 98765-4321"), "11987654321", "com 0 de discagem");
eq(pickPhone("(11) 3333-4444 / (11) 98765-4321"), "11987654321", "dois números: fica o celular");
eq(pickPhone("33 9913-7848"), "3399137848", "celular antigo de 8 dígitos");
eq(pickPhone("98765-4321"), null, "sem DDD não serve");
eq(pickPhone("123.456.789-01"), null, "CPF não é telefone");

// Telefone com espaço no meio, no texto corrido (relatório, TXT, texto colado).
// Antes nenhum destes era lido e o relatório vinha todo sem telefone.
section("Telefones com espaço (texto corrido)");
for (const [formato, esperado] of [
  ["77 9 9932 3232", "77999323232"], ["77 99932 3232", "77999323232"], ["(77) 9 9932 3232", "77999323232"],
  ["+55 77 9 9932 3232", "77999323232"], ["0 77 9 9932 3232", "77999323232"], ["77.99932.3232", "77999323232"],
  ["77 9932 3232", "7799323232"],
] as const) {
  eq(findFirstPhone(`JOAO DA SILVA ${formato} 4254-2 10/05/2026 R$ 715,66`), esperado, `“${formato}” no meio da linha`);
}
const relatorioTexto = extrairDeTexto("JOAO DA SILVA 77 9 9932 3232 4254-2 10/05/2026 R$ 715,66\nMARIA SOUZA (77) 99932 3233 4255-1 11/05/2026 R$ 100,00");
eq(relatorioTexto.records.map((r) => [r.client, r.phone, r.document]), [["JOAO DA SILVA", "77999323232", "4254-2"], ["MARIA SOUZA", "77999323233", "4255-1"]], "relatório: nome, telefone e documento separados certo");
eq(findFirstPhone("EMPRESA 51.382.654/0001-68 vence 10 05 2026 R$ 715,66"), null, "CNPJ e data com espaço não viram telefone");

// ── Totais ────────────────────────────────────────────────────────────────────
section("Linhas de total");
assert(pareceLinhaDeTotal("TOTAL GERAL"), "TOTAL GERAL");
assert(pareceLinhaDeTotal("Subtotal:"), "Subtotal:");
assert(!pareceLinhaDeTotal("TOTAL DISTRIBUIDORA LTDA"), "empresa com TOTAL no nome não é total");

// ── Codificação e CSV ─────────────────────────────────────────────────────────
section("Codificação e CSV");
const win1252 = new Uint8Array([0x4a, 0x4f, 0x53, 0xc9, 0x3b, 0x53, 0xc3, 0x4f]); // "JOSÉ;SÃO" em Windows-1252
eq(decodificarTexto(win1252), "JOSÉ;SÃO", "Windows-1252 dos ERPs");
eq(decodificarTexto(new TextEncoder().encode("﻿JOSÉ")), "JOSÉ", "UTF-8 com BOM");
eq(dividirDelimitado('Cliente;Endereço\n"SILVA; JOAO";"Rua A\nSala 2"\n', ";"), [["Cliente", "Endereço"], ["SILVA; JOAO", "Rua A Sala 2"]], "aspas com ; e quebra de linha");
eq(comoTabela("JOAO SILVA 10/05/2026 R$ 100,00\nMARIA 11/05/2026 R$ 200,00"), null, "texto corrido não é tabela");

// ── Intérprete de tabelas ─────────────────────────────────────────────────────
section("Intérprete de tabelas");

const relatorio = [
  ["Relatório de títulos em aberto"],
  ["Empresa", "Sacado", "Telefone", "N° Título", "Vencimento", "Valor", "Emissão", "NFE", "Valor Pago"],
  ["ALFA LTDA", "JOAO BATISTA FERREIRA", "(11) 98765-4321", "4254-2", "10/05/2026", "R$ 715,66", "11/03/2026", "", "R$ 0,00"],
  ["ALFA LTDA", "MERCADO CENTRAL", "21 3333-4444 / 21 99888-7766", "1243/002", "11/05/2026", "R$ 1.833,20", "10/03/2026", "", "R$ 0,00"],
  ["ALFA LTDA", "DISTRIBUIDORA BETA", "", "CH01-3", "12/05/2026", "R$ 5.400,00", "02/02/2026", "", "R$ 0,00"],
  ["", "", "", "", "", "R$ 7.948,86", "", "", ""],
  ["TOTAL GERAL", "", "", "", "", "R$ 7.948,86", "", "", ""],
];
const r1 = interpretarTabela(relatorio);
eq(r1.candidates.length, 3, "3 títulos (total e linha solta ignorados)");
eq(r1.candidates.map((c) => c.client), ["JOAO BATISTA FERREIRA", "MERCADO CENTRAL", "DISTRIBUIDORA BETA"], "clientes pela coluna Sacado");
eq(r1.candidates.map((c) => c.document), ["4254-2", "1243/002", "CH01-3"], "documento = N° Título (NFE vazia não toma o lugar)");
eq(r1.candidates.map((c) => c.value), [715.66, 1833.2, 5400], "valor original, não o pago");
eq(r1.candidates.map((c) => c.dueDate), ["10/05/2026", "11/05/2026", "12/05/2026"], "vencimento, não emissão");
eq(r1.candidates[1].phone, "21998887766", "dois telefones: fica o celular");
eq(r1.candidates[0].supplier, "ALFA LTDA", "fornecedor pela coluna Empresa");

const semCabecalho = [
  ["PEDRO ALVES COSTA", "NF-050", "05/07/2026", "2.750,00", "11922334455", "02/06/2026"],
  ["LUCIA DIAS MELO", "NF-051", "10/07/2026", "980,75", "11933445566", "02/06/2026"],
  ["MARCOS OLIVEIRA", "NF-052", "15/07/2026", "12.500,00", "11944556677", "03/06/2026"],
];
const r2 = interpretarTabela(semCabecalho);
eq(r2.candidates.length, 3, "planilha sem cabeçalho: 3 registros pelo conteúdo");
eq(r2.candidates[0].dueDate, "05/07/2026", "vencimento = a data mais tardia (não a emissão)");
eq(r2.candidates[2].value, 12500, "valor inferido");
eq(r2.candidates[1].phone, "11933445566", "telefone inferido");
eq(r2.candidates[0].document, "NF-050", "documento inferido");

const americano = [
  ["Customer", "Due Date", "Amount", "Phone"],
  ["ANA LIMA", "06/15/2026", "1,800.50", "11922334455"],
  ["JOSE SOUZA", "07/01/2026", "300.00", "11911223344"],
];
const r3 = interpretarTabela(americano);
eq(r3.candidates.map((c) => c.dueDate), ["15/06/2026", "01/07/2026"], "datas MM/DD convertidas");
eq(r3.candidates[0].value, 1800.5, "valor no padrão americano");

const nomeQuebrado = [
  ["Cliente", "Vencimento", "Valor"],
  ["COMERCIO DE MATERIAIS DE", "10/05/2026", "100,00"],
  ["CONSTRUCAO SILVA LTDA", "", ""],
  ["MARIA SOUZA", "11/05/2026", "200,00"],
];
eq(interpretarTabela(nomeQuebrado).candidates.map((c) => c.client), ["COMERCIO DE MATERIAIS DE CONSTRUCAO SILVA LTDA", "MARIA SOUZA"], "nome quebrado em duas linhas é juntado");

const duasPaginas = [
  ["Cliente", "Vencimento", "Valor"],
  ["JOAO", "10/05/2026", "100,00"],
  ["Cliente", "Vencimento", "Valor"],
  ["MARIA", "11/05/2026", "200,00"],
  ["MARIA", "11/05/2026", "200,00"],
];
const r5 = interpretarTabela(duasPaginas);
eq(r5.candidates.map((c) => c.client), ["JOAO", "MARIA"], "cabeçalho repetido e duplicata exata ignorados");

eq(interpretarTabela([["Código", "Descrição"], ["1", "Parafuso"]]).candidates.length, 0, "tabela que não é de cobrança não gera registros");

// ── Texto colado do Excel (tabulação) ─────────────────────────────────────────
section("Texto colado");
const colado = "Pagador\tVenc.\tVlr\tCelular\nJOSE DA SILVA\t20/06/2026\t1.250,00\t(31) 98877-6655\nANA PAULA\t21/06/2026\t80,00\t31 97766-5544";
const rc = extrairDeTexto(colado);
eq(rc.records.length, 2, "colagem do Excel vira 2 registros");
eq(rc.records[0].phone, "31988776655", "telefone da colagem");
assert(rc.method === "tabela-colado", `lido como tabela (got ${rc.method})`);
assert(rc.resumo.includes("telefone"), `resumo lista as colunas (got "${rc.resumo}")`);

// ── Reconstrução de colunas (PDF/OCR) ─────────────────────────────────────────
section("Colunas de PDF");

const it = (str: string, x: number, y: number, w = str.length * 5, h = 10): ItemPosicionado => ({ str, x, y, w, h });
const pagina: ItemPosicionado[] = [
  it("Relatório de Contas a Receber", 40, 20),
  // Cabeçalho: títulos curtos; NFE fica sobre uma coluna vazia.
  it("Sacado", 40, 50), it("Telefone", 220, 50), it("Título", 300, 50), it("Vencimento", 360, 50), it("Valor", 450, 50), it("NFE", 520, 50),
  // Nomes mais largos que o título "Sacado".
  it("IDERLANDIO JESUS DE OLIVEIRA", 40, 70, 150), it("33988245284", 220, 70), it("4254-2", 300, 70), it("10/05/2026", 360, 70), it("R$ 715,66", 450, 70),
  it("MENEZES E BATISTA LTDA ME", 40, 85, 140), it("3835721919", 220, 85), it("4240-2", 300, 85), it("09/05/2026", 360, 85), it("R$", 450, 85, 10), it("760,20", 462, 85, 30),
  // Linha sem telefone: as colunas não podem deslizar.
  it("FRANCISCO MOTA", 40, 100, 80), it("CH01-3", 300, 100), it("10/05/2026", 360, 100), it("R$ 5.400,00", 450, 100),
  // Negrito simulado: o mesmo texto desenhado duas vezes.
  it("FRANCISCO MOTA", 40.3, 100.2, 80),
  it("Página 1 de 1", 40, 140),
];
const linhas = agruparLinhas(pagina);
eq(linhas.length, 6, "6 linhas visuais");
const tabelas = detectarTabelas(linhas, "pdf");
eq(tabelas.length, 1, "1 tabela encontrada");
const rp = interpretarTabela(tabelas[0]?.rows ?? []);
eq(rp.candidates.map((c) => c.client), ["IDERLANDIO JESUS DE OLIVEIRA", "MENEZES E BATISTA LTDA ME", "FRANCISCO MOTA"], "nomes inteiros, sem duplicar o negrito");
eq(rp.candidates.map((c) => c.phone), ["33988245284", "3835721919", null], "telefone na coluna certa (e vazio quando falta)");
eq(rp.candidates.map((c) => c.document), ["4254-2", "4240-2", "CH01-3"], "documento = Título");
eq(rp.candidates.map((c) => c.value), [715.66, 760.2, 5400], "R$ e valor em itens separados");

eq(juntarItens([it("1.234", 0, 0, 25), it(",56", 25.2, 0, 15)]), "1.234,56", "pedaços da mesma palavra juntam sem espaço");

const doc = interpretarDocumento({ nomeArquivo: "relatorio.pdf", tipo: "pdf", tabelas, texto: linhas.map((l) => juntarItens(l)).join("\n"), avisos: [] });
eq(doc.records.length, 3, "documento PDF completo → 3 registros");
eq(doc.records.find((r) => r.client === "FRANCISCO MOTA")?.phone, "", "sem telefone continua sem telefone");
eq(doc.records[0].phone, "33988245284", "celular já com 9 fica igual");
assert(doc.method === "tabela-pdf", `PDF lido como tabela (got ${doc.method})`);

// ── OCR (TSV do tesseract) ────────────────────────────────────────────────────
section("OCR");
const tsv = [
  "level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext",
  "5\t1\t1\t1\t1\t1\t100\t200\t80\t20\t91.5\tJOAO",
  "5\t1\t1\t1\t1\t2\t190\t202\t90\t20\t12\t~~",
  "4\t1\t1\t1\t1\t0\t100\t200\t300\t20\t-1\t",
].join("\n");
eq(palavrasDoTsv(tsv), [{ str: "JOAO", x: 100, y: 210, w: 80, h: 20 }], "palavras com posição; ruído de baixa confiança descartado");
eq(palavrasDoTsv(tsv.replace("91.5", "40")), [{ str: "JOAO", x: 100, y: 210, w: 80, h: 20, duvidoso: true }], "confiança média: mantida, marcada como duvidosa");

const lidaPorOcr = interpretarTabela(
  [["Cliente", "Documento", "Vencimento", "Valor"], ["FRANCISCO MOTA", "CcHo1-3", "12/05/2026", "5.400,00"], ["ANA LIMA", "NF-10", "13/05/2026", "80,00"]],
  [[false, false, false, false], [false, true, false, false], [false, false, false, false]],
);
eq(lidaPorOcr.candidates.map((c) => c.confidenceScore < 75), [true, false], "célula duvidosa do OCR manda o registro para revisão");

// Caso real do OCR: título "Vlr" lido "VIr", valor "1.180,35" lido "1180/35" e
// um valor ilegível. Antes os três valores saíam R$ 0,00 sem aviso.
eq(parseMoney("1180/35"), 1180.35, "barra no lugar da vírgula (OCR)");
const ocrReal = interpretarTabela([
  ["Sacado", "Fone", "Título", "Vencto", "VIr"],
  ["MARIA DA CONCEIÇÃO", "(21) 98123-4567", "5521-1", "15/09/2026", "420,00"],
  ["PADARIA PÃO QUENTE", "21 3555-1234", "5522-1", "18/09/2026", "1180/35"],
  ["OFICINA DO JOSÉ", "(21) 99777-1100", "5530-3", "20/09/2026", "2.99O,0O"],
]);
eq(ocrReal.candidates.map((c) => c.value), [420, 1180.35, null], "“VIr” reconhecido como valor");
eq(ocrReal.candidates.map((c) => c.confidenceScore < 75), [false, false, true], "valor ilegível vai para revisão, não vira zero calado");

// A disputa tabela × texto não pode ser decidida pela marcação de revisão.
const docOcr = interpretarDocumento({
  nomeArquivo: "scan.pdf", tipo: "pdf-ocr", avisos: [],
  tabelas: [{ origem: "pdf", rows: [["Cliente", "Documento", "Vencimento", "Valor"], ["MARIA SOUZA", "55211", "15/09/2026", "420,00"], ["JOSE LIMA", "5522-1", "18/09/2026", "80,00"]], duvidosas: [[false, false, false, false], [false, true, false, false], [false, false, false, false]] }],
  texto: "Cliente Documento Vencimento Valor\nMARIA SOUZA 55211 15/09/2026 420,00\nJOSE LIMA 5522-1 18/09/2026 80,00",
});
assert(docOcr.method === "tabela-pdf-ocr", `tabela continua escolhida com registro a revisar (got ${docOcr.method})`);
eq(docOcr.records.map((r) => r.confidenceScore < 75), [true, false], "a marcação de revisão chega ao resultado");

console.log(`\n${"═".repeat(62)}`);
console.log(`  Tests: ${passed + failed}  ✓ passed: ${passed}  ✗ failed: ${failed}`);
console.log(`${"═".repeat(62)}\n`);
if (failed > 0) process.exit(1);
