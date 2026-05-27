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
  | "escrita_erro"
  | "bloqueado_assinatura"
  | "google_nao_configurado"
  | "url_invalida"
  | "google_auth_erro"
  | "payload_invalido"
  | "nao_autenticado"
  | "sessao_invalida"
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

export interface ExportResult {
  success: boolean;
  status: ImportStatus;
  rowsExported: number;
  rowsTotal: number;
  spreadsheetId: string | null;
  sheetName: string | null;
  exportedAt: string | null;
  error: string | null;
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
  success:                "Operação concluída com sucesso!",
  error:                  "Erro ao processar. Verifique os dados e tente novamente.",
  leitura_erro:           "Falha ao ler a planilha. Verifique as permissões.",
  escrita_erro:           "Falha ao escrever na planilha. Verifique as permissões de edição.",
  bloqueado_assinatura:   "Assinatura necessária para usar planilhas.",
  google_nao_configurado: "Integração Google Sheets não configurada. Contate o suporte.",
  url_invalida:           "URL ou ID da planilha inválido.",
  google_auth_erro:       "Falha na autenticação com o Google. Contate o suporte.",
  payload_invalido:       "Dados inválidos. Verifique a URL informada.",
  nao_autenticado:        "Sessão expirada. Faça login novamente.",
  sessao_invalida:        "Sessão inválida. Faça login novamente.",
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

    if (error) {
      // Supabase JS lança erro genérico para respostas non-2xx.
      // Tentamos extrair o corpo JSON real da função para exibir
      // a mensagem específica (ex: google_nao_configurado, bloqueado_assinatura).
      let errorMsg  = "Não foi possível contatar o servidor.";
      let errorStatus: ImportStatus = "erro_interno";

      try {
        // FunctionsHttpError expõe a Response original em error.context
        const ctx = (error as unknown as { context?: Response }).context;
        if (ctx) {
          const body = await ctx.json() as { error?: string; status?: string };
          if (body.error)  errorMsg    = body.error;
          if (body.status) errorStatus = body.status as ImportStatus;
        }
      } catch { /* ignora — usa mensagem genérica */ }

      return {
        success: false,
        status: errorStatus,
        rowsTotal: 0,
        rowsImported: 0,
        rowsSkipped: 0,
        error: errorMsg,
        logId: null,
        spreadsheetId: null,
        lastSyncAt: null,
      };
    }

    if (!data) {
      return {
        success: false,
        status: "erro_interno",
        rowsTotal: 0,
        rowsImported: 0,
        rowsSkipped: 0,
        error: "Resposta inválida do servidor.",
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

  async exportToSheets(params: {
    spreadsheetUrl: string;
    sheetName?: string;
  }): Promise<ExportResult> {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase.functions.invoke<ExportResult>(
      "export-to-sheets",
      { body: params },
    );

    if (error) {
      let errorMsg    = "Não foi possível contatar o servidor.";
      let errorStatus: ImportStatus = "erro_interno";

      try {
        const ctx = (error as unknown as { context?: Response }).context;
        if (ctx) {
          const body = await ctx.json() as { error?: string; status?: string };
          if (body.error)  errorMsg    = body.error;
          if (body.status) errorStatus = body.status as ImportStatus;
        }
      } catch { /* ignora */ }

      return {
        success: false,
        status: errorStatus,
        rowsExported: 0,
        rowsTotal: 0,
        spreadsheetId: null,
        sheetName: null,
        exportedAt: null,
        error: errorMsg,
      };
    }

    if (!data) {
      return {
        success: false,
        status: "erro_interno",
        rowsExported: 0,
        rowsTotal: 0,
        spreadsheetId: null,
        sheetName: null,
        exportedAt: null,
        error: "Resposta inválida do servidor.",
      };
    }

    return data;
  },

  labelForStatus(status: ImportStatus): string {
    return IMPORT_STATUS_LABELS[status] ?? "Resultado desconhecido.";
  },
};
