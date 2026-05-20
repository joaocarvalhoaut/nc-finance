/**
 * googleDrive.ts — cliente mínimo para Google Drive API v3 via Service Account.
 *
 * Reutiliza getGoogleAccessToken de googleSheets.ts (mesmo Service Account).
 * Credenciais lidas APENAS de Supabase Secrets (Deno.env) — nunca no frontend.
 */

export { getGoogleAccessToken } from "./googleSheets.ts";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface DriveFile {
  id: string;
  name: string;
  webViewLink: string;
  size: string; // bytes as string (may be absent for Google-native files)
  createdTime: string;
}

export interface DebtorMatchInput {
  id: string;
  documentNumber: string; // CPF/CNPJ stripped
  clientName: string;
  phone: string;
}

export interface DriveMatchResult {
  debtorId: string;
  fileId: string | null;
  fileName: string | null;
  fileUrl: string | null;
  score: number; // 0–1
}

// ─── Drive API ──────────────────────────────────────────────────────────────────

/**
 * Lista todos os PDFs dentro de um folder do Drive.
 * Usa paginação automática (pageToken) para buscar até 1 000 arquivos.
 */
export const listFilesInFolder = async (
  folderId: string,
  accessToken: string,
): Promise<DriveFile[]> => {
  const files: DriveFile[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and mimeType='application/pdf' and trashed=false`,
      fields: "nextPageToken,files(id,name,webViewLink,size,createdTime)",
      pageSize: "200",
    });
    if (pageToken) params.set("pageToken", pageToken);

    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files?${params.toString()}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    if (res.status === 403 || res.status === 401) {
      throw new Error(
        "Sem permissão para acessar a pasta do Drive. " +
        "Compartilhe-a com o e-mail da service account da plataforma.",
      );
    }
    if (res.status === 404) {
      throw new Error("Pasta do Drive não encontrada. Verifique GOOGLE_DRIVE_FOLDER_ID.");
    }
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Google Drive API erro ${res.status}: ${txt}`);
    }

    const json = await res.json() as {
      nextPageToken?: string;
      files: Array<{ id: string; name: string; webViewLink?: string; size?: string; createdTime?: string }>;
    };

    for (const f of json.files ?? []) {
      files.push({
        id: f.id,
        name: f.name,
        webViewLink: f.webViewLink ?? `https://drive.google.com/file/d/${f.id}/view`,
        size: f.size ?? "—",
        createdTime: f.createdTime ?? "",
      });
    }

    pageToken = json.nextPageToken;
  } while (pageToken);

  return files;
};

// ─── Normalizers ───────────────────────────────────────────────────────────────

/** Remove tudo que não seja letra ou dígito, lowercase */
const normalizeDoc = (raw: string): string =>
  raw.replace(/[^a-z0-9]/gi, "").toLowerCase();

/** Lowercase + remove acentos (NFKD) + remove não-ASCII + strip extension */
const normalizeText = (raw: string): string => {
  const noExt = raw.replace(/\.[a-z]{2,5}$/i, "");
  return noExt
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

/** Conjunto de tokens de um texto normalizado (comprimento ≥ 3) */
const tokenSet = (text: string): Set<string> => {
  const tokens = normalizeText(text).split(" ").filter((t) => t.length >= 3);
  return new Set(tokens);
};

/** Sobreposição de Jaccard entre dois conjuntos de tokens */
const jaccardOverlap = (a: Set<string>, b: Set<string>): number => {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : inter / union;
};

// ─── Scoring ───────────────────────────────────────────────────────────────────

/**
 * Score de correspondência entre um devedor e um arquivo do Drive.
 *
 * Regras (maior valor prevalece):
 *  1.0 → documento sem pontuação encontrado no nome do arquivo
 *  0.8–1.0 → Jaccard de tokens do nome ≥ 0.6
 *  0.5–0.8 → Jaccard de tokens do nome ≥ 0.3
 *  < 0.5 → sem match significativo
 */
export const matchScore = (debtor: DebtorMatchInput, file: DriveFile): number => {
  const fileName = normalizeText(file.name);

  // 1. Documento exato no nome do arquivo
  if (debtor.documentNumber.length >= 8) {
    const cleanDoc = normalizeDoc(debtor.documentNumber);
    if (fileName.replace(/\s/g, "").includes(cleanDoc)) return 1.0;
  }

  // 2. Telefone no nome (sem DDI 55)
  if (debtor.phone) {
    const ph = debtor.phone.replace(/\D/g, "").replace(/^55/, "");
    if (ph.length >= 8 && fileName.replace(/\s/g, "").includes(ph)) return 0.9;
  }

  // 3. Sobreposição de tokens de nome de cliente
  const debtorTokens = tokenSet(debtor.clientName);
  const fileTokens   = tokenSet(file.name);
  const jaccard      = jaccardOverlap(debtorTokens, fileTokens);

  if (jaccard >= 0.6) return 0.5 + jaccard * 0.5; // 0.8 – 1.0
  if (jaccard >= 0.3) return 0.3 + jaccard * 0.7; // 0.51 – 0.79
  return jaccard * 0.6;                            // 0 – 0.29
};

// ─── Match loop ────────────────────────────────────────────────────────────────

const MIN_SCORE = 0.5;

/**
 * Para cada devedor, retorna o melhor arquivo encontrado (score ≥ MIN_SCORE)
 * ou fileId=null se não houver correspondência suficiente.
 */
export const matchDebtorsToFiles = (
  debtors: DebtorMatchInput[],
  files: DriveFile[],
): DriveMatchResult[] => {
  return debtors.map((debtor) => {
    let bestScore = 0;
    let bestFile: DriveFile | null = null;

    for (const file of files) {
      const score = matchScore(debtor, file);
      if (score > bestScore) {
        bestScore = score;
        bestFile  = file;
      }
    }

    if (bestScore >= MIN_SCORE && bestFile) {
      return {
        debtorId: debtor.id,
        fileId:   bestFile.id,
        fileName: bestFile.name,
        fileUrl:  bestFile.webViewLink,
        score:    Math.round(bestScore * 1000) / 1000,
      };
    }

    return { debtorId: debtor.id, fileId: null, fileName: null, fileUrl: null, score: 0 };
  });
};
