/**
 * driveFolderService — frontend service para gerenciar a pasta Drive do usuário.
 *
 * Chama a Edge Function drive-index-folder.
 * NUNCA contém credenciais Google.
 * NUNCA expõe IDs internos do Drive além do necessário para UX.
 */

import { getSupabaseClient } from "../supabaseClient";
import { readFunctionErrorBody } from "../edgeFunctionError";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DriveFolderStatus {
  configured:       boolean;
  folderName:       string | null;
  isAccessible:     boolean;
  fileCount:        number;
  /** PDFs cujo conteúdo já foi extraído (progresso da indexação) */
  contentIndexed?:  number;
  /** true enquanto a indexação de conteúdo ainda está rodando em background */
  indexing?:        boolean;
  lastIndexedAt:    string | null;
  lastIndexError:   string | null;
  unmatchedDebtors: number;
  /**
   * Falha ao consultar o status (rede, plano sem Drive…). Não quer dizer que
   * não há pasta — a tela não deve pedir para conectar uma de novo.
   */
  loadError?:       string | null;
  /** Código do erro acima (ex.: "bloqueado_plano" — tentar de novo não resolve) */
  loadErrorStatus?: string | null;
}

export interface DriveSaveResult {
  success:    boolean;
  status:     string;
  message:    string;
  folderName: string | null;
  fileCount:  number;
  /** Only set on access error — tells user which email to share the folder with */
  serviceAccountHint?: string;
  error?: string;
}

export interface DriveSyncResult {
  success:         boolean;
  filesFound:      number;
  filesIndexed:    number;
  filesSkipped:    number;
  durationMs:      number;
  debtorsMatched:  number;
  debtorsTotal:    number;
  /** PDFs ainda aguardando extração de conteúdo (continua em background) */
  contentPending?: number;
  error?:          string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const driveFolderService = {
  /**
   * Fetch current folder config + index stats for this user.
   */
  async getStatus(): Promise<DriveFolderStatus> {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.functions.invoke<DriveFolderStatus>(
      "drive-index-folder",
      { method: "GET" },
    );

    if (error || !data) {
      const body = await readFunctionErrorBody(error);
      return {
        configured: false, folderName: null, isAccessible: false,
        fileCount: 0, lastIndexedAt: null, lastIndexError: null, unmatchedDebtors: 0,
        loadError: typeof body?.error === "string" ? body.error : "Não foi possível consultar a pasta do Drive.",
        loadErrorStatus: typeof body?.status === "string" ? body.status : null,
      };
    }
    return data;
  },

  /**
   * Save a new folder URL and trigger automatic background indexing.
   */
  async saveFolder(folderUrl: string): Promise<DriveSaveResult> {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.functions.invoke<DriveSaveResult>(
      "drive-index-folder",
      { body: { action: "save", folderUrl } },
    );

    if (error || !data) {
      const body = await readFunctionErrorBody(error);
      const message = typeof body?.error === "string" ? body.error : "Não foi possível salvar a pasta. Tente novamente.";
      return {
        success: false,
        status: typeof body?.status === "string" ? body.status : "error",
        message,
        folderName: null, fileCount: 0,
        serviceAccountHint: typeof body?.serviceAccountHint === "string" ? body.serviceAccountHint : undefined,
        error: message,
      };
    }
    return data;
  },

  /**
   * Trigger incremental re-sync (re-index + re-match all unmatched debtors).
   */
  async syncFolder(): Promise<DriveSyncResult> {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.functions.invoke<DriveSyncResult>(
      "drive-index-folder",
      { body: { action: "sync" } },
    );

    if (error || !data) {
      const body = await readFunctionErrorBody(error);
      return {
        success: false, filesFound: 0, filesIndexed: 0,
        filesSkipped: 0, durationMs: 0,
        debtorsMatched: 0, debtorsTotal: 0,
        error: typeof body?.error === "string" ? body.error : "Falha na sincronização.",
      };
    }
    return data;
  },
};
