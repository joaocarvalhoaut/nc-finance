/**
 * Leitores de arquivo da importação: cada formato vira um DocumentoImportado —
 * tabelas (células já como texto) e o texto corrido para a prévia.
 *
 *   Excel/ODS → células com o tipo real (data é data, número é número). Antes a
 *               planilha virava CSV pelo formato de exibição: data no padrão
 *               americano ("5/10/26") e telefone em notação científica quebravam.
 *   CSV/TXT   → codificação detectada (Windows-1252 dos ERPs) e CSV com aspas.
 *   PDF       → linhas e colunas reconstruídas pela posição do texto; página
 *               escaneada (sem texto) passa pelo OCR.
 *   Imagem    → OCR (foto ou print do relatório).
 */

import * as XLSX from "xlsx";
import { agruparLinhas, detectarTabelas, linhasParaTexto, type ItemPosicionado, type Linha } from "./layout";
import { comoTabela, decodificarTexto } from "./textoDelimitado";
import { criarLeitorOcr, prepararImagem, type AvisoProgresso, type LeitorOcr } from "./ocr";

export type TipoDocumento = "planilha" | "csv" | "texto" | "pdf" | "pdf-ocr" | "imagem";

export interface DocumentoImportado {
  nomeArquivo: string;
  tipo: TipoDocumento;
  tabelas: { origem: string; rows: string[][]; duvidosas?: boolean[][] }[];
  /** Texto corrido: prévia na tela e entrada das heurísticas de texto. */
  texto: string;
  avisos: string[];
}

export const EXTENSOES_PLANILHA = [".xlsx", ".xlsm", ".xls", ".ods"];
export const EXTENSOES_TEXTO = [".csv", ".txt", ".tsv"];
export const EXTENSOES_IMAGEM = [".png", ".jpg", ".jpeg", ".webp", ".bmp"];

/** Valor do atributo `accept` dos campos de arquivo da importação. */
export const ACEITA_IMPORTACAO = [".pdf", ...EXTENSOES_PLANILHA, ...EXTENSOES_TEXTO, ...EXTENSOES_IMAGEM].join(",");

const terminaCom = (nome: string, exts: string[]) => exts.some((e) => nome.endsWith(e));

/** Página do PDF é escaneada quando quase não tem texto. */
const CARACTERES_MINIMOS_POR_PAGINA = 40;
const MAX_PAGINAS_OCR = 20;
const MAX_LINHAS_PLANILHA = 20_000;

export async function lerArquivo(arquivo: File, aviso?: AvisoProgresso): Promise<DocumentoImportado> {
  const nome = arquivo.name.toLowerCase();
  if (nome.endsWith(".pdf")) return lerPdf(arquivo, aviso);
  if (terminaCom(nome, EXTENSOES_PLANILHA)) return lerPlanilha(arquivo);
  if (terminaCom(nome, EXTENSOES_TEXTO)) return lerTexto(arquivo);
  if (terminaCom(nome, EXTENSOES_IMAGEM) || arquivo.type.startsWith("image/")) return lerImagem(arquivo, aviso);
  throw new Error("Formato não suportado. Use PDF, Excel (XLSX, XLS, ODS), CSV, TXT ou uma imagem (JPG, PNG).");
}

// ── Planilha ──────────────────────────────────────────────────────────────────

const dd = (n: number) => String(n).padStart(2, "0");

