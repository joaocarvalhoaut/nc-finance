/**
 * billingLog.ts — inserção segura de logs em user_logs_cobranca.
 *
 * Regras de segurança (obrigatórias):
 *   - NUNCA grava telefone completo — usa maskPhone() antes de persistir.
 *   - NUNCA grava mensagem completa — usa messagePreview() (máx 100 chars).
 *   - NUNCA grava token, client_token, headers brutos ou payload bruto.
 *   - error_message é sanitizado via sanitizeError() antes de gravar.
 *
 * Colunas gravadas em user_logs_cobranca:
 *   phone            → telefone mascarado ("5511*****321")
 *   message          → preview da mensagem (max 100 chars)
 *   error_message    → mensagem sanitizada sem PII
 *   provider_message_id → ID retornado pelo provider (seguro)
 */

import { createClient } from "npm:@supabase/supabase-js@2.49.8";
import { maskPhone, messagePreview, sanitizeError } from "./sanitize.ts";

type AdminClient = ReturnType<typeof createClient>;

export interface BillingLogPayload {
  userId:             string;
  clientName:         string;
  documentNumber:     string;
  /** Raw phone — will be masked before persisting */
  phone:              string;
  amount:             number;
  tone:               string;
  /** Full message — will be truncated to preview before persisting */
  message:            string;
  status:             string;
  type:               "manual" | "lote";
  provider:           string;
  providerMessageId?: string | null;
  /** Raw error — will be sanitized before persisting */
  errorMessage?:      string | null;
  idempotencyKey?:    string | null;
  debtorId?:          string | null;
}

/**
 * Insere um log de cobrança com dados sanitizados.
 * Retorna o ID gerado, ou null em caso de erro silencioso.
 *
 * NUNCA persiste: telefone completo, mensagem completa, tokens ou headers brutos.
 */
export const insertBillingLog = async (
  admin: AdminClient,
  payload: BillingLogPayload,
): Promise<string | null> => {
  try {
    const { data } = await admin
      .from("user_logs_cobranca")
      .insert({
        user_id:             payload.userId,
        client_name:         payload.clientName.slice(0, 255),
        document_number:     payload.documentNumber.slice(0, 100),
        // ── MASKED: never store raw phone ──────────────────────────────
        phone:               maskPhone(payload.phone),
        amount:              payload.amount,
        tone:                payload.tone,
        // ── PREVIEW: never store full message ─────────────────────────
        message:             messagePreview(payload.message, 100),
        status:              payload.status,
        type:                payload.type,
        provider:            payload.provider,
        provider_message_id: payload.providerMessageId ?? null,
        // ── SANITIZED: strip credentials/PII from error text ──────────
        error_message:       payload.errorMessage
                               ? sanitizeError(payload.errorMessage).slice(0, 300)
                               : null,
        idempotency_key:     payload.idempotencyKey ?? null,
        debtor_id:           payload.debtorId ?? null,
      })
      .select("id")
      .single();

    return (data as { id: string } | null)?.id ?? null;
  } catch {
    return null;
  }
};
