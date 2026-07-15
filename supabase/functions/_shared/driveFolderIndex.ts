/**
 * driveFolderIndex.ts — per-user Drive folder indexing and boleto matching.
 *
 * Responsabilities:
 *   1. Save/update a user's Drive folder config (user_drive_folders)
 *   2. Index PDFs from the folder into user_drive_index (incremental)
 *   3. Extract boleto metadata from PDF content (regex, no binary deps)
 *   4. Score-based matching: debtor ↔ indexed file
 *   5. Batch match all debtors for a user → update user_registros_financeiros
 *
 * Security:
 *   - NEVER exposed to the browser — service_role only
 *   - Drive file IDs and access tokens never leave the backend
 *   - Logs are sanitized (no tokens, no raw phone numbers)
 */

import { createClient } from "npm:@supabase/supabase-js@2.49.8";
import { getGoogleAccessToken, listFilesInFolderDeep, type DriveFile } from "./googleDrive.ts";
import { bestNameSimilarity, blockingKeys } from "./nameMatch.ts";

type AdminClient = ReturnType<typeof createClient>;

// ─── Config ───────────────────────────────────────────────────────────────────

/** Minimum confidence score to auto-attach a PDF. Below this → no attachment. */
export const AUTO_ATTACH_THRESHOLD = 0.70;

/** Max PDF size to download for metadata extraction (bytes). Avoids timeouts. */
const MAX_PDF_BYTES_FOR_EXTRACTION = 5 * 1024 * 1024; // 5 MB

/**
 * Máximo de arquivos que passam pela extração de conteúdo (download do PDF +
 * leitura de linha digitável / CPF) por execução. Acima disso, o arquivo é
 * indexado de forma leve (nome + caminho da pasta), sem download — mantém a
 * varredura completa e rápida; execuções incrementais preenchem o conteúdo dos
 * arquivos restantes ao longo do tempo.
 */
const MAX_CONTENT_PER_RUN = 25;

/** How long a token cache entry is valid (seconds) */
const TOKEN_CACHE_TTL_S = 3_500;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FolderConfig {
  folderId:       string;
  folderName:     string | null;
  isAccessible:   boolean;
  fileCount:      number;
  lastIndexedAt:  string | null;
}

export interface IndexResult {
  filesFound:   number;
  filesIndexed: number;
  filesSkipped: number;  // already current (checksum match)
  filesError:   number;
  durationMs:   number;
  /** PDFs que ainda precisam de extração de conteúdo após esta execução */
  contentPending: number;
}

export interface BoletoMetadata {
  linhaDigitavel:    string | null;
  nossoNumero:       string | null;
  cpfCnpj:           string | null;
  clientName:        string | null;
  valor:             number | null;
  vencimento:        string | null; // YYYY-MM-DD
}

export interface DriveMatchResult {
  fileId:          string;
  fileName:        string;
  score:           number;
  reason:          string;
}

// ─── In-process token cache (per isolate, reset on cold start) ────────────────

let _cachedToken:   string | null = null;
let _tokenExpireAt: number        = 0;

async function getCachedAccessToken(email: string, privateKey: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (_cachedToken && now < _tokenExpireAt) return _cachedToken;

  const token = await getGoogleAccessToken(
    email,
    privateKey,
    "https://www.googleapis.com/auth/drive.readonly",
  );
  _cachedToken   = token;
  _tokenExpireAt = now + TOKEN_CACHE_TTL_S;
  return token;
}

// ─── PDF text extraction (pure Deno — no binary deps) ────────────────────────

/**
 * Download a Drive PDF file and return its raw bytes.
 * Uses the Drive API "alt=media" endpoint.
 */
export async function downloadDriveFile(
  fileId: string,
  accessToken: string,
  maxBytes = MAX_PDF_BYTES_FOR_EXTRACTION,
): Promise<Uint8Array | null> {
  try {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(20_000),
      },
    );

    if (!res.ok) return null;

    const contentLength = Number(res.headers.get("content-length") ?? 0);
    if (contentLength > maxBytes) return null; // skip large files

    const bytes = new Uint8Array(await res.arrayBuffer());
    return bytes.length > maxBytes ? null : bytes;
  } catch {
    return null;
  }
}

/**
 * Get Drive file metadata including md5Checksum and modifiedTime.
 */