function textoDaCelula(cell: XLSX.CellObject | undefined): string {
  if (!cell || cell.v === undefined || cell.v === null) return "";
  if (cell.t === "n" && typeof cell.v === "number") {
    if (cell.z && XLSX.SSF.is_date(cell.z)) {
      const d = XLSX.SSF.parse_date_code(cell.v);
      if (d && d.y) return `${dd(d.d)}/${dd(d.m)}/${d.y}`;
    }
    // Número cru com vírgula decimal: sem separador de milhar, nada é ambíguo.
    return Number.isInteger(cell.v) ? String(cell.v) : String(cell.v).replace(".", ",");
  }
  if (cell.t === "d" && cell.v instanceof Date) {
    return `${dd(cell.v.getDate())}/${dd(cell.v.getMonth() + 1)}/${cell.v.getFullYear()}`;
  }
  if (cell.t === "b") return cell.v ? "SIM" : "NÃO";
  if (cell.t === "e") return "";
  return String(cell.v).replace(/\s+/g, " ").trim();
}

async function lerPlanilha(arquivo: File): Promise<DocumentoImportado> {
  let livro: XLSX.WorkBook;
  try {
    livro = XLSX.read(new Uint8Array(await arquivo.arrayBuffer()), { type: "array", cellNF: true, cellDates: false });
  } catch {
    throw new Error("Não foi possível abrir a planilha. Se ela tiver senha, salve uma cópia sem senha e tente de novo.");
  }

  const tabelas: DocumentoImportado["tabelas"] = [];
  const avisos: string[] = [];
  livro.SheetNames.forEach((nomeAba, i) => {
    if (livro.Workbook?.Sheets?.[i]?.Hidden) return;
    const aba = livro.Sheets[nomeAba];
    if (!aba?.["!ref"]) return;
    const area = XLSX.utils.decode_range(aba["!ref"]);
    const ultimaLinha = Math.min(area.e.r, area.s.r + MAX_LINHAS_PLANILHA);
    if (ultimaLinha < area.e.r) avisos.push(`A aba “${nomeAba}” tem mais de ${MAX_LINHAS_PLANILHA.toLocaleString("pt-BR")} linhas; só as primeiras foram lidas.`);
    const rows: string[][] = [];
    for (let r = area.s.r; r <= ultimaLinha; r++) {
      const row: string[] = [];
      for (let c = area.s.c; c <= area.e.c; c++) row.push(textoDaCelula(aba[XLSX.utils.encode_cell({ r, c })]));
      if (row.some(Boolean)) rows.push(row);
    }
    if (rows.length) tabelas.push({ origem: `aba “${nomeAba}”`, rows });
  });

  return {
    nomeArquivo: arquivo.name,
    tipo: "planilha",
    tabelas,
    texto: tabelas.map((t) => t.rows.map((r) => r.join(";")).join("\n")).join("\n\n"),
    avisos,
  };
}

// ── CSV / TXT ─────────────────────────────────────────────────────────────────

async function lerTexto(arquivo: File): Promise<DocumentoImportado> {
  const texto = decodificarTexto(await arquivo.arrayBuffer()).trim();
  const tabela = comoTabela(texto);
  return {
    nomeArquivo: arquivo.name,
    tipo: arquivo.name.toLowerCase().endsWith(".txt") ? "texto" : "csv",
    tabelas: tabela ? [{ origem: "arquivo", rows: tabela }] : [],
    texto,
    avisos: [],
  };
}

// ── PDF ───────────────────────────────────────────────────────────────────────

interface ItemPdf { str?: string; transform?: number[]; width?: number; height?: number }

