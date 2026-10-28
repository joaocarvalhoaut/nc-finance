/**
 * Extração local de cobranças — gratuita, determinística, sem API externa.
 * Nada do arquivo sai do navegador.
 *
 * Fluxo:
 *   1. lerArquivo (leitores.ts): o arquivo vira tabelas + texto corrido;
 *   2. interpretarDocumento: as tabelas passam pelo intérprete de colunas
 *      (tableInterpreter.ts) e o texto pelas heurísticas de relatório
 *      (heuristics.ts); fica a leitura que extraiu registros mais completos;
 *   3. os registros saem no formato do Debtor, com nono dígito no celular.
 *
 * Texto colado usa extrairDeTexto: se for uma tabela (colagem do Excel, CSV),
 * vai pelo intérprete de colunas; senão, pelas heurísticas.
 */

import { normalizeText, assessTextQuality, looksLikeDelimited } from "./normalizeText";
import {
  parseErpFormat,
  parseDelimitedFormat,
  parseLineByLine,
  score,
  RecordCandidate,
  BANK_INSTITUTION_KEYWORDS,
} from "./heuristics";
import { interpretarTabela, NOME_CAMPO, type Campo } from "./tableInterpreter";
import { comoTabela } from "./textoDelimitado";
import type { DocumentoImportado, TipoDocumento } from "./leitores";
import { maskName } from "./piiUtils";
import { ensureNinthDigit } from "../../../supabase/functions/_shared/brPhone.ts";

/**
 * Tenta extrair o nome do banco a partir do nome do arquivo.
 * Ex: "VENCIDOS_ABR_maio.pdf" → "ABR"
 *     "BRADESCO vencidos 2026.pdf" → "BRADESCO"
 * Retorna string vazia se não encontrar.
 */
function extractBankFromFilename(filename: string): string {
  const stem = filename.replace(/\.[^.]+$/, ""); // remove extensão
  // Tokeniza por espaço, underscore, hífen, ponto
  const tokens = stem.split(/[\s_\-\.]+/).map((t) => t.toUpperCase().replace(/[^A-ZÁÉÍÓÚÂÊÎÔÛÃÕÀÇ]/gi, ""));
  for (const token of tokens) {
    if (token.length >= 2 && BANK_INSTITUTION_KEYWORDS.has(token)) {
      return token;
    }
  }
  return "";
}

// ── Public types ──────────────────────────────────────────────────────────────

/** Single extracted financial record, compatible with Debtor / ExtractedDebtorCandidate */
export interface LocalRecord {
  client: string;
  bank: string;
  supplier: string;
  document: string;
  dueDate: string;
  value: number;
  phone: string;
  status: string;
  confidenceScore: number;
}

export interface LocalExtractionResult {
  records: LocalRecord[];
  warnings: string[];
  /** Which extraction strategy was used */
  method: string;
  /** Total candidates found before filtering */
  totalCandidates: number;
  /** Candidates below the 75-confidence threshold */
  lowConfidenceCount: number;
  /** Records where doc number was missing and a DOC-N placeholder was used */
  missingDocCount: number;
  /** Uma linha para o usuário: como o arquivo foi lido. */
  resumo: string;
}

export type { DocumentoImportado } from "./leitores";
export { lerArquivo, ACEITA_IMPORTACAO } from "./leitores";

// ── Private helpers ───────────────────────────────────────────────────────────

/**
 * Normaliza uma data para DD/MM/YYYY a partir dos formatos aceitos na extração:
 * "15/06/26", "15-06-2026", "15.06.26" → "15/06/2026"; ISO "2026-06-15" →
 * "15/06/2026". Vazio/inesperado retorna como veio (operador revisa na tabela).
 */
