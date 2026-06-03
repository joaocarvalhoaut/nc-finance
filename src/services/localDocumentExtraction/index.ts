/**
 * Local document extraction pipeline — free, deterministic, no external APIs.
 *
 * Execution order:
 *   1. Normalise input text
 *   2. Choose strategy: delimited table | ERP CNPJ-anchor | line-by-line
 *   3. OCR fallback (tesseract.js, optional) when text quality is too poor
 *   4. Return records compatible with the existing Debtor / import flow
 */

import { normalizeText, assessTextQuality, looksLikeDelimited } from "./normalizeText";
import {
  parseErpFormat,
  parseDelimitedFormat,
  parseLineByLine,
  RecordCandidate,
  BANK_KEYWORDS,
} from "./heuristics";
import { extractOCRFromPdfFile } from "./ocrFallback";
import { maskName } from "./piiUtils";

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
    if (token.length >= 2 && BANK_KEYWORDS.has(token)) {
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
}

// ── Private helpers ───────────────────────────────────────────────────────────

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

  // Campos ausentes ficam vazios para o operador preencher manualmente
  const dueDate = c.dueDate ?? "";
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

function choosePrimaryStrategy(
  text: string,
): "delimited" | "erp" | "line-by-line" {
  if (looksLikeDelimited(text)) return "delimited";

  // If there are CNPJ patterns in the text, use the ERP anchor parser
  const cnpjCount = (text.match(/\b\d{2}\.?\d{3}\.?\d{3}[/\\]?\d{4}-?\d{2}\b/g) ?? []).length;
  if (cnpjCount > 0) return "erp";

  return "line-by-line";
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Extract financial records from a text document.
 *
 * @param rawText    Text already extracted from the file (by importFileParser)
 * @param _category  Import category hint (unused in logic, kept for API compat)
 * @param file       Optional original File for OCR fallback (scanned PDFs)
 */
export async function extractDocumentLocally(
  rawText: string,
  _category?: string,
  file?: File,
): Promise<LocalExtractionResult> {
  const warnings: string[] = [];
  let method = "unknown";

  // 1. Normalise
  let text = normalizeText(rawText);
  const numPages = file ? 1 : 1; // page count hint (1 = conservative)
  let quality = assessTextQuality(text, numPages);

  // 2. OCR fallback when text is nearly empty and we have a PDF file
  if (quality !== "good" && file?.name.toLowerCase().endsWith(".pdf")) {
    warnings.push(
      "Texto extraído insuficiente — tentando OCR local (requer tesseract.js instalado)…",
    );
    const ocrText = await extractOCRFromPdfFile(file);

    if (ocrText.trim().length > text.trim().length) {
      text = normalizeText(ocrText);
      quality = assessTextQuality(text, numPages);
      method = "ocr";
    } else {
      warnings.push(
        ocrText.trim()
          ? "OCR retornou texto menor que o extraído pelo pdfjs — usando extração original."
          : "OCR não disponível ou falhou. Instale tesseract.js para suporte a PDFs escaneados: npm install tesseract.js",
      );
    }
  }

  // 3. Empty guard
  if (quality === "empty") {
    return {
      records: [],
      warnings: [
        "Nenhum texto extraído do documento. Verifique se o PDF contém texto acessível (não escaneado) ou instale tesseract.js.",
      ],
      method: "empty",
      totalCandidates: 0,
      lowConfidenceCount: 0,
      missingDocCount: 0,
    };
  }

  // 4a. Tenta extrair banco do nome do arquivo (prioridade máxima)
  const bankFromFilename = file ? extractBankFromFilename(file.name) : "";
  if (bankFromFilename) {
    warnings.push(`Banco detectado no nome do arquivo: "${bankFromFilename}" — será usado como padrão para todos os registros sem banco definido.`);
  }

  // 4. Choose strategy and parse
  const strategy = choosePrimaryStrategy(text);
  let candidates: RecordCandidate[] = [];

  if (strategy === "delimited") {
    candidates = parseDelimitedFormat(text);
    method = method === "ocr" ? "ocr+delimited" : "delimited-table";
  }

  if (strategy === "erp" || (strategy === "delimited" && candidates.length === 0)) {
    candidates = parseErpFormat(text);
    method = method === "ocr" ? "ocr+erp" : "erp-cnpj-anchor";
  }

  if (candidates.length === 0) {
    candidates = parseLineByLine(text);
    method = method === "ocr" ? "ocr+line" : "line-by-line";
  }

  // 5. Build final records
  const conversionResults = candidates
    .map((c, i) => candidateToRecord(c, i))
    .filter((r) => r !== null);

  const records = conversionResults.map((r) => r!.record).map((rec) => ({
    ...rec,
    // Banco do filename tem prioridade; se já veio do documento, mantém
    bank: rec.bank || bankFromFilename,
  }));
  const missingDocCount = conversionResults.filter((r) => r!.usedPlaceholder).length;

  // Conta somente registros que chegaram à lista final com baixa confiança
  const lowConfCount = records.filter((r) => r.confidenceScore < 75).length;

  // 6. Warnings
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

  // Safe log — no raw PII values, only metadata
  console.log(
    JSON.stringify({
      source: "localExtraction.result",
      strategy,
      method,
      candidates: candidates.length,
      records: records.length,
      low_confidence: lowConfCount,
      missing_doc: missingDocCount,
      quality,
      // First record preview uses PII-masked values only
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
  };
}

export type { RecordCandidate } from "./heuristics";