async function lerPdf(arquivo: File, aviso?: AvisoProgresso): Promise<DocumentoImportado> {
  // Sob demanda: mantém o pdfjs (~1,2 MB) fora do bundle inicial.
  const { getDocument, GlobalWorkerOptions } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const { default: workerSrc } = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  GlobalWorkerOptions.workerSrc = workerSrc as string;

  const tarefa = getDocument({ data: new Uint8Array(await arquivo.arrayBuffer()) });
  let pdf: Awaited<typeof tarefa.promise>;
  try {
    pdf = await tarefa.promise;
  } catch (e) {
    const senha = e instanceof Error && /password/i.test(e.name + e.message);
    throw new Error(senha
      ? "Este PDF tem senha. Abra-o, salve uma cópia sem senha e importe a cópia."
      : "Não foi possível abrir o PDF. Verifique se o arquivo não está corrompido.");
  }

  const linhas: Linha[] = [];
  const avisos: string[] = [];
  let leitorOcr: LeitorOcr | null = null;
  let paginasOcr = 0;

  try {
    for (let p = 1; p <= pdf.numPages; p++) {
      aviso?.(pdf.numPages > 1 ? `Lendo página ${p} de ${pdf.numPages}…` : "Lendo o PDF…");
      const pagina = await pdf.getPage(p);
      const viewport = pagina.getViewport({ scale: 1 });
      const conteudo = await pagina.getTextContent();

      const itens: ItemPosicionado[] = [];
      for (const bruto of conteudo.items as ItemPdf[]) {
        const t = bruto.transform;
        if (typeof bruto.str !== "string" || !bruto.str.trim() || !t || t.length < 6) continue;
        const h = Math.hypot(t[2], t[3]) || bruto.height || 10;
        const [x, base] = viewport.convertToViewportPoint(t[4], t[5]);
        itens.push({ str: bruto.str, x, y: base - h * 0.35, w: bruto.width ?? bruto.str.length * h * 0.5, h });
      }

      const caracteres = itens.reduce((s, i) => s + i.str.trim().length, 0);
      if (caracteres >= CARACTERES_MINIMOS_POR_PAGINA) {
        linhas.push(...agruparLinhas(itens));
        continue;
      }

      // Página escaneada: renderiza e passa pelo OCR.
      if (paginasOcr >= MAX_PAGINAS_OCR) {
        if (paginasOcr === MAX_PAGINAS_OCR) avisos.push(`O PDF escaneado tem muitas páginas: só as ${MAX_PAGINAS_OCR} primeiras foram lidas por imagem.`);
        paginasOcr++;
        continue;
      }
      leitorOcr ??= await criarLeitorOcr(aviso);
      const escala = Math.min(3.5, Math.max(1.5, 2200 / viewport.width));
      const vp = pagina.getViewport({ scale: escala });
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(vp.width);
      canvas.height = Math.round(vp.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      await pagina.render({ canvasContext: ctx, viewport: vp, canvas }).promise;
      const palavras = await leitorOcr.ler(canvas, pdf.numPages > 1 ? `a página ${p}` : "o PDF escaneado");
      // De volta às unidades do PDF, para alinhar com as páginas que têm texto.
      linhas.push(...agruparLinhas(palavras.map((w) => ({ ...w, x: w.x / escala, y: w.y / escala, w: w.w / escala, h: w.h / escala }))));
      paginasOcr++;
    }
  } finally {
    await leitorOcr?.encerrar();
    void tarefa.destroy();
  }

  if (paginasOcr > 0) {
    avisos.push("Parte do PDF é imagem (escaneado) e foi lida por reconhecimento de texto: confira nomes e valores com atenção.");
  }
  return {
    nomeArquivo: arquivo.name,
    tipo: paginasOcr > 0 ? "pdf-ocr" : "pdf",
    tabelas: detectarTabelas(linhas, "pdf"),
    texto: linhasParaTexto(linhas),
    avisos,
  };
}

// ── Imagem ────────────────────────────────────────────────────────────────────

async function lerImagem(arquivo: File, aviso?: AvisoProgresso): Promise<DocumentoImportado> {
  const leitor = await criarLeitorOcr(aviso);
  try {
    const imagem = await prepararImagem(arquivo);
    const linhas = agruparLinhas(await leitor.ler(imagem, "a imagem"));
    return {
      nomeArquivo: arquivo.name,
      tipo: "imagem",
      tabelas: detectarTabelas(linhas, "imagem"),
      texto: linhasParaTexto(linhas),
      avisos: ["A imagem foi lida por reconhecimento de texto: confira nomes e valores com atenção."],
    };
  } finally {
    await leitor.encerrar();
  }
}
