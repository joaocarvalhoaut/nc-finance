/**
 * subscriptionGuard.ts — valida assinatura Stripe (trialing | active).
 * Usado por Edge Functions que exigem assinatura ativa.
 */

import { createClient } from "npm:@supabase/supabase-js@2.49.8";

type AdminClient = ReturnType<typeof createClient>;

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

const ALLOWED_STATUSES = ["trialing", "active"];

/**
 * Verifica se o usuário possui assinatura ativa (trialing | active).
 * Retorna o objeto de assinatura em caso de sucesso.
 */
export const checkSubscription = async (
  admin: AdminClient,
  userId: string,
): Promise<SubscriptionGuardResult> => {
  const { data: sub } = await admin
    .from("user_subscriptions")
    .select("status, plan")
    .eq("user_id", userId)
    .maybeSingle();

  if (!sub || !ALLOWED_STATUSES.includes(sub.status)) {
    return {
      ok: false,
      guard: {
        kind: "bloqueado_assinatura",
        error: `Assinatura necessaria (trialing ou active). Status: ${sub?.status ?? "sem_assinatura"}.`,
        statusCode: 403,
      },
    };
  }

  return { ok: true, subscription: sub as SubscriptionInfo };
};