function normalizeBrDate(raw: string): string {
  const s = raw.trim();

  // ISO YYYY-MM-DD (exportações de sistema)
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;

  // DD/MM/YY(YY) com separador barra, hífen ou ponto
  const br = s.match(/^(\d{2})[/\-.](\d{2})[/\-.](\d{2}|\d{4})$/);
  if (!br) return raw;
  const [, dd, mm, yy] = br;
  const year = yy.length === 2 ? `20${yy}` : yy;
  return `${dd}/${mm}/${year}`;
}

function candidateToRecord(
  c: RecordCandidate,
  idx: number,
): { record: LocalRecord; usedPlaceholder: boolean } | null {
  // Precisa ter ao menos cliente ou fornecedor para ser um registro válido
  const clientName = c.client || c.supplier || null;
  if (!clientName) return null;

  // Rejeita strings que parecem datas (DD/MM, DD/MM/YYYY, DD/MM/YY)
  const looksLikeDate = (s: string) =>
    /^\d{1,2}\/\d{1,2}(\/\d{2,4})?$/.test(s) ||   // 20/05 ou 20/05/2026
    /^\d{4}-\d{2}-\d{2}$/.test(s);                  // 2026-05-20

  const rawDocRaw = c.document?.trim();
  const rawDoc = rawDocRaw && !looksLikeDate(rawDocRaw) ? rawDocRaw : null;
  const usedPlaceholder = !rawDoc;
  const document = rawDoc || `DOC-${idx + 1}`;

  // Campos ausentes ficam vazios para o operador preencher manualmente.
  // Normaliza DD/MM/YY → DD/MM/YYYY (relatórios/ERP usam ano de 2 dígitos).
  const dueDate = normalizeBrDate(c.dueDate ?? "");
  const value = (c.value != null && c.value >= 0) ? c.value : 0;

  return {
    record: {
      client: clientName.trim().slice(0, 120),
      bank: (c.bank ?? "").trim().slice(0, 80),
      supplier: (c.supplier ?? "").trim().slice(0, 120),
      document,
      dueDate,
      value,
      phone: (c.phone ?? "").replace(/\D/g, ""),
      status: c.status ?? "Aberto",
      confidenceScore: c.confidenceScore,
    },
    usedPlaceholder,
  };
}

/** Heurísticas de relatório em texto corrido: tabela delimitada, âncora de CNPJ, linha a linha. */
function heuristicasDeTexto(text: string): { candidates: RecordCandidate[]; method: string } {
  if (looksLikeDelimited(text)) {
    const c = parseDelimitedFormat(text);
    if (c.length) return { candidates: c, method: "delimited-table" };
  }
  const cnpjCount = (text.match(/\b\d{2}\.?\d{3}\.?\d{3}[/\\]?\d{4}-?\d{2}\b/g) ?? []).length;
  if (cnpjCount > 0) {
    const c = parseErpFormat(text);
    if (c.length) return { candidates: c, method: "erp-cnpj-anchor" };
  }
  return { candidates: parseLineByLine(text), method: "line-by-line" };
}

/**
 * Soma das notas de PRESENÇA dos campos: favorece a leitura que achou mais
 * registros e mais completos. Usa score() e não confidenceScore, que na tabela
 * já vem rebaixado nos registros a revisar (OCR duvidoso) — senão a tabela
 * perdia para o texto justamente quando tinha algo a avisar.
 */
const qualidade = (cs: RecordCandidate[]) => cs.reduce((s, c) => s + score(c), 0);

const ROTULO_TIPO: Record<TipoDocumento | "colado", string> = {
  planilha: "Planilha",
  csv: "CSV",
  texto: "Texto",
  pdf: "PDF",
  "pdf-ocr": "PDF escaneado",
  imagem: "Imagem",
  colado: "Texto colado",
};

const CAMPOS_DO_RESUMO: Campo[] = ["client", "document", "dueDate", "value", "phone"];

interface LeituraTabelas {
  candidates: RecordCandidate[];
  colunas: Set<Campo>;
  inferidos: Set<Campo>;
  origens: string[];
}

