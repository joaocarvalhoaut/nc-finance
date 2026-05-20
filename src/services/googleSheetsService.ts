/**
 * googleSheetsService — frontend-safe.
 *
 * Chama a Edge Function `import-google-sheets` no backend Supabase.
 * NUNCA contém credenciais Google. Toda autenticação está no backend.
 */

import { getSupabaseClient } from "./supabaseClient";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ImportStatus =
  | "success"
  | "error"
  | "leitura_erro"
  | "bloqueado_assinatura"
  | "google_nao_configurado"
  | "url_invalida"
  | "google_auth_erro"
  | "payload_invalido"
  | "nao_autenticado"
  | "erro_interno";

export interface ImportResult {
  success: boolean;
  status: ImportStatus;
  rowsTotal: number;
  rowsImported: number;
  rowsSkipped: number;
  error: string | null;
  logId: string | null;
  spreadsheetId: string | null;
  lastSyncAt: string | null;
}

export interface GoogleSheetsConfig {
  spreadsheetId: string | null;
  spreadsheetUrl: string | null;
  sheetName: string | null;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
}

export interface ImportLog {
  id: string;
  status: string;
  rowsTotal: number;
  rowsImported: number;
  rowsSkipped: number;
  errorMessage: string | null;
  createdAt: string;
}

// ─── Status labels ─────────────────────────────────────────────────────────────

export const IMPORT_STATUS_LABELS: Record<ImportStatus, string> = {
  success:                "Importação concluída com sucesso!",
  error:                  "Erro ao importar. Verifique os dados e tente novamente.",
  leitura_erro:           "Falha ao ler a planilha. Verifique as permissões.",
  bloqueado_assinatura:   "Assinatura necessária para importar planilhas.",
  google_nao_configurado: "Integração Google Sheets não configurada. Contate o suporte.",
  url_invalida:           "URL ou ID da planilha inválido.",
  google_auth_erro:       "Falha na autenticação com o Google. Contate o suporte.",
  payload_invalido:       "Dados inválidos. Verifique a URL informada.",
  nao_autenticado:        "Sessão expirada. Faça login novamente.",
  erro_interno:           "Erro interno. Tente novamente.",
};

// ─── Service ──────────────────────────────────────────────────────────────────

export const googleSheetsService = {
  async importSheets(params: {
    spreadsheetUrl: string;
    sheetName?: string;
  }): Promise<ImportResult> {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase.functions.invoke<ImportResult>(
      "import-google-sheets",
      { body: params },
    );

    if (error || !data) {
      return {
        success: false,
        status: "error",
        rowsTotal: 0,
        rowsImported: 0,
        rowsSkipped: 0,
        error: error?.message ?? "Não foi possível contatar o servidor.",
        logId: null,
        spreadsheetId: null,
        lastSyncAt: null,
      };
    }

    return data;
  },

  async getConfig(): Promise<GoogleSheetsConfig | null> {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("user_google_sheets_config")
      .select(
        "spreadsheet_id, spreadsheet_url, sheet_name, last_sync_at, last_sync_status, last_sync_error",
      )
      .maybeSingle();

    if (error || !data) return null;

    return {
      spreadsheetId:   (data as Record<string, string | null>).spreadsheet_id,
      spreadsheetUrl:  (data as Record<string, string | null>).spreadsheet_url,
      sheetName:       (data as Record<string, string | null>).sheet_name,
      lastSyncAt:      (data as Record<string, string | null>).last_sync_at,
      lastSyncStatus:  (data as Record<string, string | null>).last_sync_status,
      lastSyncError:   (data as Record<string, string | null>).last_sync_error,
    };
  },

  async getImportLogs(limit = 5): Promise<ImportLog[]> {
    const supabase = getSupabaseClient();
    const { data } = await supabase
      .from("user_import_logs")
      .select("id, status, rows_total, rows_imported, rows_skipped, error_message, created_at")
      .eq("provider", "google_sheets")
      .order("created_at", { ascending: false })
      .limit(limit);

    return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      id:            String(row.id),
      status:        String(row.status),
      rowsTotal:     Number(row.rows_total    ?? 0),
      rowsImported:  Number(row.rows_imported ?? 0),
      rowsSkipped:   Number(row.rows_skipped  ?? 0),
      errorMessage:  (row.error_message as string | null) ?? null,
      createdAt:     String(row.created_at ?? ""),
    }));
  },

  labelForStatus(status: ImportStatus): string {
    return IMPORT_STATUS_LABELS[status] ?? "Resultado desconhecido.";
  },
};
