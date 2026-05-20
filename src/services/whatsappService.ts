/**
 * whatsappService — frontend-safe.
 *
 * Chama a Edge Function `send-whatsapp-charge` que roda no backend Supabase.
 * NUNCA contém credenciais Z-API. Toda lógica sensível está no backend.
 */

import { getSupabaseClient } from "./supabaseClient";

// ─── Types ────────────────────────────────────────────────────────────────────

export type SendChargeStatus =
  | "sucesso"
  | "erro"
  | "bloqueado_limite"
  | "bloqueado_assinatura"
  | "duplicado"
  | "telefone_invalido"
  | "zapi_nao_configurada"
  | "nao_autenticado"
  | "erro_interno"
  | "payload_invalido";

export interface SendChargePayload {
  debtorId?: string;
  phone: string;
  message: string;
  tone: string;
  clientName: string;
  documentNumber: string;
  amount: number;
}

export interface SendChargeResult {
  success: boolean;
  status: SendChargeStatus;
  messageId: string | null;
  zaapId: string | null;
  logId: string | null;
  chargesUsed: number | null;
  chargesLimit: number | null;
  error: string | null;
  /** Somente em caso de limite atingido */
  used?: number;
  limit?: number;
}

// ─── Mensagens amigáveis por status ──────────────────────────────────────────

export const SEND_STATUS_LABELS: Record<SendChargeStatus, string> = {
  sucesso:               "Mensagem enviada com sucesso via WhatsApp!",
  erro:                  "Falha temporária ao enviar. Tente novamente.",
  bloqueado_limite:      "Limite mensal de envios atingido. Faça upgrade do seu plano.",
  bloqueado_assinatura:  "Assinatura necessária. Verifique seu plano.",
  duplicado:             "Envio duplicado detectado. Aguarde 5 minutos antes de reenviar.",
  telefone_invalido:     "Telefone inválido. Use DDI+DDD+número (ex: 5577999887720).",
  zapi_nao_configurada:  "Serviço WhatsApp indisponível no momento. Contate o suporte.",
  nao_autenticado:       "Sessão expirada. Faça login novamente.",
  erro_interno:          "Erro interno. Tente novamente ou contate o suporte.",
  payload_invalido:      "Dados inválidos. Verifique os campos e tente novamente.",
};

// ─── Service ──────────────────────────────────────────────────────────────────

export const whatsappService = {
  async sendCharge(payload: SendChargePayload): Promise<SendChargeResult> {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase.functions.invoke<SendChargeResult>(
      "send-whatsapp-charge",
      { body: payload },
    );

    // Erro de rede / Edge Function não alcançada
    if (error || !data) {
      return {
        success: false,
        status: "erro",
        messageId: null,
        zaapId: null,
        logId: null,
        chargesUsed: null,
        chargesLimit: null,
        error: error?.message ?? "Não foi possível contatar o servidor.",
      };
    }

    return data;
  },

  /** Rótulo legível para o status retornado */
  labelForStatus(status: SendChargeStatus): string {
    return SEND_STATUS_LABELS[status] ?? "Resultado desconhecido.";
  },
};
