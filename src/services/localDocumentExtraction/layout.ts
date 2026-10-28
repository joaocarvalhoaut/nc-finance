/**
 * Reconstrução de linhas e tabelas a partir de texto posicionado — os itens de
 * texto de um PDF (pdfjs) ou as palavras de um OCR (tesseract). Puro, sem DOM.
 *
 * Antes o PDF virava texto corrido: os itens de cada linha eram colados com
 * espaço e as heurísticas tentavam adivinhar onde terminava o nome e começava
 * o telefone. Aqui as COLUNAS são reconstruídas pela posição horizontal, como o
 * olho faz ao ler o relatório:
 *
 *   1. agrupa os itens em linhas pela altura (com tolerância proporcional à fonte);
 *   2. acha a linha de cabeçalho ("Sacado", "Vencimento", "Valor"…);
 *   3. nas linhas de dados abaixo dela, mede onde há texto em cada faixa
 *      horizontal; as faixas sempre vazias são os espaços entre colunas;
 *   4. cada item vai para a coluna em que mais se sobrepõe.
 *
 * O resultado é uma tabela de células (string[][]) que segue para o mesmo
 * intérprete das planilhas.
 */

import { countStrongFields } from "../../../supabase/functions/_shared/columnHeaders.ts";
import { isHeaderLine } from "./tableParser";
import { ehRuidoDePagina } from "./normalizeText";

/** Um pedaço de texto na página. Coordenadas de cima para baixo; y = centro vertical. */
export interface ItemPosicionado {
  str: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** OCR leu com pouca confiança: o registro vai para revisão. */
  duvidoso?: boolean;
}

export type Linha = ItemPosicionado[];

export interface TabelaReconstruida {
  origem: string;
  rows: string[][];
  /** Mesma forma de rows: células com palavra lida com pouca confiança pelo OCR. */
  duvidosas?: boolean[][];
}

const mediana = (ns: number[]): number => {
  if (!ns.length) return 0;
  const s = [...ns].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

/**
 * Remove itens repetidos no mesmo lugar. Alguns geradores de PDF simulam negrito
 * desenhando o texto duas vezes com deslocamento mínimo — sem isso, "JOAO" vira
 * "JOAO JOAO".
 */
function semDuplicados(itens: ItemPosicionado[]): ItemPosicionado[] {
  const out: ItemPosicionado[] = [];
  for (const it of itens) {
    const tol = Math.max(1, it.h * 0.2);
    if (out.some((o) => o.str === it.str && Math.abs(o.x - it.x) <= tol && Math.abs(o.y - it.y) <= tol)) continue;
    out.push(it);
  }
  return out;
}

/** Agrupa itens em linhas visuais, de cima para baixo, cada linha da esquerda para a direita. */
export function agruparLinhas(itensBrutos: ItemPosicionado[]): Linha[] {
  const itens = semDuplicados(itensBrutos.filter((i) => i.str.trim() !== ""));
  if (!itens.length) return [];
  const alturaTipica = mediana(itens.map((i) => i.h).filter((h) => h > 0)) || 10;
  const tolerancia = Math.max(1.5, alturaTipica * 0.45);

  const ordenados = [...itens].sort((a, b) => a.y - b.y || a.x - b.x);
  const linhas: { y: number; itens: ItemPosicionado[] }[] = [];
  for (const it of ordenados) {
    const atual = linhas[linhas.length - 1];
    if (atual && Math.abs(it.y - atual.y) <= tolerancia) {
      atual.itens.push(it);
      atual.y = atual.itens.reduce((s, i) => s + i.y, 0) / atual.itens.length;
    } else {
      linhas.push({ y: it.y, itens: [it] });
    }
  }
  return linhas.map((l) => l.itens.sort((a, b) => a.x - b.x));
}

/**
 * Junta itens vizinhos em texto. Itens quase encostados são pedaços da mesma
 * palavra (o pdfjs às vezes quebra "1.234,56" em "1.234" + ",56") e vão sem
 * espaço; os demais, com um espaço.
 */
export function juntarItens(itens: ItemPosicionado[]): string {
  let texto = "";
  let fimAnterior: number | null = null;
  for (const it of [...itens].sort((a, b) => a.x - b.x)) {
    const s = it.str.replace(/\s+/g, " ");
    if (fimAnterior === null) texto = s.trimStart();
    else {
      const vao = it.x - fimAnterior;
      const colado = vao < Math.max(0.5, it.h * 0.12) && !/\s$/.test(texto) && !/^\s/.test(s);
      texto += colado ? s : ` ${s.trimStart()}`;
    }
    fimAnterior = it.x + it.w;
  }
  return texto.replace(/\s+/g, " ").trim();
}

/** Texto corrido das linhas — para a prévia e para as heurísticas de texto. */
export function linhasParaTexto(linhas: Linha[]): string {
  return linhas.map(juntarItens).filter(Boolean).join("\n");
}

// ── Tabelas ───────────────────────────────────────────────────────────────────

const RE_DADO = /\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}|\d{4}-\d{2}-\d{2}|R\$|\b\d{1,3}(?:\.\d{3})*,\d{2}\b/;

