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
  /** Nome da subpasta pai, quando o PDF está dentro de uma subpasta de cliente */
  parentFolderName?: string;
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

/**
 * Lista subpastas diretas de um folder do Drive.
 * Retorna array de { id, name }.
 */
export const listSubfoldersInFolder = async (
  folderId: string,
  accessToken: string,
): Promise<Array<{ id: string; name: string }>> => {
  const folders: Array<{ id: string; name: string }> = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: "nextPageToken,files(id,name)",
      pageSize: "200",
    });
    if (pageToken) params.set("pageToken", pageToken);

    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files?${params.toString()}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    if (!res.ok) break; // non-critical — se falhar, ignora subpastas

    const json = await res.json() as {
      nextPageToken?: string;
      files: Array<{ id: string; name: string }>;
    };

    for (const f of json.files ?? []) {
      folders.push({ id: f.id, name: f.name });
    }

    pageToken = json.nextPageToken;
  } while (pageToken);

  return folders;
};

/**
 * Lista todos os PDFs dentro de um folder do Drive, incluindo PDFs em
 * subpastas de primeiro nível (padrão: uma subpasta por cliente).
 *
 * PDFs em subpastas recebem `parentFolderName` = nome da subpasta,
 * que o algoritmo de matching usa como nome do cliente.
 */
export const listFilesInFolderDeep = async (
  folderId: string,
  accessToken: string,
): Promise<DriveFile[]> => {
  // 1. PDFs diretos na raiz
  const directFiles = await listFilesInFolder(folderId, accessToken);

  // 2. Subpastas de primeiro nível
  const subfolders = await listSubfoldersInFolder(folderId, accessToken);

  const allFiles: DriveFile[] = [...directFiles];

  // 3. Para cada subpasta, lista os PDFs e anexa o nome da pasta
  for (const folder of subfolders) {
    try {
      const subFiles = await listFilesInFolder(folder.id, accessToken);
      for (const f of subFiles) {
        allFiles.push({ ...f, parentFolderName: folder.name });
      }
    } catch {
      // ignora subpastas inacessíveis
    }
  }

  return allFiles;
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
/**
 * Score de correspondência entre um devedor e um arquivo do Drive.
 *
 * Avalia dois sinais em paralelo e os combina:
 *   docScore  — número do documento encontrado no nome do arquivo
 *   nameScore — Jaccard dos tokens do nome do cliente vs nome do arquivo/pasta
 *
 * Score final:
 *   doc + name ambos → 1.0   (certeza)
 *   só doc            → 0.85–0.9
 *   só name ≥ 0.6     → 0.8–1.0
 *   só name ≥ 0.3     → 0.51–0.79
 */
export const matchScore = (debtor: DebtorMatchInput, file: DriveFile): number => {
  const fileName  = normalizeText(file.name);
  const fileAlpha = fileName.replace(/\s/g, "");

  // ── Sinal 1: número do documento no nome do arquivo ───────────────────────
  const docDigits = debtor.documentNumber.replace(/\D/g, "");
  const docAlpha  = normalizeDoc(debtor.documentNumber); // só alfanumérico

  let docScore = 0;

  // Número curto (2–3): exige igualdade exata com o filename inteiro
  if (docDigits.length >= 2 && docDigits.length <= 3) {
    if (fileName.trim() === docDigits || fileAlpha === docAlpha) docScore = 0.88;
  }
  // Número longo (≥ 4 dígitos): substring no filename
  if (!docScore && docDigits.length >= 4 && fileName.replace(/\D/g, "").includes(docDigits)) {
    docScore = 0.85;
  }
  if (!docScore && docAlpha.length >= 4 && fileAlpha.includes(docAlpha)) {
    docScore = 0.85;
  }

  // Também verifica no nome da subpasta (quando disponível)
  if (!docScore && file.parentFolderName) {
    const folderAlpha = normalizeDoc(file.parentFolderName);
    const folderNorm  = normalizeText(file.parentFolderName).trim();
    if (docDigits.length >= 2 && docDigits.length <= 3 && folderNorm === docDigits) docScore = 0.88;
    if (!docScore && docDigits.length >= 4 && folderAlpha.includes(docDigits)) docScore = 0.85;
    if (!docScore && docAlpha.length >= 4 && folderAlpha.includes(docAlpha))   docScore = 0.85;
  }

  // ── Sinal 2: telefone no nome ─────────────────────────────────────────────
  if (!docScore && debtor.phone) {
    const ph = debtor.phone.replace(/\D/g, "").replace(/^55/, "");
    if (ph.length >= 8 && fileAlpha.includes(ph)) docScore = 0.90;
  }

  // ── Sinal 3: nome do cliente ──────────────────────────────────────────────
  const debtorTokens = tokenSet(debtor.clientName);

  // Referências de nome: arquivo e, quando disponível, subpasta
  const nameRef1 = file.parentFolderName ?? file.name;
  const nameRef2 = file.parentFolderName ? file.name : null;

  let nameScore = jaccardOverlap(debtorTokens, tokenSet(nameRef1));
  if (nameRef2) {
    const s2 = jaccardOverlap(debtorTokens, tokenSet(nameRef2));
    if (s2 > nameScore) nameScore = s2;
  }

  // Token único significativo (≥ 5 chars): captura "MOBILAR" em "MOBILAR NOTA.pdf"
  if (nameScore < 0.60) {
    const fileTokens = tokenSet(nameRef1);
    for (const t of debtorTokens) {
      if (t.length >= 5 && fileTokens.has(t)) {
        const hit = Math.min(0.65, 0.45 + t.length * 0.025);
        if (hit > nameScore) nameScore = hit;
      }
    }
    if (nameRef2) {
      const fileTokens2 = tokenSet(nameRef2);
      for (const t of debtorTokens) {
        if (t.length >= 5 && fileTokens2.has(t)) {
          const hit = Math.min(0.65, 0.45 + t.length * 0.025);
          if (hit > nameScore) nameScore = hit;
        }
      }
    }
  }

  // ── Score combinado ───────────────────────────────────────────────────────
  if (docScore > 0 && nameScore >= 0.35) return 1.0;
  if (docScore > 0)                      return docScore;
  if (nameScore >= 0.60) return 0.50 + nameScore * 0.50;
  if (nameScore >= 0.30) return 0.30 + nameScore * 0.70;
  return nameScore * 0.60;
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
