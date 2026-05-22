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
import { getGoogleAccessToken, listFilesInFolder, type DriveFile } from "./googleDrive.ts";

type AdminClient = ReturnType<typeof createClient>;

// ─── Config ───────────────────────────────────────────────────────────────────

/** Minimum confidence score to auto-attach a PDF. Below this → no attachment. */
export const AUTO_ATTACH_THRESHOLD = 0.70;

/** Max PDF size to download for metadata extraction (bytes). Avoids timeouts. */
const MAX_PDF_BYTES_FOR_EXTRACTION = 5 * 1024 * 1024; // 5 MB

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
  // Patterns: "R$ 1.234,56" or "VALOR: 1.234,56" or raw "1234,56"
  const valorMatch = t.match(
    /(?:valor|R\$|vl\.?)\s*:?\s*([\d\.]{1,12},\d{2})/i,
  );
  if (valorMatch) {
    const raw = valorMatch[1].replace(/\./g, "").replace(",", ".");
    const v = parseFloat(raw);
    if (!isNaN(v) && v > 0 && v < 10_000_000) valor = Math.round(v * 100) / 100;
  }

  // ── 5. Vencimento ────────────────────────────────────────────────────────
  let vencimento: string | null = null;
  // Patterns: "vencimento: 31/12/2026" or "31/12/2026" near keyword
  const vencMatch = t.match(
    /(?:vencimento|venc\.?|validade|expira[çc][aã]o)[\s:]*(\d{2}\/\d{2}\/\d{4})/i,
  );
  const dateMatch = !vencMatch ? t.match(/\b(\d{2}\/\d{2}\/202[4-9])\b/) : null;
  const rawDate   = vencMatch ? vencMatch[1] : dateMatch?.[1] ?? null;
  if (rawDate) {
    const [d, m, y] = rawDate.split("/");
    const iso = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
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

/** Jaccard similarity between two token sets (tokens ≥ 3 chars) */
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : inter / union;
}

function tokenSet(text: string): Set<string> {
  return new Set(
    normalizeText(text)
      .split(" ")
      .filter((t) => t.length >= 3),
  );
}

/**
 * Score a single index row against debtor data.
 *
 * Scoring hierarchy (highest wins):
 *   1.00 — linha digitável exact match
 *   0.98 — document number in linha/nosso_numero
 *   0.95 — document number exact in filename
 *   0.90 — CPF/CNPJ exact match
 *   0.80 — nosso_numero in filename
 *   0.75–1.00 — name token Jaccard ≥ 0.6
 *   0.50–0.74 — name token Jaccard ≥ 0.3
 *   0.30–0.49 — valor + vencimento match
 */
