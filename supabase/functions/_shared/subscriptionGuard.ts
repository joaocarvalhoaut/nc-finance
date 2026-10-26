/**
 * subscriptionGuard.ts — valida se a assinatura libera o uso do sistema.
 * Regra em billingStatus.ts (teste, ativa, tolerância de pagamento, cancelada
 * dentro do período pago).
 * Usado por Edge Functions que exigem assinatura ativa.
 */

import { createClient } from "npm:@supabase/supabase-js@2.49.8";
import { ACCESS_COLUMNS, canUseSubscription } from "./billingStatus.ts";

// Os genericos precisam ser explicitos: sem eles o ReturnType resolve para os
// padroes da DECLARACAO (SupabaseClient<unknown, never, GenericSchema>), que nao
// batem com o que uma chamada real de createClient(url, key) produz
// (SupabaseClient<any, "public", any>). Sem isso o deno check acusa incompatibilidade
// em toda funcao que passa o admin adiante.
// deno-lint-ignore no-explicit-any
type AdminClient = ReturnType<typeof createClient<any, any, any>>;

export interface SubscriptionInfo {
  status: string;
  plan: string;
}

export interface SubscriptionGuardError {
  kind: "bloqueado_assinatura";
  error: string;
  statusCode: 403;
}

export type SubscriptionGuardResult =
  | { ok: true; subscription: SubscriptionInfo }
  | { ok: false; guard: SubscriptionGuardError };

/**
 * Verifica se a assinatura do usuário libera o uso (ver canUseSubscription).
 * Retorna o objeto de assinatura em caso de sucesso.
 */
export const checkSubscription = async (
  admin: AdminClient,
  userId: string,
): Promise<SubscriptionGuardResult> => {
  const { data: sub } = await admin
    .from("user_subscriptions")
    .select(ACCESS_COLUMNS)
    .eq("user_id", userId)
    .maybeSingle();

  if (!sub || !canUseSubscription(sub)) {
    return {
      ok: false,
      guard: {
        kind: "bloqueado_assinatura",
        error: `Assinatura necessaria. Status: ${sub?.status ?? "sem_assinatura"}.`,
        statusCode: 403,
      },
    };
  }

  return { ok: true, subscription: sub as SubscriptionInfo };
};
