/**
 * billingLog.ts — inserção de logs em user_logs_cobranca.
 * Usado por Edge Functions de envio individual e em lote.
 */

import { createClient } from "npm:@supabase/supabase-js@2.49.8";

type AdminClient = ReturnType<typeof createClient>;

export interface BillingLogPayload {
  userId: string;
  clientName: string;
  documentNumber: string;
  phone: string;
  amount: number;
  tone: string;
  message: string;
  status: string;
  type: "manual" | "lote";
  provider: string;
  providerMessageId?: string | null;
  errorMessage?: string | null;
  idempotencyKey?: string | null;
  debtorId?: string | null;
}

/**
 * Insere um log de cobrança e retorna o ID gerado, ou null em caso de erro.
 * Nunca lança exceção — falha silenciosa para não derrubar o fluxo principal.
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
        phone:               payload.phone,
        amount:              payload.amount,
        tone:                payload.tone,
        message:             payload.message.slice(0, 2_000),
        status:              payload.status,
        type:                payload.type,
        provider:            payload.provider,
        provider_message_id: payload.providerMessageId ?? null,
        error_message:       payload.errorMessage ?? null,
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