export async function getDriveFileInfo(
  fileId: string,
  accessToken: string,
): Promise<{ md5Checksum: string | null; modifiedTime: string | null; size: number } | null> {
  try {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?fields=md5Checksum,modifiedTime,size`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(8_000),
      },
    );
    if (!res.ok) return null;
    const data = await res.json() as Record<string, string | null>;
    return {
      md5Checksum:  data.md5Checksum ?? null,
      modifiedTime: data.modifiedTime ?? null,
      size:         Number(data.size ?? 0),
    };
  } catch {
    return null;
  }
}

/**
 * Attempt FlateDecode (zlib) decompression of a PDF stream segment.
 * Returns empty buffer on failure.
 */
async function tryDeflate(data: Uint8Array): Promise<Uint8Array> {
  try {
    const ds = new DecompressionStream("deflate");
    const writer = ds.writable.getWriter();
    const reader = ds.readable.getReader();
    const chunks: Uint8Array[] = [];

    const writing = writer.write(data).then(() => writer.close());
    const reading = (async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
    })();

    await Promise.all([writing, reading]);
    const total = chunks.reduce((n, c) => n + c.length, 0);
    const out = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) { out.set(c, off); off += c.length; }
    return out;
  } catch {
    return new Uint8Array(0);
  }
}

/**
 * Extract human-readable text from PDF bytes.
 *
 * Strategy (layered, best-effort):
 *   1. Scan raw bytes for BT…ET text object blocks (works for uncompressed streams)
 *   2. Scan for FlateDecode compressed streams and decompress
 *   3. Direct regex scan over the raw string for boleto patterns
 *
 * Returns concatenated text. Empty string if the PDF is scan-only.
 */
export async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const latin1 = new TextDecoder("latin1").decode(bytes);
  const parts: string[] = [];

  // ── Layer 1: BT/ET literal strings ──────────────────────────────────────
  for (const btMatch of latin1.matchAll(/BT([\s\S]*?)ET/g)) {
    const block = btMatch[1];
    // Literal strings: (text)
    for (const m of block.matchAll(/\(([^\\\)]*(?:\\.[^\\\)]*)*)\)/g)) {
      const s = m[1]
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "\r")
        .replace(/\\t/g, "\t")
        .replace(/\\\\/g, "\\")
        .replace(/\\([0-7]{3})/g, (_, o) => String.fromCharCode(parseInt(o, 8)));
      if (s.trim()) parts.push(s);
    }
    // Hex strings: <HHHH>
    for (const m of block.matchAll(/<([0-9a-fA-F]+)>/g)) {
      const hex = m[1].length % 2 ? m[1] + "0" : m[1];
      let s = "";
      for (let i = 0; i < hex.length; i += 2) {
        s += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
      }
      if (s.trim()) parts.push(s);
    }
  }

  // ── Layer 2: FlateDecode compressed streams ──────────────────────────────
  for (const streamMatch of latin1.matchAll(/FlateDecode[\s\S]*?stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    const rawStream = new Uint8Array(
      [...streamMatch[1]].map((c) => c.charCodeAt(0)),
    );
    const decompressed = await tryDeflate(rawStream);
    if (decompressed.length > 0) {
      const text = new TextDecoder("latin1").decode(decompressed);
      // Extract literal strings from decompressed stream
      for (const m of text.matchAll(/\(([^\\\)]*(?:\\.[^\\\)]*)*)\)/g)) {
        if (m[1].trim()) parts.push(m[1]);
      }
    }
  }

  // ── Layer 3: Raw pass (boleto patterns are often in clear text in PDFs) ──
  parts.push(latin1);

  return parts.join(" ");
}

// ─── Boleto metadata extraction ───────────────────────────────────────────────

/** Strip non-digits */
const digits = (s: string) => s.replace(/\D/g, "");

/** Normalize: lowercase, remove accents, strip non-alnum */
export const normalizeText = (s: string): string =>
  (s ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Normalize filename: remove extension, then normalizeText */
export const normalizeFilename = (name: string): string =>
  normalizeText(name.replace(/\.[a-z]{2,5}$/i, ""));

/**
 * Extract boleto metadata from PDF text.
 *
 * Priority fields:
 *   1. Linha digitável (47/48 digits, formatted or raw)
 *   2. Nosso Número
 *   3. CPF / CNPJ
 *   4. Valor (R$)
 *   5. Vencimento
 *   6. Client name (heuristic)
 */
export function extractBoletoMetadata(text: string): BoletoMetadata {
  const t = text;

  // ── 1. Linha digitável ───────────────────────────────────────────────────
  // Formatted: "99999.99999 99999.999999 99999.999999 9 99999999999999"
  const linhaFmtMatch = t.match(
    /\d{5}\.\d{5}\s+\d{5}\.\d{6}\s+\d{5}\.\d{6}\s+\d\s+\d{14}/,
  );
  // Raw 47-48 digit sequence
  const linhaRawMatch = t.match(/\b(\d{47,48})\b/);

  let linhaDigitavel: string | null = null;
  if (linhaFmtMatch) {
    linhaDigitavel = digits(linhaFmtMatch[0]);
  } else if (linhaRawMatch) {
    linhaDigitavel = linhaRawMatch[1];
  }

  // ── 2. Nosso Número ──────────────────────────────────────────────────────
  let nossoNumero: string | null = null;
  const nossoMatch = t.match(/nosso\s*n[uú]mero[\s:]*([0-9\/\-\.]+)/i);
  if (nossoMatch) nossoNumero = nossoMatch[1].trim().replace(/[^0-9\/\-\.]/g, "");

  // ── 3. CPF / CNPJ ────────────────────────────────────────────────────────
  let cpfCnpj: string | null = null;
  // CNPJ: XX.XXX.XXX/XXXX-XX
  const cnpjMatch = t.match(/\b(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})\b/);
  // CPF: XXX.XXX.XXX-XX
  const cpfMatch = t.match(/\b(\d{3}\.\d{3}\.\d{3}-\d{2})\b/);
  if (cnpjMatch) cpfCnpj = digits(cnpjMatch[1]);
  else if (cpfMatch) cpfCnpj = digits(cpfMatch[1]);

  // ── 4. Valor ─────────────────────────────────────────────────────────────
  let valor: number | null = null;
  const toAmount = (raw: string): number | null => {
    const v = parseFloat(raw.replace(/\./g, "").replace(",", "."));
    return !isNaN(v) && v > 0 && v < 10_000_000 ? Math.round(v * 100) / 100 : null;
  };
  // Rótulo padrão de boleto: "Valor do Documento   1.686,00" — permite palavras
  // entre o rótulo e o número (até 25 chars não-dígito), além de "R$ 1.234,56".
  const valorMatch = t.match(
    /(?:\bvalor\b(?:\s+do)?(?:\s+documento|\s+cobrado|\s+total)?|R\$|\bvl\b\.?)[^\d]{0,25}([\d.]{1,12},\d{2})\b/i,
  );
  if (valorMatch) valor = toAmount(valorMatch[1]);
  if (valor === null) {
    // Fallback: maior valor em formato BR no documento (num boleto, o valor do
    // documento é normalmente o maior montante presente).
    const all = [...t.matchAll(/\b\d{1,3}(?:\.\d{3})*,\d{2}\b/g)]
      .map((m) => toAmount(m[0]))
      .filter((v): v is number => v !== null && v >= 1);
    if (all.length > 0) valor = Math.max(...all);
  }

  // ── 5. Vencimento ────────────────────────────────────────────────────────
  let vencimento: string | null = null;
  // "Data de Vencimento" com texto/espachamento de coluna entre rótulo e data;
  // aceita separador / - . e ano de 2 ou 4 dígitos.
  const DATE_PART = "(\\d{2}[\\/\\-.]\\d{2}[\\/\\-.]\\d{2,4})";
  const vencMatch =
    t.match(new RegExp(`(?:data\\s+de\\s+)?vencimento[^0-9]{0,30}${DATE_PART}`, "i")) ||
    t.match(new RegExp(`\\bvenc\\.?[^0-9]{0,20}${DATE_PART}`, "i")) ||
    t.match(new RegExp(`(?:validade|expira[çc][aã]o)[^0-9]{0,20}${DATE_PART}`, "i"));
  const dateMatch = !vencMatch ? t.match(/\b(\d{2}\/\d{2}\/20\d{2})\b/) : null;
  const rawDate   = vencMatch ? vencMatch[1] : dateMatch?.[1] ?? null;
  if (rawDate) {
    const [d, m, y] = rawDate.split(/[\/\-.]/);
    const year = y.length === 2 ? `20${y}` : y;
    const iso = `${year}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    const parsed = new Date(iso);
    if (!isNaN(parsed.getTime())) vencimento = iso;
  }

  // ── 6. Client name (heuristic) ───────────────────────────────────────────
  let clientName: string | null = null;
  const nameMatch = t.match(
    /(?:sacado|pagador|nome\s+do\s+cliente|cliente|devedor)[\s:]+([A-ZÀ-Ü][a-zA-ZÀ-ü\s]{4,50})/i,
  );
  if (nameMatch) clientName = nameMatch[1].trim().slice(0, 100);

  return { linhaDigitavel, nossoNumero, cpfCnpj, clientName, valor, vencimento };
}

