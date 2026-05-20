/**
 * googleDriveService — frontend-safe.
 *
 * Chama a Edge Function `match-drive-files` no backend Supabase.
 * NUNCA contém credenciais Google. Toda autenticação está no backend.
 */

import { getSupabaseClient } from "./supabaseClient";

// ─── Types ────────────────────────────────────────────────────────────────────

export type DriveMatchStatus =
  | "success"
  | "error"
  | "bloqueado_assinatura"
  | "bloqueado_plano"
  | "google_nao_configurado"
  | "drive_folder_nao_configurada"
  | "google_auth_erro"
  | "drive_leitura_erro"
  | "nao_autenticado"
  | "erro_interno";

export interface DriveFileMatch {
  debtorId: string;
  fileId: string | null;
  fileName: string | null;
  fileUrl: string | null;
  score: number;
}

export interface DriveMatchResult {
  success: boolean;
  status: DriveMatchStatus;
  filesFound: number;
  debtorsTotal: number;
  debtorsMatched: number;
  error: string | null;
  logId: string | null;
  matchedAt: string | null;
  matches: DriveFileMatch[];
}

export interface DriveMatchLog {
  id: string;
  filesFound: number;
  debtorsMatched: number;
  debtorsTotal: number;
  status: string;
  errorMessage: string | null;
  createdAt: string;
}

// ─── Status labels ─────────────────────────────────────────────────────────────

export const DRIVE_STATUS_LABELS: Record<DriveMatchStatus, string> = {
  success:                    "Arquivos localizados e associados com sucesso!",
  error:                      "Erro ao localizar arquivos. Tente novamente.",
  bloqueado_assinatura:       "Assinatura necessária para usar o Google Drive.",
  bloqueado_plano:            "Integração com Google Drive disponível nos planos Pro e Premium.",
  google_nao_configurado:     "Integração Google não configurada. Contate o suporte.",
  drive_folder_nao_configurada: "Pasta do Drive não configurada na plataforma. Contate o suporte.",
  google_auth_erro:           "Falha na autenticação com o Google. Contate o suporte.",
  drive_leitura_erro:         "Falha ao listar arquivos da pasta. Verifique as permissões.",
  nao_autenticado:            "Sessão expirada. Faça login novamente.",
  erro_interno:               "Erro interno. Tente novamente.",
};

// ─── Service ──────────────────────────────────────────────────────────────────

export const googleDriveService = {
  async matchDriveFiles(): Promise<DriveMatchResult> {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase.functions.invoke<DriveMatchResult>(
      "match-drive-files",
      { body: {} },
    );

    if (error || !data) {
      return {
        success: false,
        status: "error",
        filesFound: 0,
        debtorsTotal: 0,
        debtorsMatched: 0,
        error: error?.message ?? "Não foi possível contatar o servidor.",
        logId: null,
        matchedAt: null,
        matches: [],
      };
    }

    return data;
  },

  async getMatchLogs(limit = 5): Promise<DriveMatchLog[]> {
    const supabase = getSupabaseClient();
    const { data } = await supabase
      .from("user_drive_match_logs")
      .select("id, files_found, debtors_matched, debtors_total, status, error_message, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);

    return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      id:              String(row.id),
      filesFound:      Number(row.files_found      ?? 0),
      debtorsMatched:  Number(row.debtors_matched  ?? 0),
      debtorsTotal:    Number(row.debtors_total    ?? 0),
      status:          String(row.status           ?? ""),
      errorMessage:    (row.error_message as string | null) ?? null,
      createdAt:       String(row.created_at       ?? ""),
    }));
  },

  labelForStatus(status: DriveMatchStatus): string {
    return DRIVE_STATUS_LABELS[status] ?? "Resultado desconhecido.";
  },
};