function lerTabelas(tabelas: { origem: string; rows: string[][]; duvidosas?: boolean[][] }[]): LeituraTabelas {
  const out: LeituraTabelas = { candidates: [], colunas: new Set(), inferidos: new Set(), origens: [] };
  for (const t of tabelas) {
    const r = interpretarTabela(t.rows, t.duvidosas);
    if (!r.candidates.length) continue;
    out.candidates.push(...r.candidates);
    (Object.keys(r.colunas) as Campo[]).forEach((c) => out.colunas.add(c));
    r.inferidos.forEach((c) => out.inferidos.add(c));
    out.origens.push(t.origem);
  }
  return out;
}

interface Contexto {
  tipo: TipoDocumento | "colado";
  nomeArquivo?: string;
  avisos: string[];
  texto: string;
  tabelas: { origem: string; rows: string[][]; duvidosas?: boolean[][] }[];
}

function extrair(ctx: Contexto): LocalExtractionResult {
  const warnings = [...ctx.avisos];
  const text = normalizeText(ctx.texto);
  const quality = assessTextQuality(text, 1);

  if (quality === "empty" && !ctx.tabelas.length) {
    return {
      records: [],
      warnings: [
        ...warnings,
        ctx.tipo === "imagem" || ctx.tipo === "pdf-ocr"
          ? "Não foi possível reconhecer texto na imagem. Use uma foto nítida, de frente, com boa luz e sem cortar as bordas."
          : "Nenhum texto encontrado no documento. Se for um PDF escaneado, importe o arquivo (não cole o texto) para que ele seja lido como imagem.",
      ],
      method: "empty",
      totalCandidates: 0,
      lowConfidenceCount: 0,
      missingDocCount: 0,
      resumo: "",
    };
  }

  // 1. Tabelas (planilha, CSV, colunas do PDF/OCR) e 2. heurísticas de texto.
  const porTabela = lerTabelas(ctx.tabelas);
  const deveTentarTexto = ctx.tipo !== "planilha" || porTabela.candidates.length === 0;
  const porTexto = deveTentarTexto && quality !== "empty" ? heuristicasDeTexto(text) : { candidates: [], method: "" };

  // Fica a melhor leitura. Empate (ou quase) fica com a tabela: nela cada campo
  // vem da sua coluna, sem adivinhar onde termina o nome e começa o telefone.
  const usaTabela = porTabela.candidates.length > 0 && qualidade(porTabela.candidates) * 1.1 >= qualidade(porTexto.candidates);
  const candidates = usaTabela ? porTabela.candidates : porTexto.candidates;
  const method = usaTabela ? `tabela-${ctx.tipo}` : porTexto.method;

  // Resumo de uma linha: de onde veio e que colunas foram reconhecidas.
  let resumo = ROTULO_TIPO[ctx.tipo];
  if (usaTabela) {
    if (porTabela.origens.length === 1 && porTabela.origens[0].startsWith("aba")) resumo += `, ${porTabela.origens[0]}`;
    else if (porTabela.origens.length > 1 && ctx.tipo === "planilha") resumo += `, ${porTabela.origens.length} abas`;
    const reconhecidas = CAMPOS_DO_RESUMO.filter((c) => porTabela.colunas.has(c)).map((c) => NOME_CAMPO[c]);
    if (reconhecidas.length) resumo += ` · colunas: ${reconhecidas.join(", ")}`;
  } else if (candidates.length) {
    resumo += " · lido como relatório de texto";
  }

  if (usaTabela && candidates.length) {
    if (!porTabela.colunas.has("phone")) {
      warnings.push("Nenhuma coluna de telefone encontrada: os números ficam em branco para você preencher.");
    }
    if (!porTabela.colunas.has("dueDate")) warnings.push("Nenhuma coluna de vencimento encontrada.");
    const inferidos = [...porTabela.inferidos].filter((c) => CAMPOS_DO_RESUMO.includes(c)).map((c) => NOME_CAMPO[c]);
    if (inferidos.length) {
      warnings.push(`Colunas sem título reconhecido identificadas pelo conteúdo (${inferidos.join(", ")}): confira na revisão.`);
    }
  }

  // Banco pelo nome do arquivo (prioridade para registros sem banco).
  const bankFromFilename = ctx.nomeArquivo ? extractBankFromFilename(ctx.nomeArquivo) : "";
  if (bankFromFilename) {
    warnings.push(`Banco detectado no nome do arquivo: "${bankFromFilename}" — será usado como padrão para todos os registros sem banco definido.`);
  }

  const conversionResults = candidates
    .map((c, i) => candidateToRecord(c, i))
    .filter((r) => r !== null);

  const records = conversionResults.map((r) => r!.record).map((rec) => ({
    ...rec,
    bank: rec.bank || bankFromFilename,
    // Nono dígito só aqui, com o registro já montado: o parser de texto usa o
    // número detectado para achar onde termina o nome do cliente, e um número
    // alterado antes disso quebraria essa busca.
    phone: rec.phone ? ensureNinthDigit(rec.phone) : rec.phone,
  }));
  const missingDocCount = conversionResults.filter((r) => r!.usedPlaceholder).length;
  const lowConfCount = records.filter((r) => r.confidenceScore < 75).length;

  if (records.length === 0 && candidates.length > 0) {
    warnings.push(
      `${candidates.length} linha(s) com campos parciais detectada(s), mas nenhuma tem ` +
        "todos os campos obrigatórios (cliente, vencimento, valor). " +
        "Verifique o formato do arquivo.",
    );
  }
  if (lowConfCount > 0) {
    warnings.push(
      `${lowConfCount} registro(s) extraídos com confiança baixa (<75%). ` +
        "Revise os dados antes de enviar para a Visão Geral.",
    );
  }

  // Log seguro — só metadados; prévia do primeiro registro com PII mascarada.
  console.log(
    JSON.stringify({
      source: "localExtraction.result",
      tipo: ctx.tipo,
      method,
      tabela: porTabela.candidates.length,
      texto: porTexto.candidates.length,
      records: records.length,
      low_confidence: lowConfCount,
      missing_doc: missingDocCount,
      preview: records[0]
        ? {
            client: maskName(records[0].client),
            doc: records[0].document?.startsWith("DOC-") ? records[0].document : "***",
            dueDate: records[0].dueDate,
            hasPhone: Boolean(records[0].phone),
          }
        : null,
    }),
  );

  return {
    records,
    warnings,
    method,
    totalCandidates: candidates.length,
    lowConfidenceCount: lowConfCount,
    missingDocCount,
    resumo: records.length ? resumo : "",
  };
}