// ─── Scoring engine ───────────────────────────────────────────────────────────

export interface ScoredIndexRow {
  fileId:       string;
  fileName:     string;
  score:        number;
  reason:       string;
}

interface IndexRow {
  file_id:              string;
  file_name:            string;
  file_name_normalized: string | null;
  linha_digitavel:      string | null;
  nosso_numero:         string | null;
  cpf_cnpj:             string | null;
  client_name_extracted: string | null;
  valor:                number | null;
  vencimento:           string | null;
}

/**
 * Score a single index row against debtor data.
 *
 * Scoring duplo: nome do cliente + número do documento, avaliados em paralelo.
 *
 * Scores individuais:
 *   docScore  — 1.0 se número encontrado na linha digitável / nosso número / filename / CPF-CNPJ
 *   nameScore — Jaccard (0–1) dos tokens do nome do cliente vs filename / client_name_extracted
 *
 * Score final combinado:
 *   docScore + nameScore ambos positivos  → 1.00 (certeza)
 *   só docScore (linha/nosso/CPF)         → 0.95–1.00
 *   só docScore (filename)                → 0.85
 *   só nameScore ≥ 0.6                    → 0.80–1.00
 *   só nameScore ≥ 0.3                    → 0.50–0.79
 *   valor + vencimento                    → 0.30–0.45
 */
