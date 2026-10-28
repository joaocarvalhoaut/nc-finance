/**
 * Intérprete de tabelas — o mesmo para planilha, CSV, texto colado do Excel,
 * tabela reconstruída de PDF e OCR. Recebe células (string[][]) e devolve os
 * registros de cobrança.
 *
 * Como decide qual coluna é qual:
 *   1. pelo TÍTULO (columnHeaders.ts, a fonte única de sinônimos), ponderado
 *      pelo CONTEÚDO: entre "N° Título" e "NFE", ganha a que tem dados válidos.
 *      Antes uma coluna vazia com título melhor tomava o lugar da preenchida;
 *   2. o que faltar, pelo CONTEÚDO: coluna em que 70%+ das células são datas
 *      vira o vencimento (a de datas mais tardias, se houver emissão também),
 *      números com centavos viram o valor, nomes variados viram o cliente…
 *      Uma planilha sem cabeçalho nenhum também é lida assim.
 *
 * E por linha: pula cabeçalhos repetidos (relatório de várias páginas), linhas
 * de total/subtotal, junta a continuação de um nome quebrado em duas linhas e
 * descarta duplicatas exatas.
 */

import {
  headerExcludes,
  scoreHeader,
  type HeaderField,
} from "../../../supabase/functions/_shared/columnHeaders.ts";
import { score, type RecordCandidate } from "./heuristics";
import { isHeaderLine } from "./tableParser";
import { ehRuidoDePagina } from "./normalizeText";
import {
  dataComparavel,
  detectarOrdemDatas,
  parseDateBR,
  parseMoney,
  pareceCodigo,
  pareceCpfCnpj,
  pareceData,
  pareceLinhaDeTotal,
  pareceNome,
  pareceTelefone,
  pareceValor,
  pickPhone,
} from "./fieldParsers";

export type Campo = Exclude<HeaderField, "notes">;

const CAMPOS: readonly Campo[] = [
  "client", "supplier", "cnpj", "document", "dueDate", "value", "phone", "status", "docType", "bank",
];

/** Nome do campo para o resumo mostrado ao usuário. */
export const NOME_CAMPO: Record<Campo, string> = {
  client: "cliente",
  supplier: "fornecedor",
  cnpj: "CPF/CNPJ",
  document: "documento",
  dueDate: "vencimento",
  value: "valor",
  phone: "telefone",
  status: "situação",
  docType: "tipo",
  bank: "banco",
};

export interface TabelaInterpretada {
  candidates: RecordCandidate[];
  /** Campo → título da coluna usada ("" quando a coluna não tinha título). */
  colunas: Partial<Record<Campo, string>>;
  /** Campos encontrados pelo conteúdo, sem título reconhecido. */
  inferidos: Campo[];
  /** Linhas de total, cabeçalho repetido ou duplicadas que ficaram de fora. */
  ignoradas: number;
}

// ── Validade do conteúdo por campo ───────────────────────────────────────────

const valido: Record<Campo, (s: string) => boolean> = {
  client: pareceNome,
  supplier: pareceNome,
  cnpj: pareceCpfCnpj,
  document: (s) => s.length <= 30 && !pareceData(s),
  dueDate: (s) => parseDateBR(s, "dmy", true) !== null || parseDateBR(s, "mdy", true) !== null,
  value: (s) => parseMoney(s) !== null,
  phone: pareceTelefone,
  status: (s) => s.length <= 30 && pareceNome(s),
  docType: (s) => s.length <= 40,
  bank: (s) => s.length <= 40,
};

interface PerfilColuna {
  valores: string[];
  preenchimento: number;
  distintos: number;
  tamanhoMedio: number;
}

function perfilDaColuna(corpo: string[][], c: number): PerfilColuna {
  const valores = corpo.slice(0, 400).map((r) => (r[c] ?? "").trim()).filter(Boolean);
  const total = Math.min(corpo.length, 400) || 1;
  return {
    valores,
    preenchimento: valores.length / total,
    distintos: new Set(valores).size / Math.max(valores.length, 1),
    tamanhoMedio: valores.reduce((s, v) => s + v.length, 0) / Math.max(valores.length, 1),
  };
}