/** Linha de dados: tem data ou valor em reais. */
const ehLinhaDeDados = (linha: Linha) => RE_DADO.test(juntarItens(linha));

/** Linha de cabeçalho: menciona 2+ campos conhecidos e não tem dados. */
const ehCabecalho = (linha: Linha) => {
  const texto = juntarItens(linha);
  return linha.length >= 2 && countStrongFields(texto) >= 2 && isHeaderLine(texto);
};

interface Faixa { x0: number; x1: number }

/**
 * Colunas = faixas horizontais com texto nas linhas de dados. Um vão só conta
 * como separação se for largo (≥ 0,6 da altura da fonte) e quase nenhuma linha
 * o atravessar (até 8% — um rodapé ou um total centralizado não funde colunas).
 */
function faixasDasColunas(linhasDeDados: Linha[], alturaTipica: number): Faixa[] {
  const itens = linhasDeDados.flat();
  if (!itens.length) return [];
  const passo = Math.max(0.5, alturaTipica / 8);
  const xMin = Math.min(...itens.map((i) => i.x));
  const xMax = Math.max(...itens.map((i) => i.x + i.w));
  const n = Math.ceil((xMax - xMin) / passo) + 1;
  const cobertura = new Array<number>(n).fill(0);
  for (const linha of linhasDeDados) {
    const marcados = new Set<number>();
    for (const it of linha) {
      const a = Math.floor((it.x - xMin) / passo);
      const b = Math.ceil((it.x + it.w - xMin) / passo);
      for (let k = a; k < b && k < n; k++) marcados.add(k);
    }
    for (const k of marcados) cobertura[k]++;
  }

  const limiteVao = Math.max(0, Math.floor(linhasDeDados.length * 0.08));
  const vaoMinimo = Math.max(2, Math.round((alturaTipica * 0.6) / passo));
  const faixas: Faixa[] = [];
  let inicio: number | null = null;
  let vazios = 0;
  for (let k = 0; k <= n; k++) {
    const ocupado = k < n && cobertura[k] > limiteVao;
    if (ocupado) {
      if (inicio === null) inicio = k;
      vazios = 0;
    } else if (inicio !== null) {
      vazios++;
      if (vazios >= vaoMinimo || k === n) {
        faixas.push({ x0: xMin + inicio * passo, x1: xMin + (k - vazios + 1) * passo });
        inicio = null;
        vazios = 0;
      }
    }
  }
  return faixas;
}

const sobreposicao = (it: ItemPosicionado, f: Faixa) => Math.max(0, Math.min(it.x + it.w, f.x1) - Math.max(it.x, f.x0));

