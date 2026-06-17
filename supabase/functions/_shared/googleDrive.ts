/**
 * googleDrive.ts — cliente mínimo para Google Drive API v3 via Service Account.
 *
 * Reutiliza getGoogleAccessToken de googleSheets.ts (mesmo Service Account).
 * Credenciais lidas APENAS de Supabase Secrets (Deno.env) — nunca no frontend.
 */

export { getGoogleAccessToken } from "./googleSheets.ts";
import { bestNameSimilarity } from "./nameMatch.ts";

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
 * Lista os filhos diretos de um folder numa ÚNICA query: PDFs + subpastas.
 * Reduz pela metade o número de chamadas na varredura recursiva.
 */
export const listFolderChildren = async (
  folderId: string,
  accessToken: string,
): Promise<{ files: DriveFile[]; folders: Array<{ id: string; name: string }> }> => {
  const files: DriveFile[] = [];
  const folders: Array<{ id: string; name: string }> = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and trashed=false and (mimeType='application/pdf' or mimeType='application/vnd.google-apps.folder')`,
      fields: "nextPageToken,files(id,name,mimeType,webViewLink,size,createdTime)",
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
    if (!res.ok) break; // non-critical — para esta pasta, ignora

    const json = await res.json() as {
      nextPageToken?: string;
      files: Array<{ id: string; name: string; mimeType: string; webViewLink?: string; size?: string; createdTime?: string }>;
    };

    for (const f of json.files ?? []) {
      if (f.mimeType === "application/vnd.google-apps.folder") {
        folders.push({ id: f.id, name: f.name });
      } else {
        files.push({
          id: f.id,
          name: f.name,
          webViewLink: f.webViewLink ?? `https://drive.google.com/file/d/${f.id}/view`,
          size: f.size ?? "—",
          createdTime: f.createdTime ?? "",
        });
      }
    }

    pageToken = json.nextPageToken;
  } while (pageToken);

  return { files, folders };
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

// Limites de segurança da varredura recursiva — evitam timeout / estouro de cota
// da API do Drive em pastas muito grandes ou profundas.
const DEEP_MAX_DEPTH   = 8;     // níveis de subpasta a partir da raiz
const DEEP_MAX_FOLDERS = 600;   // total de pastas visitadas
const DEEP_MAX_FILES   = 3000;  // total de PDFs coletados
const DEEP_CONCURRENCY = 12;    // pastas listadas em paralelo por "onda"

/**
 * Lista TODOS os PDFs dentro de um folder do Drive, descendo recursivamente
 * por todas as subpastas (BFS) até os limites de segurança acima.
 *
 * Como não sabemos como o cliente organiza a pasta, varremos qualquer
 * profundidade. Cada PDF em subpasta recebe `parentFolderName` = o caminho
 * de nomes das pastas ancestrais (ex: "MENEZES E BATISTA BOLETOS"), que o
 * algoritmo de matching usa como sinal de nome do cliente — os termos de
 * organização ("clientes", "boletos", anos) já têm peso baixo no scoring.
 */
export const listFilesInFolderDeep = async (
  folderId: string,
  accessToken: string,
): Promise<DriveFile[]> => {
  const allFiles: DriveFile[] = [];
  let foldersVisited = 0;

  // Fila BFS: cada item carrega o caminho de nomes acumulado e a profundidade
  const queue: Array<{ id: string; path: string; depth: number }> = [
    { id: folderId, path: "", depth: 0 },
  ];

  // BFS em ondas: lista até DEEP_CONCURRENCY pastas em paralelo por iteração
  while (queue.length > 0 && foldersVisited < DEEP_MAX_FOLDERS && allFiles.length < DEEP_MAX_FILES) {
    const batch = queue.splice(0, DEEP_CONCURRENCY);
    foldersVisited += batch.length;

    const results = await Promise.all(
      batch.map(async (node) => {
        try {
          const children = await listFolderChildren(node.id, accessToken);
          return { node, children };
        } catch {
          return null; // pasta inacessível — ignora
        }
      }),
    );

    for (const res of results) {
      if (!res) continue;
      const { node, children } = res;

      for (const f of children.files) {
        if (allFiles.length >= DEEP_MAX_FILES) break;
        allFiles.push(node.path ? { ...f, parentFolderName: node.path } : f);
      }

      if (node.depth < DEEP_MAX_DEPTH && allFiles.length < DEEP_MAX_FILES) {
        for (const folder of children.folders) {
          const childPath = node.path ? `${node.path} ${folder.name}` : folder.name;
          queue.push({ id: folder.id, path: childPath, depth: node.depth + 1 });
        }
      }
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
  // Similaridade ponderada (ver nameMatch.ts): nome do arquivo e, quando o PDF
  // está numa subpasta de cliente, também o nome da subpasta.
  const nameScore = bestNameSimilarity(debtor.clientName, [
    file.parentFolderName ?? file.name,
    file.parentFolderName ? file.name : null,
  ]);

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
