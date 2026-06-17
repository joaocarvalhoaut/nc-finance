/**
 * driveFolderService — frontend service para gerenciar a pasta Drive do usuário.
 *
 * Chama a Edge Function drive-index-folder.
 * NUNCA contém credenciais Google.
 * NUNCA expõe IDs internos do Drive além do necessário para UX.
 */

import { getSupabaseClient } from "../supabaseClient";

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
      return {
        configured: false, folderName: null, isAccessible: false,
        fileCount: 0, lastIndexedAt: null, lastIndexError: null, unmatchedDebtors: 0,
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
      return {
        success: false, status: "error",
        message: error?.message ?? "Não foi possível salvar a pasta. Tente novamente.",
        folderName: null, fileCount: 0,
        error: error?.message,
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
      return {
        success: false, filesFound: 0, filesIndexed: 0,
        filesSkipped: 0, durationMs: 0,
        debtorsMatched: 0, debtorsTotal: 0,
        error: error?.message ?? "Falha na sincronização.",
      };
    }
    return data;
  },
};