export function scoreRow(
  debtor: {
    documentNumber: string; // stripped digits
    clientName:     string;
    amount?:        number | null;
    dueDate?:       string | null; // YYYY-MM-DD or DD/MM/YYYY
  },
  row: IndexRow,
): { score: number; reason: string } {
  const docDigits = digits(debtor.documentNumber);

  // ── 1. Linha digitável contains document number ─────────────────────────
  if (row.linha_digitavel && docDigits.length >= 8) {
    if (row.linha_digitavel.includes(docDigits)) {
      return { score: 0.98, reason: "document_in_linha" };
    }
  }

  // ── 2. Nosso número exact ────────────────────────────────────────────────
  if (row.nosso_numero && docDigits.length >= 6) {
    const nosso = digits(row.nosso_numero);
    if (nosso === docDigits || nosso.includes(docDigits) || docDigits.includes(nosso)) {
      return { score: 0.95, reason: "nosso_numero_match" };
    }
  }

  // ── 3. Document number in filename ──────────────────────────────────────
  if (docDigits.length >= 8 && row.file_name_normalized) {
    const fileDigits = digits(row.file_name_normalized);
    if (fileDigits.includes(docDigits) || row.file_name_normalized.includes(docDigits)) {
      return { score: 0.95, reason: "document_exact_filename" };
    }
  }

  // ── 4. CPF/CNPJ exact match ──────────────────────────────────────────────
  if (row.cpf_cnpj && docDigits.length >= 11) {
    if (row.cpf_cnpj === docDigits) {
      return { score: 0.90, reason: "cpf_cnpj_exact" };
    }
  }

  // ── 5. Phone number in filename (stripped, no DDI) ──────────────────────
  // (not used here — phone not stored in index, filename only)

  // ── 6. Name token similarity (filename + extracted name) ─────────────────
  const debtorTokens = tokenSet(debtor.clientName);

  let bestNameScore = 0;
  let bestNameReason = "name_tokens_filename";

  if (row.file_name_normalized) {
    const fnTokens = tokenSet(row.file_name_normalized);
    const fnJ = jaccard(debtorTokens, fnTokens);
    if (fnJ > bestNameScore) { bestNameScore = fnJ; bestNameReason = "name_tokens_filename"; }
  }

  if (row.client_name_extracted) {
    const extTokens = tokenSet(row.client_name_extracted);
    const extJ = jaccard(debtorTokens, extTokens);
    if (extJ > bestNameScore) { bestNameScore = extJ; bestNameReason = "name_tokens_extracted"; }
  }

  if (bestNameScore >= 0.60) {
    return { score: 0.50 + bestNameScore * 0.50, reason: bestNameReason };
  }
  if (bestNameScore >= 0.30) {
    return { score: 0.30 + bestNameScore * 0.67, reason: bestNameReason };
  }

  // ── 7. Valor + vencimento fallback ───────────────────────────────────────
  let valorOk = false;
  let vencOk  = false;

  if (debtor.amount && row.valor) {
    valorOk = Math.abs(debtor.amount - row.valor) < 0.02;
  }
  if (debtor.dueDate && row.vencimento) {
    // Normalize dueDate to YYYY-MM-DD
    let due = debtor.dueDate;
    const ddmm = due.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (ddmm) due = `${ddmm[3]}-${ddmm[2]}-${ddmm[1]}`;
    vencOk = due.slice(0, 10) === row.vencimento.slice(0, 10);
  }

  if (valorOk && vencOk) return { score: 0.45, reason: "valor_vencimento" };
  if (valorOk)           return { score: 0.30, reason: "valor_only" };

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

  // List all PDFs in the folder
  let driveFiles: DriveFile[] = [];
  try {
    driveFiles = await listFilesInFolder(folderId, accessToken);
  } catch (e) {
    throw new Error(`Drive list error: ${e instanceof Error ? e.message : String(e)}`);
  }

  const filesFound = driveFiles.length;

  // Load existing index for this user+folder (for incremental check)
  const { data: existingRows } = await admin
    .from("user_drive_index")
    .select("file_id, md5_checksum")
    .eq("user_id", userId)
    .eq("folder_id", folderId);

  const existingMap = new Map<string, string | null>(
    ((existingRows ?? []) as Array<{ file_id: string; md5_checksum: string | null }>)
      .map((r) => [r.file_id, r.md5_checksum]),
  );

  const now = new Date().toISOString();

  for (const file of driveFiles) {
    try {
      // Get current file info (md5 + size)
      const info = await getDriveFileInfo(file.id, accessToken);
      const newMd5  = info?.md5Checksum ?? null;
      const fileSize = info?.size ?? 0;
      const modifiedAt = info?.modifiedTime ?? null;

      // Incremental: skip if md5 unchanged
      if (existingMap.has(file.id) && newMd5 && existingMap.get(file.id) === newMd5) {
        filesSkipped++;
        continue;
      }

      // Build base record
      const baseRecord = {
        user_id:              userId,
        folder_id:            folderId,
        file_id:              file.id,
        file_name:            file.name,
        file_name_normalized: normalizeFilename(file.name),
        file_size:            fileSize,
        mime_type:            "application/pdf",
        md5_checksum:         newMd5,
        drive_modified_at:    modifiedAt,
        indexed_at:           now,
        updated_at:           now,
      };

      // Attempt metadata extraction (best-effort)
      let meta: BoletoMetadata = {
        linhaDigitavel: null, nossoNumero: null, cpfCnpj: null,
        clientName: null, valor: null, vencimento: null,
      };
      let metaExtracted = false;

      // Only attempt if file is small enough
      if (fileSize <= MAX_PDF_BYTES_FOR_EXTRACTION && fileSize > 0) {
        const pdfBytes = await downloadDriveFile(file.id, accessToken);
        if (pdfBytes && pdfBytes.length > 0) {
          const text = await extractPdfText(pdfBytes);
          if (text.trim().length > 20) {
            meta = extractBoletoMetadata(text);
            metaExtracted = true;
          }
        }
      }

      const fullRecord = {
        ...baseRecord,
        linha_digitavel:              meta.linhaDigitavel,
        nosso_numero:                 meta.nossoNumero,
        cpf_cnpj:                     meta.cpfCnpj,
        client_name_extracted:        meta.clientName,
        valor:                        meta.valor,
        vencimento:                   meta.vencimento,
        metadata_extracted:           metaExtracted,
        metadata_extraction_attempted: true,
      };

      await admin
        .from("user_drive_index")
        .upsert(fullRecord, { onConflict: "user_id,file_id" });

      filesIndexed++;
    } catch (e) {
      console.error(
        `[driveFolderIndex] indexing error for file ${file.id.slice(0, 8)}:`,
        e instanceof Error ? e.message : String(e),
      );
      filesError++;
    }
  }

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

  return { filesFound, filesIndexed, filesSkipped, filesError, durationMs };
}

