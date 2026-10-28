/**
 * OCR (reconhecimento de texto em imagem) com tesseract.js, para PDF escaneado
 * e foto/print de relatório.
 *
 * Tudo é servido pelo próprio site, em /ocr (copiado de node_modules por
 * tools/ocr-assets.mjs): o worker, o núcleo WebAssembly e o idioma português.
 * Antes o tesseract buscava esses arquivos numa CDN externa, que o CSP do site
 * bloqueia — o OCR falhava sempre, em silêncio. Nada sai do navegador: a imagem
 * do relatório, com dados de clientes, é lida localmente.
 *
 * Devolve as palavras com posição (ItemPosicionado), para a mesma reconstrução
 * de colunas usada nos PDFs com texto.
 */

import type { ItemPosicionado } from "./layout";

const BASE = "/ocr";

/** Abaixo disto a palavra é ruído (sujeira, borda, carimbo) e é descartada. */
const CONFIANCA_MINIMA = 20;
/**
 * Abaixo disto a palavra é mantida, mas o registro vai para revisão: o OCR
 * erra sobretudo código com letra e número ("CH01-3" lido como "CcHo1-3"), e
 * um número de documento errado não pode passar sem ninguém ver.
 */
const CONFIANCA_SEGURA = 70;

export type AvisoProgresso = (mensagem: string) => void;

interface WorkerTesseract {
  recognize: (
    imagem: Blob | HTMLCanvasElement,
    opcoes?: Record<string, unknown>,
    saida?: Record<string, boolean>,
  ) => Promise<{ data: { text?: string; tsv?: string | null } }>;
  setParameters: (p: Record<string, string>) => Promise<unknown>;
  terminate: () => Promise<unknown>;
}

/**
 * Leitor de OCR reaproveitável: carregar o núcleo e o idioma leva alguns
 * segundos, então várias páginas usam o mesmo worker. Chame `encerrar()` no fim.
 */
export interface LeitorOcr {
  ler: (imagem: Blob | HTMLCanvasElement, rotulo: string) => Promise<ItemPosicionado[]>;
  encerrar: () => Promise<void>;
}

export async function criarLeitorOcr(aviso?: AvisoProgresso): Promise<LeitorOcr> {
  if (typeof document === "undefined") throw new Error("OCR disponível só no navegador.");
  aviso?.("Preparando a leitura de imagem…");

  let rotuloAtual = "";
  const { createWorker } = (await import("tesseract.js")) as unknown as {
    createWorker: (lang: string, oem: number, opts: Record<string, unknown>) => Promise<WorkerTesseract>;
  };
  const worker = await createWorker("por", 1, {
    workerPath: `${BASE}/worker.min.js`,
    corePath: `${BASE}/core`,
    langPath: `${BASE}/lang`,
    workerBlobURL: false,
    logger: (m: { status?: string; progress?: number }) => {
      if (m.status === "recognizing text" && typeof m.progress === "number" && rotuloAtual) {
        aviso?.(`Lendo ${rotuloAtual}… ${Math.round(m.progress * 100)}%`);
      }
    },
  });
  // Mantém os espaços entre palavras: ajuda a separar colunas.
  await worker.setParameters({ preserve_interword_spaces: "1" });

  return {
    async ler(imagem, rotulo) {
      rotuloAtual = rotulo;
      const { data } = await worker.recognize(imagem, { rotateAuto: true }, { text: true, tsv: true });
      return palavrasDoTsv(data.tsv ?? "");
    },
    async encerrar() {
      await worker.terminate().catch(() => undefined);
    },
  };
}

/**
 * TSV do tesseract → palavras posicionadas. Colunas: level, page_num,
 * block_num, par_num, line_num, word_num, left, top, width, height, conf, text.
 * Nível 5 = palavra.
 */
export function palavrasDoTsv(tsv: string): ItemPosicionado[] {
  const itens: ItemPosicionado[] = [];
  for (const linha of tsv.split("\n")) {
    const c = linha.split("\t");
    if (c.length < 12 || c[0] !== "5") continue;
    const texto = c.slice(11).join(" ").trim();
    const conf = Number(c[10]);
    if (!texto || !(conf >= CONFIANCA_MINIMA)) continue;
    const [x, y, w, h] = [Number(c[6]), Number(c[7]), Number(c[8]), Number(c[9])];
    if (![x, y, w, h].every(Number.isFinite)) continue;
    itens.push({ str: texto, x, y: y + h / 2, w, h, ...(conf < CONFIANCA_SEGURA ? { duvidoso: true } : {}) });
  }
  return itens;
}

/**
 * Foto pequena (print de celular, imagem reduzida) é ampliada antes do OCR: o
 * tesseract erra muito com letra de menos de ~20 px de altura.
 */
export async function prepararImagem(arquivo: Blob): Promise<Blob | HTMLCanvasElement> {
  if (typeof createImageBitmap === "undefined") return arquivo;
  try {
    const bmp = await createImageBitmap(arquivo);
    const maior = Math.max(bmp.width, bmp.height);
    if (maior >= 1800) { bmp.close(); return arquivo; }
    const escala = Math.min(2.5, 2400 / maior);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * escala);
    canvas.height = Math.round(bmp.height * escala);
    const ctx = canvas.getContext("2d");
    if (!ctx) { bmp.close(); return arquivo; }
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    return canvas;
  } catch {
    return arquivo;
  }
}