const fracao = (valores: string[], teste: (s: string) => boolean) =>
  valores.length ? valores.filter(teste).length / valores.length : 0;

// ── Cabeçalho ─────────────────────────────────────────────────────────────────

/**
 * Pontuação do título para o campo, tolerando as trocas típicas do OCR: I
 * maiúsculo por l minúsculo ("Vlr" lido "VIr"), 1 por l, 0 por o.
 */
function pontuarTitulo(titulo: string, f: Campo): number {
  const direto = scoreHeader(titulo, f);
  if (direto > 0 || !/[I10]/.test(titulo)) return direto;
  const variantes = [titulo.replace(/I/g, "l"), titulo.replace(/1/g, "l"), titulo.replace(/0/g, "o")];
  return Math.max(0, ...variantes.map((v) => scoreHeader(v, f)));
}

/** Linha de títulos: 2+ células que, sozinhas, nomeiam um campo, e nenhum dado. */
export function ehLinhaDeCabecalho(row: string[]): boolean {
  const texto = row.filter(Boolean).join(" ");
  if (!texto || !isHeaderLine(texto)) return false;
  let titulos = 0;
  for (const c of row) {
    if (c && CAMPOS.some((f) => pontuarTitulo(c, f) >= 85)) titulos++;
  }
  return titulos >= 2;
}

// ── Mapeamento de colunas ─────────────────────────────────────────────────────

function mapearPorTitulo(cabecalho: string[], perfis: PerfilColuna[]): Partial<Record<Campo, number>> {
  const opcoes: { c: number; f: Campo; s: number }[] = [];
  cabecalho.forEach((titulo, c) => {
    if (!titulo) return;
    for (const f of CAMPOS) {
      const st = pontuarTitulo(titulo, f);
      if (st < 50) continue;
      const v = fracao(perfis[c].valores, valido[f]) * perfis[c].preenchimento;
      opcoes.push({ c, f, s: st * (0.4 + 0.6 * v) });
    }
  });
  opcoes.sort((a, b) => b.s - a.s || a.c - b.c);
  const mapa: Partial<Record<Campo, number>> = {};
  const usadas = new Set<number>();
  for (const o of opcoes) {
    if (o.f in mapa || usadas.has(o.c) || o.s < 30) continue;
    mapa[o.f] = o.c;
    usadas.add(o.c);
  }
  return mapa;
}

/** Coluna para um campo sem título reconhecido, pelo conteúdo. */
function inferirColuna(f: Campo, livres: number[], cabecalho: string[], perfis: PerfilColuna[]): number | null {
  const aptas = livres.filter((c) => !(cabecalho[c] && headerExcludes(cabecalho[c], f)) && perfis[c].preenchimento >= 0.3);
  const melhor = (cands: number[], nota: (c: number) => number) =>
    cands.length ? cands.reduce((a, b) => (nota(b) > nota(a) ? b : a)) : null;

  switch (f) {
    case "dueDate": {
      const cands = aptas.filter((c) => fracao(perfis[c].valores, valido.dueDate) >= 0.7);
      // Emissão e vencimento juntos sem título: o vencimento é a data mais tardia.
      return melhor(cands, (c) => {
        const ordem = detectarOrdemDatas(perfis[c].valores);
        const ns = perfis[c].valores.map((v) => dataComparavel(parseDateBR(v, ordem, true) ?? "")).filter(Boolean).sort();
        return ns[Math.floor(ns.length / 2)] ?? 0;
      });
    }
    case "value": {
      // Exige centavos ou R$ em boa parte: senão "Dias" (0, 5, 12) virava o valor.
      // Tolerância para uma célula ilegível (OCR) numa tabela pequena.
      const cands = aptas.filter((c) =>
        fracao(perfis[c].valores, valido.value) >= 0.65 &&
        fracao(perfis[c].valores, pareceValor) >= 0.4 &&
        fracao(perfis[c].valores, pareceTelefone) < 0.5);
      // A mais à esquerda: em relatório, o valor original vem antes de juros e total.
      return cands.length ? Math.min(...cands) : null;
    }
    case "phone": {
      const cands = aptas.filter((c) => fracao(perfis[c].valores, pareceTelefone) >= 0.7);
      return melhor(cands, (c) => fracao(perfis[c].valores, pareceTelefone));
    }
    case "client": {
      const cands = aptas.filter((c) =>
        fracao(perfis[c].valores, pareceNome) >= 0.8 && perfis[c].tamanhoMedio >= 5 && perfis[c].distintos >= 0.3);
      // O cliente varia de linha a linha; o fornecedor/empresa costuma repetir.
      return melhor(cands, (c) => perfis[c].distintos * 2 + Math.min(perfis[c].tamanhoMedio, 30) / 30);
    }
    case "document": {
      const cands = aptas.filter((c) =>
        fracao(perfis[c].valores, pareceCodigo) >= 0.8 &&
        fracao(perfis[c].valores, pareceCpfCnpj) < 0.5 &&
        fracao(perfis[c].valores, pareceTelefone) < 0.5 &&
        perfis[c].distintos >= 0.5);
      return melhor(cands, (c) => perfis[c].distintos);
    }
    default:
      return null;
  }
}