export function scoreRow(
  debtor: {
    documentNumber: string;
    clientName:     string;
    amount?:        number | null;
    dueDate?:       string | null; // YYYY-MM-DD or DD/MM/YYYY
  },
  row: IndexRow,
): { score: number; reason: string } {
  const docDigits = digits(debtor.documentNumber);
  // Normaliza o número do documento preservando alfanuméricos (ex: "NF-2024-001" → "nf2024001")
  const docAlpha  = normalizeText(debtor.documentNumber).replace(/\s/g, "");

  // ── Sinal 1: número do documento ──────────────────────────────────────────

  let docScore  = 0;
  let docReason = "";

  // 1a. Linha digitável (boleto)
  if (row.linha_digitavel && docDigits.length >= 6) {
    if (row.linha_digitavel.includes(docDigits)) {
      docScore = 1.0; docReason = "document_in_linha";
    }
  }

  // 1b. Nosso Número
  if (!docScore && row.nosso_numero && docDigits.length >= 4) {
    const nosso = digits(row.nosso_numero);
    if (nosso === docDigits || nosso.includes(docDigits) || docDigits.includes(nosso)) {
      docScore = 0.98; docReason = "nosso_numero_match";
    }
  }

  // 1c. CPF / CNPJ exato
  if (!docScore && row.cpf_cnpj && docDigits.length >= 11) {
    if (row.cpf_cnpj === docDigits) {
      docScore = 0.95; docReason = "cpf_cnpj_exact";
    }
  }

  // Tokens numéricos do filename: cada grupo de dígitos (separadores internos
  // - / . permitidos) vira um token; "1382-005" → "1382005". Bigramas cobrem
  // "1382 005" (espaço). Evita a "sopa" concatenada, que casava números de
  // tokens vizinhos por engano ("F3 1-4 2024" continha "42024" etc.).
  const fn = row.file_name_normalized?.trim() ?? "";
  const fileNumTokens = [...fn.matchAll(/\d(?:[\d\/\-.]*\d)?/g)].map((m) => digits(m[0]));
  const fileNumBigrams = fileNumTokens.slice(0, -1).map((tk, i) => tk + fileNumTokens[i + 1]);
  const docTokenMatch = (dd: string): boolean =>
    fileNumTokens.some((tk) => tk === dd || (dd.length >= 4 && tk.includes(dd))) ||
    fileNumBigrams.some((bg) => bg === dd);

  if (fn) {
    const fileAlpha = fn.replace(/\s/g, "");

    // 1d. Número curto (2–3 chars): requer igualdade exata com o filename
    if (!docScore && docDigits.length >= 2 && docDigits.length <= 3) {
      if (fn === docDigits || fn === docAlpha) {
        docScore = 0.88; docReason = "document_exact_filename_short";
      }
    }

    // 1e. Número (≥ 4 dígitos): token do filename igual ou contendo o documento
    if (!docScore && docDigits.length >= 4 && docTokenMatch(docDigits)) {
      docScore = 0.85; docReason = "document_digits_filename";
    }

    // 1f. Alfanumérico (ex: "NF2024001") no filename — só quando o documento
    // tem letra; docs puramente numéricos passam pelo caminho de tokens (1e),
    // senão a comparação sem espaços recriaria a "sopa" de dígitos.
    if (!docScore && docAlpha.length >= 4 && /[a-z]/i.test(docAlpha) && fileAlpha.includes(docAlpha)) {
      docScore = 0.85; docReason = "document_alpha_filename";
    }
  }

  // ── Sinal 2: nome do cliente ──────────────────────────────────────────────
  // Similaridade ponderada (stopwords societárias ignoradas, termos de ramo com
  // peso baixo, match por prefixo/substring) — ver nameMatch.ts.
  const nameScore = bestNameSimilarity(debtor.clientName, [
    row.file_name_normalized,
    row.client_name_extracted,
  ]);
  const nameReason = "name_similarity";

  // ── Sinal 3: conflito de número ───────────────────────────────────────────
  // Se o filename tem um número (≥3 díg.) e NENHUM token bate com o documento
  // do devedor, é provável que seja o boleto de OUTRO título do MESMO cliente.
  // Nesse caso, nome igual NÃO é suficiente para sugerir.
  const fileHasConflictingNumber =
    docScore === 0 &&
    docDigits.length >= 3 &&
    fileNumTokens.some((tk) => tk.length >= 3) &&
    !docTokenMatch(docDigits) &&
    !fileNumTokens.some((tk) => tk.length >= 3 && docDigits.includes(tk));

  // ── Sinal 4: valor + vencimento (extraídos do conteúdo do PDF) ────────────
  // É o sinal que DESEMPATA múltiplos boletos do mesmo cliente, já que o número
  // do documento (NF/título) não aparece no boleto. Calculado cedo para compor
  // com o nome.
  let valorOk = false;
  let vencOk  = false;
  if (debtor.amount && row.valor) {
    valorOk = Math.abs(debtor.amount - row.valor) < 0.02;
  }
  if (debtor.dueDate && row.vencimento) {
    let due = debtor.dueDate;
    const ddmm = due.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (ddmm) due = `${ddmm[3]}-${ddmm[2]}-${ddmm[1]}`;
    vencOk = due.slice(0, 10) === row.vencimento.slice(0, 10);
  }

  // ── Score combinado ───────────────────────────────────────────────────────

  // Documento (linha/nosso/CPF/filename) + nome → máxima certeza
  if (docScore > 0 && nameScore >= 0.35) {
    return { score: 1.0, reason: `${docReason}+${nameReason}` };
  }
  if (docScore > 0) {
    return { score: docScore, reason: docReason };
  }

  // Nome + valor + vencimento → identifica o boleto exato do cliente certo
  // (desempata quando o cliente tem vários boletos). Tem prioridade sobre
  // nome-só, inclusive sobrepondo o conflito de número do filename.
  if (nameScore >= 0.35 && valorOk && vencOk) {
    return { score: 0.97, reason: "name+valor+vencimento" };
  }
  if (nameScore >= 0.35 && valorOk) {
    return { score: 0.82, reason: "name+valor" };
  }

  // Valor + vencimento sem nome forte — ainda bastante único
  if (valorOk && vencOk) {
    return { score: 0.75, reason: "valor+vencimento" };
  }

  // ── Apenas nome → NÃO é prova suficiente ──────────────────────────────────
  // Um cliente tem vários boletos e há arquivos genéricos (RECIBO.pdf, etc.).
  // Sem documento/valor/vencimento corroborando, o match por nome fica SEMPRE
  // abaixo do limiar de sugestão (AUTO_ATTACH_THRESHOLD = 0.70) — registra o
  // sinal para diagnóstico, mas não sugere.
  if (nameScore >= 0.30) {
    return {
      score: 0.50,
      reason: fileHasConflictingNumber ? `${nameReason}_only_doc_conflict` : `${nameReason}_only_insufficient`,
    };
  }

  if (valorOk) return { score: 0.30, reason: "valor_only" };

  return { score: 0, reason: "no_match" };
}

