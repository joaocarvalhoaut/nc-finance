/**
 * whatsappBatchService — frontend-safe.
 *
 * Chama a Edge Function `send-whatsapp-batch` no backend Supabase.
 * NUNCA contém credenciais Z-API. Toda lógica crítica está no backend.
 */

import { getSupabaseClient } from "./supabaseClient";

// ─── Types ────────────────────────────────────────────────────────────────────

export type BatchItemStatus =
  | "sucesso"
  | "erro"
  | "duplicado"
  | "telefone_invalido"
  | "bloqueado_limite"
  | "devedor_nao_encontrado";

export type BatchTopStatus =
  | "completed"
  | "nao_autenticado"
  | "payload_invalido"
  | "zapi_nao_configurada"
  | "bloqueado_assinatura"
  | "plano_sem_recurso"
  | "erro_interno"
  | "erro_rede";

export interface BatchDebtorResult {
  debtorId:    string;
  clientName:  string;
  phone:       string;
  status:      BatchItemStatus;
  messageId:   string | null;
  logId:       string | null;
  error:       string | null;
  sentWithPdf: boolean;
}

export interface BatchChargeResult {
  success:        boolean;
  status:         BatchTopStatus;
  dryRun:         boolean;
  totalRequested: number;
  totalProcessed: number;
  sent:           number;
  failed:         number;
  duplicated:     number;
  invalidPhone:   number;
  blockedLimit:   number;
  blockedPlan:    number;
  usageAfter:     number;
  usageLimit:     number;
  error:          string | null;
  results:        BatchDebtorResult[];
}

export interface BatchChargeOptions {
  debtorIds:        string[];
  tone?:            string;
  customMessage?:   string;
  dryRun?:          boolean;
  /** storage path + filename for each debtor that has a PDF attached, keyed by debtorId */
  debtorPdfPaths?:  Record<string, { path: string; name: string }>;
}

// ─── Status labels ─────────────────────────────────────────────────────────────

export const BATCH_TOP_STATUS_LABELS: Record<BatchTopStatus, string> = {
  completed:             "Lote processado!",
  nao_autenticado:       "Sessão expirada. Faça login novamente.",
  payload_invalido:      "Dados inválidos. Verifique os devedores selecionados.",
  zapi_nao_configurada:  "Canal de envio não configurado. Contate o suporte.",
  bloqueado_assinatura:  "Assinatura necessária. Verifique seu plano.",
  plano_sem_recurso:     "Envio em lote disponível apenas nos planos Pro e Premium.",
  erro_interno:          "Erro interno. Tente novamente.",
  erro_rede:             "Falha de conexão. Verifique sua internet e tente novamente.",
};

export const BATCH_ITEM_STATUS_LABELS: Record<BatchItemStatus, string> = {
  sucesso:                "Enviado",
  erro:                   "Erro no envio",
  duplicado:              "Duplicado (aguarde 5 min)",
  telefone_invalido:      "Telefone inválido",
  bloqueado_limite:       "Limite atingido",
  devedor_nao_encontrado: "Devedor não encontrado",
};

// ─── Service ──────────────────────────────────────────────────────────────────

const EMPTY_RESULT = (status: BatchTopStatus, error: string): BatchChargeResult => ({
  success:        false,
  status,
  dryRun:         false,
  totalRequested: 0,
  totalProcessed: 0,
  sent:           0,
  failed:         0,
  duplicated:     0,
  invalidPhone:   0,
  blockedLimit:   0,
  blockedPlan:    0,
  usageAfter:     0,
  usageLimit:     0,
  error,
  results:        [],
});

export const whatsappBatchService = {
  async sendBatchCharges(options: BatchChargeOptions): Promise<BatchChargeResult> {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase.functions.invoke<BatchChargeResult>(
      "send-whatsapp-batch",
      {
        body: {
          debtorIds:       options.debtorIds,
          tone:            options.tone          ?? "neutro",
          customMessage:   options.customMessage ?? null,
          dryRun:          options.dryRun        ?? false,
          debtorPdfPaths:  options.debtorPdfPaths ?? null,
        },
      },
    );

    if (error || !data) {
      // FunctionsHttpError exposes the real response via error.context (a Response object).
      // Try to parse it to get the actual status/error from the function body.
      let bodyStatus: BatchTopStatus = "erro_rede";
      let bodyError = error?.message ?? "Não foi possível contatar o servidor.";

      const ctx = (error as Record<string, unknown> | null)?.context;
      if (ctx && typeof (ctx as Response).json === "function") {
        try {
          const body = await (ctx as Response).json() as Record<string, unknown>;
          if (typeof body.status === "string") bodyStatus = body.status as BatchTopStatus;
          if (typeof body.error  === "string") bodyError  = body.error;
        } catch { /* ignore parse errors */ }
      }

      return EMPTY_RESULT(bodyStatus, bodyError);
    }

    return data;
  },

  labelForTopStatus(status: BatchTopStatus): string {
    return BATCH_TOP_STATUS_LABELS[status] ?? "Resultado desconhecido.";
  },

  labelForItemStatus(status: BatchItemStatus): string {
    return BATCH_ITEM_STATUS_LABELS[status] ?? status;
  },
};