// ── Main exports ──────────────────────────────────────────────────────────────

/** Interpreta um arquivo já lido por lerArquivo. */
export function interpretarDocumento(doc: DocumentoImportado): LocalExtractionResult {
  return extrair({ tipo: doc.tipo, nomeArquivo: doc.nomeArquivo, avisos: doc.avisos, texto: doc.texto, tabelas: doc.tabelas });
}

/** Texto colado (ou editado) na tela de importação. */
export function extrairDeTexto(texto: string, nomeArquivo?: string): LocalExtractionResult {
  const normalizado = (texto ?? "").replace(/\r\n?/g, "\n");
  const tabela = comoTabela(normalizado.trim());
  return extrair({ tipo: "colado", nomeArquivo, avisos: [], texto: normalizado, tabelas: tabela ? [{ origem: "texto", rows: tabela }] : [] });
}

/**
 * Compatibilidade: extrai de um texto já lido. O arquivo, se vier, só serve
 * para detectar o banco pelo nome — a leitura de PDF escaneado agora é feita
 * por lerArquivo.
 */
export async function extractDocumentLocally(
  rawText: string,
  _category?: string,
  file?: File,
): Promise<LocalExtractionResult> {
  return extrairDeTexto(rawText, file?.name);
}

export type { RecordCandidate } from "./heuristics";