// ─── Matching ─────────────────────────────────────────────────────────────────

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

  let bestScore  = 0;
  let bestFileId = "";
  let bestName   = "";
  let bestReason = "";

  for (const row of rows as IndexRow[]) {
    const { score, reason } = scoreRow(debtor, row);
    if (score > bestScore) {
      bestScore  = score;
      bestFileId = row.file_id;
      bestName   = row.file_name;
      bestReason = reason;
    }
  }

  if (bestScore >= AUTO_ATTACH_THRESHOLD) {
    return {
      fileId:   bestFileId,
      fileName: bestName,
      score:    Math.round(bestScore * 1000) / 1000,
      reason:   bestReason,
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
    .select("id, document_number, client_name, amount, due_date, updated_value")
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

  for (const d of debtors as Array<Record<string, unknown>>) {
    const debtor = {
      documentNumber: String(d.document_number ?? "").replace(/\D/g, ""),
      clientName:     String(d.client_name     ?? ""),
      amount:         Number(d.updated_value ?? d.amount ?? 0) || null,
      dueDate:        (d.due_date as string | null) ?? null,
    };

    let bestScore  = 0;
    let bestFileId = "";
    let bestName   = "";
    let bestReason = "";

    for (const row of indexRows as IndexRow[]) {
      const { score, reason } = scoreRow(debtor, row);
      if (score > bestScore) {
        bestScore  = score;
        bestFileId = row.file_id;
        bestName   = row.file_name;
        bestReason = reason;
      }
    }

    if (bestScore >= AUTO_ATTACH_THRESHOLD) {
      await admin
        .from("user_registros_financeiros")
        .update({
          drive_file_id:       bestFileId,
          drive_file_name:     bestName,
          drive_file_url:      `https://drive.google.com/file/d/${bestFileId}/view`,
          drive_match_score:   Math.round(bestScore * 1000) / 1000,
          drive_match_reason:  bestReason,
          drive_last_match_at: now,
          updated_at:          now,
        })
        .eq("id", d.id as string)
        .eq("user_id", userId);
      matched++;
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
