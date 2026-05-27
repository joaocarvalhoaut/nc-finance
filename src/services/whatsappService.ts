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
  | "sessao_invalida"
  | "pilot_desabilitado"
  | "fora_horario"
  | "dia_nao_permitido"
  | "limite_diario"
  | "config_ausente"
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
  sessao_invalida:       "Sessão inválida. Faça login novamente.",
  pilot_desabilitado:    "Envio bloqueado: modo piloto desabilitado para esta conta.",
  fora_horario:          "Envio bloqueado: fora da janela permitida do modo piloto.",
  dia_nao_permitido:     "Envio bloqueado: o modo piloto não permite disparos hoje.",
  limite_diario:         "Envio bloqueado: limite diário do modo piloto atingido.",
  config_ausente:        "Envio bloqueado: conta não habilitada no piloto.",
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

    if (error) {
      let errorMsg = error.message ?? "Não foi possível contatar o servidor.";
      let errorStatus: SendChargeStatus = "erro";

      try {
        const ctx = (error as unknown as { context?: Response }).context;
        if (ctx) {
          const body = await ctx.json() as { error?: string; status?: string };
          if (body.error) errorMsg = body.error;
          if (body.status) errorStatus = body.status as SendChargeStatus;
        }
      } catch {
        // Usa a mensagem genérica do SDK caso o body não esteja acessível.
      }

      return {
        success: false,
        status: errorStatus,
        messageId: null,
        zaapId: null,
        logId: null,
        chargesUsed: null,
        chargesLimit: null,
        error: errorMsg,
      };
    }

    if (!data) {
      return {
        success: false,
        status: "erro_interno",
        messageId: null,
        zaapId: null,
        logId: null,
        chargesUsed: null,
        chargesLimit: null,
        error: "Resposta inválida do servidor.",
      };
    }

    return data;
  },

  /** Rótulo legível para o status retornado */
  labelForStatus(status: SendChargeStatus): string {
    return SEND_STATUS_LABELS[status] ?? "Resultado desconhecido.";
  },
};