/** Índice da faixa que mais recebe o item; sem sobreposição, a mais próxima. */
function faixaDoItem(it: ItemPosicionado, faixas: Faixa[]): number {
  let melhor = -1;
  let melhorSobre = 0;
  faixas.forEach((f, i) => {
    const s = sobreposicao(it, f);
    if (s > melhorSobre) { melhorSobre = s; melhor = i; }
  });
  if (melhor >= 0) return melhor;
  const centro = it.x + it.w / 2;
  let menorDist = Infinity;
  faixas.forEach((f, i) => {
    const d = centro < f.x0 ? f.x0 - centro : centro > f.x1 ? centro - f.x1 : 0;
    if (d < menorDist) { menorDist = d; melhor = i; }
  });
  return melhor;
}

function celulasDaLinha(linha: Linha, faixas: Faixa[]): { textos: string[]; duvidas: boolean[] } {
  const porColuna: ItemPosicionado[][] = faixas.map(() => []);
  for (const it of linha) {
    const i = faixaDoItem(it, faixas);
    if (i >= 0) porColuna[i].push(it);
  }
  return {
    textos: porColuna.map((itens) => juntarItens(itens)),
    duvidas: porColuna.map((itens) => itens.some((it) => it.duvidoso)),
  };
}

/**
 * Cabeçalho em duas linhas ("Data de" / "Vencimento", "Valor" / "Original"):
 * a linha de baixo, se não tiver dados e couber nas colunas, é juntada à de cima.
 */
function cabecalhoComSegundaLinha(linhas: Linha[], i: number, alturaTipica: number): { itens: Linha; usadas: number } {
  const cab = linhas[i];
  const prox = linhas[i + 1];
  if (!prox || ehLinhaDeDados(prox) || ehCabecalho(prox)) return { itens: cab, usadas: 1 };
  const yCab = mediana(cab.map((it) => it.y));
  const yProx = mediana(prox.map((it) => it.y));
  if (yProx - yCab > alturaTipica * 1.8) return { itens: cab, usadas: 1 };
  const juntos = juntarItens([...cab, ...prox]);
  if (countStrongFields(juntos) <= countStrongFields(juntarItens(cab))) return { itens: cab, usadas: 1 };
  return { itens: [...cab, ...prox], usadas: 2 };
}

/**
 * Tabelas de uma sequência de linhas (todas as páginas, em ordem). Cada
 * cabeçalho abre um trecho que vai até o próximo cabeçalho; páginas seguintes
 * sem cabeçalho repetido continuam o trecho anterior.
 */
export function detectarTabelas(linhas: Linha[], origem: string): TabelaReconstruida[] {
  const alturaTipica = mediana(linhas.flat().map((i) => i.h).filter((h) => h > 0)) || 10;
  const inicios: number[] = [];
  linhas.forEach((l, i) => { if (ehCabecalho(l)) inicios.push(i); });
  if (!inicios.length) return [];

  const tabelas: TabelaReconstruida[] = [];
  inicios.forEach((inicio, k) => {
    const fim = inicios[k + 1] ?? linhas.length;
    const { itens: cabecalho, usadas } = cabecalhoComSegundaLinha(linhas, inicio, alturaTipica);
    const corpo = linhas.slice(inicio + usadas, fim).filter((l) => !ehRuidoDePagina(juntarItens(l)));
    const dados = corpo.filter(ehLinhaDeDados);
    if (dados.length === 0) return;

    // Faixas pelas linhas de dados + cabeçalhos de colunas vazias (NFE em
    // branco, por exemplo), que senão grudariam no título da coluna vizinha.
    const faixas = faixasDasColunas(dados, alturaTipica);
    for (const it of cabecalho) {
      if (!faixas.some((f) => sobreposicao(it, f) > 0)) faixas.push({ x0: it.x, x1: it.x + it.w });
    }
    faixas.sort((a, b) => a.x0 - b.x0);
    if (faixas.length < 2) return;

    const celulas = [cabecalho, ...corpo].map((l) => celulasDaLinha(l, faixas));
    const duvidosas = celulas.map((c) => c.duvidas);
    tabelas.push({
      origem,
      rows: celulas.map((c) => c.textos),
      ...(duvidosas.some((r) => r.some(Boolean)) ? { duvidosas } : {}),
    });
  });
  return tabelas;
}