// ─── Indexing ─────────────────────────────────────────────────────────────────

/**
 * Save a user's Drive folder config.
 * Creates or updates user_drive_folders for this user.
 */
export async function saveFolderConfig(
  admin: AdminClient,
  userId: string,
  folderUrl: string,
  folderId: string,
  folderName: string | null,
  isAccessible: boolean,
): Promise<void> {
  await admin
    .from("user_drive_folders")
    .upsert(
      {
        user_id:      userId,
        folder_url:   folderUrl,
        folder_id:    folderId,
        folder_name:  folderName,
        is_accessible: isAccessible,
        updated_at:   new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
}

/**
 * Index all PDF files from a user's Drive folder.
 *
 * For each file:
 *   - If md5 matches cached row → skip (incremental)
 *   - Otherwise → download PDF, extract metadata, upsert to user_drive_index
 *
 * Returns an IndexResult summary.
 */
export async function indexFolderForUser(
  admin: AdminClient,
  userId: string,
  folderId: string,
  accessToken: string,
): Promise<IndexResult> {
  const startMs = Date.now();
  let filesIndexed = 0;
  let filesSkipped = 0;
  let filesError   = 0;

  // List all PDFs in the folder (including subfolders named after clients)
  let driveFiles: DriveFile[] = [];
  try {
    driveFiles = await listFilesInFolderDeep(folderId, accessToken);
  } catch (e) {
    throw new Error(`Drive list error: ${e instanceof Error ? e.message : String(e)}`);
  }

  const filesFound = driveFiles.length;

  // Load existing index for this user+folder. Arquivos já com conteúdo extraído
  // são pulados sem nova chamada de API (re-sync rápido + convergência ao longo
  // de execuções para arquivos novos/incompletos).
  const { data: existingRows } = await admin
    .from("user_drive_index")
    .select("file_id, metadata_extraction_attempted")
    .eq("user_id", userId)
    .eq("folder_id", folderId);

  // "Done" = já tentamos extrair o conteúdo do PDF (não basta ter o nome da pasta).
  // Assim todo arquivo passa pela extração pesada uma vez, ao longo das execuções.
  const existingDone = new Set<string>(
    ((existingRows ?? []) as Array<{ file_id: string; metadata_extraction_attempted: boolean | null }>)
      .filter((r) => r.metadata_extraction_attempted)
      .map((r) => r.file_id),
  );
  const existingAny = new Set<string>(
    ((existingRows ?? []) as Array<{ file_id: string }>).map((r) => r.file_id),
  );

  const now = new Date().toISOString();

  // Particiona: já-prontos (skip), candidatos a conteúdo (até o orçamento),
  // e o restante indexado de forma leve (só nome + caminho da pasta).
  const pending = driveFiles.filter((f) => !existingDone.has(f.id));
  filesSkipped += driveFiles.length - pending.length;

  const heavyFiles = pending.slice(0, MAX_CONTENT_PER_RUN);
  const lightFiles = pending.slice(MAX_CONTENT_PER_RUN);

  const lightRecord = (file: DriveFile) => ({
    user_id:              userId,
    folder_id:            folderId,
    file_id:              file.id,
    file_name:            file.name,
    file_name_normalized: normalizeFilename(file.name),
    file_size:            0,
    mime_type:            "application/pdf",
    md5_checksum:         null,
    drive_modified_at:    null,
    indexed_at:           now,
    updated_at:           now,
    linha_digitavel:      null,
    nosso_numero:         null,
    cpf_cnpj:             null,
    client_name_extracted: file.parentFolderName ?? null,
    valor:                null,
    vencimento:           null,
    metadata_extracted:           Boolean(file.parentFolderName),
    metadata_extraction_attempted: false,
  });

  // Processa um arquivo "pesado": baixa o PDF, extrai metadados e faz upsert.
  const processHeavy = async (file: DriveFile) => {
    try {
      const info = await getDriveFileInfo(file.id, accessToken);
      const fileSize = info?.size ?? 0;

      let meta: BoletoMetadata = {
        linhaDigitavel: null, nossoNumero: null, cpfCnpj: null,
        clientName: file.parentFolderName ?? null,
        valor: null, vencimento: null,
      };
      let metaExtracted = Boolean(file.parentFolderName);

      if (fileSize <= MAX_PDF_BYTES_FOR_EXTRACTION && fileSize > 0) {
        const pdfBytes = await downloadDriveFile(file.id, accessToken);
        if (pdfBytes && pdfBytes.length > 0) {
          const text = await extractPdfText(pdfBytes);
          if (text.trim().length > 20) {
            const extracted = extractBoletoMetadata(text);
            meta = {
              linhaDigitavel: extracted.linhaDigitavel,
              nossoNumero:    extracted.nossoNumero,
              cpfCnpj:        extracted.cpfCnpj,
              clientName:     extracted.clientName ?? meta.clientName,
              valor:          extracted.valor,
              vencimento:     extracted.vencimento,
            };
            metaExtracted = true;
          }
        }
      }

      await admin.from("user_drive_index").upsert({
        user_id:              userId,
        folder_id:            folderId,
        file_id:              file.id,
        file_name:            file.name,
        file_name_normalized: normalizeFilename(file.name),
        file_size:            fileSize,
        mime_type:            "application/pdf",
        md5_checksum:         info?.md5Checksum ?? null,
        drive_modified_at:    info?.modifiedTime ?? null,
        indexed_at:           now,
        updated_at:           now,
        linha_digitavel:      meta.linhaDigitavel,
        nosso_numero:         meta.nossoNumero,
        cpf_cnpj:             meta.cpfCnpj,
        client_name_extracted: meta.clientName,
        valor:                meta.valor,
        vencimento:           meta.vencimento,
        metadata_extracted:           metaExtracted,
        metadata_extraction_attempted: true,
      }, { onConflict: "user_id,file_id" });
      filesIndexed++;
    } catch (e) {
      console.error(`[driveFolderIndex] index error ${file.id.slice(0, 8)}:`, e instanceof Error ? e.message : String(e));
      filesError++;
    }
  };

  // Pesados em ondas paralelas
  const HEAVY_CONCURRENCY = 6;
  for (let i = 0; i < heavyFiles.length; i += HEAVY_CONCURRENCY) {
    await Promise.all(heavyFiles.slice(i, i + HEAVY_CONCURRENCY).map(processHeavy));
  }

  // Leves: só os que ainda não existem no índice (não sobrescreve nada útil)
  const lightToInsert = lightFiles.filter((f) => !existingAny.has(f.id)).map(lightRecord);
  for (let i = 0; i < lightToInsert.length; i += 200) {
    const chunk = lightToInsert.slice(i, i + 200);
    const { error } = await admin.from("user_drive_index").upsert(chunk, { onConflict: "user_id,file_id" });
    if (error) filesError += chunk.length; else filesIndexed += chunk.length;
  }
  filesSkipped += lightFiles.length - lightToInsert.length;

  // Mark folder as indexed
  const durationMs = Date.now() - startMs;
  await admin
    .from("user_drive_folders")
    .update({
      is_accessible:  true,
      file_count:     filesFound,
      last_indexed_at: now,
      last_index_error: null,
      updated_at:     now,
    })
    .eq("user_id", userId);

  // Write audit log
  await admin.from("user_drive_index_log").insert({
    user_id:      userId,
    folder_id:    folderId,
    files_found:  filesFound,
    files_indexed: filesIndexed,
    files_skipped: filesSkipped,
    files_error:  filesError,
    duration_ms:  durationMs,
    status:       "success",
  });

  // Quantos PDFs ainda precisam de extração de conteúdo (os "leves" não tentados)
  const contentPending = Math.max(0, pending.length - heavyFiles.length);

  return { filesFound, filesIndexed, filesSkipped, filesError, durationMs, contentPending };
}

/**
 * Extrai o conteúdo (linha digitável, CPF/CNPJ, valor…) de um lote de PDFs que
 * já estão no índice mas ainda não tiveram o conteúdo lido — SEM re-varrer o
 * Drive. Lê os pendentes do banco, baixa/parseia cada um e marca como tentado.
 *
 * Esta é a unidade de trabalho do processamento em background: chamadas
 * sucessivas convergem até `remaining = 0`.
 */
export async function extractPendingContent(
  admin: AdminClient,
  userId: string,
  folderId: string,
  accessToken: string,
  limit = MAX_CONTENT_PER_RUN,
): Promise<{ processed: number; remaining: number }> {
  // Pendentes: rows do índice ainda não tentadas
  const { data: pendingRows } = await admin
    .from("user_drive_index")
    .select("file_id, file_name, client_name_extracted")
    .eq("user_id", userId)
    .eq("folder_id", folderId)
    .eq("metadata_extraction_attempted", false)
    .limit(limit);

  const batch = (pendingRows ?? []) as Array<{ file_id: string; file_name: string; client_name_extracted: string | null }>;
  const now = new Date().toISOString();

  const processOne = async (row: { file_id: string; file_name: string; client_name_extracted: string | null }) => {
    try {
      const info = await getDriveFileInfo(row.file_id, accessToken);
      const fileSize = info?.size ?? 0;

      let meta: BoletoMetadata = {
        linhaDigitavel: null, nossoNumero: null, cpfCnpj: null,
        clientName: row.client_name_extracted ?? null,
        valor: null, vencimento: null,
      };
      let metaExtracted = Boolean(row.client_name_extracted);

      if (fileSize <= MAX_PDF_BYTES_FOR_EXTRACTION && fileSize > 0) {
        const pdfBytes = await downloadDriveFile(row.file_id, accessToken);
        if (pdfBytes && pdfBytes.length > 0) {
          const text = await extractPdfText(pdfBytes);
          if (text.trim().length > 20) {
            const extracted = extractBoletoMetadata(text);
            meta = {
              linhaDigitavel: extracted.linhaDigitavel,
              nossoNumero:    extracted.nossoNumero,
              cpfCnpj:        extracted.cpfCnpj,
              clientName:     extracted.clientName ?? meta.clientName,
              valor:          extracted.valor,
              vencimento:     extracted.vencimento,
            };
            metaExtracted = true;
          }
        }
      }

      await admin.from("user_drive_index").update({
        file_size:            fileSize,
        md5_checksum:         info?.md5Checksum ?? null,
        drive_modified_at:    info?.modifiedTime ?? null,
        updated_at:           now,
        linha_digitavel:      meta.linhaDigitavel,
        nosso_numero:         meta.nossoNumero,
        cpf_cnpj:             meta.cpfCnpj,
        client_name_extracted: meta.clientName,
        valor:                meta.valor,
        vencimento:           meta.vencimento,
        metadata_extracted:           metaExtracted,
        metadata_extraction_attempted: true,
      }).eq("user_id", userId).eq("file_id", row.file_id);
    } catch (e) {
      console.error(`[driveFolderIndex] content extract error ${row.file_id.slice(0, 8)}:`, e instanceof Error ? e.message : String(e));
      // Marca como tentado mesmo em erro, para não travar a convergência
      await admin.from("user_drive_index")
        .update({ metadata_extraction_attempted: true, updated_at: now })
        .eq("user_id", userId).eq("file_id", row.file_id);
    }
  };

  const CONCURRENCY = 6;
  for (let i = 0; i < batch.length; i += CONCURRENCY) {
    await Promise.all(batch.slice(i, i + CONCURRENCY).map(processOne));
  }

  // Conta o que ainda resta pendente após este lote
  const { count: remainingCount } = await admin
    .from("user_drive_index")
    .select("file_id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("folder_id", folderId)
    .eq("metadata_extraction_attempted", false);

  return { processed: batch.length, remaining: remainingCount ?? 0 };
}

// ─── Matching ─────────────────────────────────────────────────────────────────

/**
 * Índice invertido: prefixo de token distintivo → lista de índices de linhas.
 * Permite buscar candidatos por nome sem comparar todos×todos (evita estouro de
 * CPU em pastas com milhares de arquivos).
 */
function buildBlockIndex(rows: IndexRow[]): Map<string, number[]> {
  const idx = new Map<string, number[]>();
  rows.forEach((row, i) => {
    const keys = new Set<string>([
      ...blockingKeys(row.file_name_normalized ?? ""),
      ...blockingKeys(row.client_name_extracted ?? ""),
    ]);
    for (const k of keys) {
      const arr = idx.get(k);
      if (arr) arr.push(i); else idx.set(k, [i]);
    }
  });
  return idx;
}

/** Campos de documento de uma linha, pré-computados uma vez (sem regex no loop). */
interface RowDoc {
  linha: string | null;
  nossoDigits: string;
  cpf: string | null;
  fnDigits: string;
  fnAlpha: string;
  fnTrim: string;
}

function precomputeRowDocs(rows: IndexRow[]): RowDoc[] {
  return rows.map((r) => {
    const fn = r.file_name_normalized ?? "";
    return {
      linha:       r.linha_digitavel,
      nossoDigits: r.nosso_numero ? digits(r.nosso_numero) : "",
      cpf:         r.cpf_cnpj,
      fnDigits:    fn ? digits(fn) : "",
      fnAlpha:     fn ? fn.replace(/\s/g, "") : "",
      fnTrim:      fn ? fn.trim() : "",
    };
  });
}

/** Sinal barato de documento usando campos pré-computados (só includes). */
function hasDocSignal(docDigits: string, docAlpha: string, rd: RowDoc): boolean {
  if (docDigits.length >= 6 && rd.linha && rd.linha.includes(docDigits)) return true;
  if (docDigits.length >= 4 && rd.nossoDigits &&
      (rd.nossoDigits === docDigits || rd.nossoDigits.includes(docDigits) || docDigits.includes(rd.nossoDigits))) return true;
  if (docDigits.length >= 11 && rd.cpf && rd.cpf === docDigits) return true;
  if (docDigits.length >= 2 && docDigits.length <= 3 && (rd.fnTrim === docDigits || rd.fnTrim === docAlpha)) return true;
  if (docDigits.length >= 4 && rd.fnDigits.includes(docDigits)) return true;
  if (docAlpha.length >= 4 && rd.fnAlpha.includes(docAlpha)) return true;
  return false;
}

/**
 * Seleciona apenas as linhas candidatas a um devedor (por nome compartilhado ou
 * por sinal de documento) e retorna o melhor match via scoreRow completo.
 */
function bestMatchInIndex(
  debtor: { documentNumber: string; clientName: string; amount?: number | null; dueDate?: string | null },
  rows: IndexRow[],
  blockIndex: Map<string, number[]>,
  rowDocs: RowDoc[],
): { score: number; fileId: string; fileName: string; reason: string } {
  const candidates = new Set<number>();

  // 1. Candidatos por nome (índice invertido)
  for (const k of blockingKeys(debtor.clientName)) {
    const arr = blockIndex.get(k);
    if (arr) for (const i of arr) candidates.add(i);
  }

  // 2. Candidatos por documento (pré-filtro barato sobre campos pré-computados)
  const docDigits = digits(debtor.documentNumber);
  const docAlpha  = normalizeText(debtor.documentNumber).replace(/\s/g, "");
  if (docDigits.length >= 2 || docAlpha.length >= 4) {
    for (let i = 0; i < rowDocs.length; i++) {
      if (hasDocSignal(docDigits, docAlpha, rowDocs[i])) candidates.add(i);
    }
  }

  let bestScore = 0, bestFileId = "", bestName = "", bestReason = "";
  for (const i of candidates) {
    const { score, reason } = scoreRow(debtor, rows[i]);
    if (score > bestScore) {
      bestScore = score; bestFileId = rows[i].file_id; bestName = rows[i].file_name; bestReason = reason;
    }
  }
  return { score: bestScore, fileId: bestFileId, fileName: bestName, reason: bestReason };
}

/**
 * Find the best matching Drive PDF for a single debtor.
 *
 * Queries user_drive_index for this user, scores every candidate,
 * returns the best match above AUTO_ATTACH_THRESHOLD or null.
 */
export async function matchBoletoForDebtor(
  admin: AdminClient,
  userId: string,
  debtor: {
    documentNumber: string;
    clientName:     string;
    amount?:        number | null;
    dueDate?:       string | null;
  },
): Promise<DriveMatchResult | null> {
  // Load all indexed files for this user
  const { data: rows } = await admin
    .from("user_drive_index")
    .select(
      "file_id, file_name, file_name_normalized, linha_digitavel, nosso_numero, " +
      "cpf_cnpj, client_name_extracted, valor, vencimento",
    )
    .eq("user_id", userId)
    .limit(2_000);

  if (!rows || rows.length === 0) return null;

  const indexRows = rows as IndexRow[];
  const best = bestMatchInIndex(debtor, indexRows, buildBlockIndex(indexRows), precomputeRowDocs(indexRows));

  if (best.score >= AUTO_ATTACH_THRESHOLD) {
    return {
      fileId:   best.fileId,
      fileName: best.fileName,
      score:    Math.round(best.score * 1000) / 1000,
      reason:   best.reason,
    };
  }

  return null;
}

/**
 * Run matching for all debtors of a user and persist matches.
 *
 * - Reads all pending debtors (no drive_file_id) from user_registros_financeiros
 * - Runs matchBoletoForDebtor for each
 * - Updates drive_file_id + drive_file_name + drive_match_score + drive_match_reason
 *
 * Returns { matched, unmatched, total }
 */
export async function batchMatchDebtors(
  admin: AdminClient,
  userId: string,
  options?: { onlyUnmatched?: boolean; debtorIds?: string[] },
): Promise<{ matched: number; unmatched: number; total: number }> {
  // Build query
  let query = admin
    .from("user_registros_financeiros")
    .select("id, document_number, client_name, amount, due_date, updated_value, drive_file_id")
    .eq("user_id", userId);

  if (options?.debtorIds?.length) {
    query = query.in("id", options.debtorIds);
  } else if (options?.onlyUnmatched !== false) {
    query = query.is("drive_file_id", null);
  }

  const { data: debtors } = await query.limit(500);
  if (!debtors || debtors.length === 0) return { matched: 0, unmatched: 0, total: 0 };

  // Pre-load index (all rows) once — avoids N×DB round trips
  const { data: indexRows } = await admin
    .from("user_drive_index")
    .select(
      "file_id, file_name, file_name_normalized, linha_digitavel, nosso_numero, " +
      "cpf_cnpj, client_name_extracted, valor, vencimento",
    )
    .eq("user_id", userId)
    .limit(2_000);

  if (!indexRows || indexRows.length === 0) {
    return { matched: 0, unmatched: debtors.length, total: debtors.length };
  }

  let matched = 0;
  const now = new Date().toISOString();
  const rows = indexRows as IndexRow[];
  const blockIndex = buildBlockIndex(rows);
  const rowDocs = precomputeRowDocs(rows);

  for (const d of debtors as Array<Record<string, unknown>>) {
    // Nunca sobrescreve um boleto já importado ("uploaded"): ele já foi salvo
    // no Storage e o usuário não deve precisar reimportar.
    if (d.drive_file_id === "uploaded") continue;

    const debtor = {
      // Passa o número original (alfanumérico) — scoreRow faz a normalização internamente
      documentNumber: String(d.document_number ?? ""),
      clientName:     String(d.client_name     ?? ""),
      amount:         Number(d.updated_value ?? d.amount ?? 0) || null,
      dueDate:        (d.due_date as string | null) ?? null,
    };

    const best = bestMatchInIndex(debtor, rows, blockIndex, rowDocs);

    if (best.score >= AUTO_ATTACH_THRESHOLD) {
      await admin
        .from("user_registros_financeiros")
        .update({
          drive_file_id:       best.fileId,
          drive_file_name:     best.fileName,
          drive_file_url:      `https://drive.google.com/file/d/${best.fileId}/view`,
          drive_match_score:   Math.round(best.score * 1000) / 1000,
          drive_match_reason:  best.reason,
          drive_last_match_at: now,
          updated_at:          now,
        })
        .eq("id", d.id as string)
        .eq("user_id", userId);
      matched++;
    } else if (d.drive_file_id && d.drive_file_id !== "uploaded") {
      // Re-match auto-corretivo: havia uma sugestão (não importada) que agora
      // não passa mais no limiar — limpa para não exibir um boleto errado.
      await admin
        .from("user_registros_financeiros")
        .update({
          drive_file_id:       null,
          drive_file_name:     null,
          drive_file_url:      null,
          drive_match_score:   null,
          drive_match_reason:  null,
          drive_last_match_at: now,
          updated_at:          now,
        })
        .eq("id", d.id as string)
        .eq("user_id", userId);
    }
  }

  return { matched, unmatched: debtors.length - matched, total: debtors.length };
}

// ─── Public helper: get access token (for callers that don't have it) ────────

export async function getDriveAccessToken(): Promise<string | null> {
  const email      = Deno.env.get("GOOGLE_CLIENT_EMAIL")  ?? "";
  const privateKey = Deno.env.get("GOOGLE_PRIVATE_KEY")   ?? "";
  if (!email || !privateKey) return null;

  try {
    return await getCachedAccessToken(email, privateKey);
  } catch {
    return null;
  }
}