// ── Células ───────────────────────────────────────────────────────────────────

/** Nome da célula: tira o código do cadastro à frente ("1127 - JOAO") e aspas. */
function limparNome(s: string): string {
  return s
    .replace(/^["']|["']$/g, "")
    .replace(/^\d{1,10}\s*[-–—]\s+/, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

// ── Principal ─────────────────────────────────────────────────────────────────

/**
 * Interpreta uma tabela. Cada linha de cabeçalho abre um trecho com o próprio
 * mapeamento (abas de layouts diferentes coladas, relatórios por página).
 */
export function interpretarTabela(rowsBrutas: string[][], duvidosasBrutas?: boolean[][]): TabelaInterpretada {
  // Células lidas com pouca confiança pelo OCR seguem junto com a linha.
  const duvidasPorLinha = new Map<string[], boolean[]>();
  const rows = rowsBrutas
    .map((r, i) => {
      const limpa = r.map((c) => (c ?? "").replace(/\s+/g, " ").trim());
      if (duvidosasBrutas?.[i]) duvidasPorLinha.set(limpa, duvidosasBrutas[i]);
      return limpa;
    })
    .filter((r) => r.some(Boolean));
  const resultado: TabelaInterpretada = { candidates: [], colunas: {}, inferidos: [], ignoradas: 0 };
  if (!rows.length) return resultado;
  const duvidosos = new Set<RecordCandidate>();

  const cabecalhos: number[] = [];
  rows.forEach((r, i) => { if (ehLinhaDeCabecalho(r)) cabecalhos.push(i); });

  // Sem cabeçalho: a tabela toda é dado, e as colunas saem só do conteúdo.
  const trechos = cabecalhos.length
    ? cabecalhos.map((h, k) => ({ cabecalho: rows[h], corpo: rows.slice(h + 1, cabecalhos[k + 1] ?? rows.length) }))
    : [{ cabecalho: [] as string[], corpo: rows }];

  const vistos = new Set<string>();
  for (const { cabecalho, corpo } of trechos) {
    if (!corpo.length) continue;
    const largura = Math.max(cabecalho.length, ...corpo.map((r) => r.length));
    const perfis = Array.from({ length: largura }, (_, c) => perfilDaColuna(corpo, c));

    const mapa = mapearPorTitulo(cabecalho, perfis);
    const inferidos: Campo[] = [];
    for (const f of ["dueDate", "value", "phone", "client", "document"] as const) {
      if (f in mapa) continue;
      const usadas = new Set(Object.values(mapa));
      const livres = Array.from({ length: largura }, (_, c) => c).filter((c) => !usadas.has(c));
      const c = inferirColuna(f, livres, cabecalho, perfis);
      if (c !== null) { mapa[f] = c; inferidos.push(f); }
    }
    // Sem nome de cliente, ou sem valor e vencimento, não é uma tabela de cobrança.
    if (mapa.client === undefined && mapa.supplier === undefined) continue;
    if (mapa.value === undefined && mapa.dueDate === undefined) continue;

    for (const [f, c] of Object.entries(mapa) as [Campo, number][]) {
      if (!(f in resultado.colunas)) resultado.colunas[f] = cabecalho[c] ?? "";
    }
    for (const f of inferidos) if (!resultado.inferidos.includes(f)) resultado.inferidos.push(f);

    const ordemData = mapa.dueDate !== undefined ? detectarOrdemDatas(perfis[mapa.dueDate].valores) : "dmy";
    const colunasMapeadas = new Set(Object.values(mapa));
    let anterior: RecordCandidate | null = null;

    for (const row of corpo) {
      const cel = (f: Campo) => (mapa[f] !== undefined ? (row[mapa[f]!] ?? "").trim() : "");
      if (ehLinhaDeCabecalho(row)) { resultado.ignoradas++; continue; }

      const clienteBruto = cel("client");
      const dueDate = parseDateBR(cel("dueDate"), ordemData, true);
      const valor = parseMoney(cel("value"));
      const documento = cel("document");
      const telefone = pickPhone(cel("phone"));

      if (ehRuidoDePagina(row.filter(Boolean).join(" "))) { anterior = null; continue; }

      // Continuação de nome quebrado em duas linhas: só texto na coluna do cliente.
      const soCliente = clienteBruto && row.every((c, i) => !c || i === mapa.client);
      // Duvidosa: palavra lida com pouca confiança pelo OCR, ou valor/vencimento
      // preenchido que não deu para ler ("1.18O,35") — nunca vira zero calado.
      const duvidas = duvidasPorLinha.get(row);
      const linhaDuvidosa =
        Boolean(duvidas && [...colunasMapeadas].some((c) => duvidas[c])) ||
        (cel("value") !== "" && valor === null) ||
        (cel("dueDate") !== "" && dueDate === null);

      if (soCliente && anterior && !pareceLinhaDeTotal(clienteBruto)) {
        anterior.client = limparNome(`${anterior.client ?? ""} ${clienteBruto}`);
        if (linhaDuvidosa) duvidosos.add(anterior);
        continue;
      }

      const primeiroTexto = row.find(Boolean) ?? "";
      if (!dueDate && (pareceLinhaDeTotal(clienteBruto) || pareceLinhaDeTotal(primeiroTexto))) {
        resultado.ignoradas++;
        anterior = null;
        continue;
      }
      // Linha sem nenhum dado de cobrança (título, rodapé, observação solta).
      if (!dueDate && (valor === null || valor === 0) && !documento && !telefone) {
        if (row.some((c, i) => c && colunasMapeadas.has(i))) resultado.ignoradas++;
        anterior = null;
        continue;
      }

      const client = limparNome(clienteBruto) || null;
      const supplier = limparNome(cel("supplier")) || null;
      if (!client && !supplier) { anterior = null; continue; }

      const record: RecordCandidate = {
        client: client ?? supplier,
        bank: cel("bank") ? cel("bank").toUpperCase() : null,
        supplier,
        cnpj: cel("cnpj") || null,
        document: documento && !pareceData(documento) ? documento.slice(0, 60) : null,
        dueDate,
        value: valor !== null && valor > 0 ? valor : null,
        valuePaid: null,
        phone: telefone,
        status: cel("status") || null,
        docType: cel("docType") || null,
        confidenceScore: 0,
        extractionMethod: "tabela",
      };
      record.confidenceScore = score(record);
      if (record.confidenceScore < 45) { anterior = null; continue; }

      const chave = [record.client, record.document, record.dueDate, record.value].join("|");
      if (vistos.has(chave)) { resultado.ignoradas++; continue; }
      vistos.add(chave);

      resultado.candidates.push(record);
      if (linhaDuvidosa) duvidosos.add(record);
      anterior = record;
    }
  }

  // A pontuação considera o nome final (continuações já juntadas). Registro com
  // célula lida com pouca confiança pelo OCR fica abaixo de 75: vai para revisão.
  for (const r of resultado.candidates) {
    r.confidenceScore = duvidosos.has(r) ? Math.min(score(r), 70) : score(r);
  }
  return resultado;
}
