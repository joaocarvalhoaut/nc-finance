import { getPlanDefinition, type PlanDefinition } from "../config/plans";
import { canUseSubscription } from "../../supabase/functions/_shared/billingStatus.ts";
import type { PlanId, UserSubscription, UserUsageCounter } from "../types";
import { getSupabaseClient } from "./supabaseClient";
import { track } from "../lib/analytics";

interface UserSubscriptionRow {
  id: string;
  user_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_price_id: string | null;
  plan: PlanId;
  status: UserSubscription["status"];
  cancel_at_period_end: boolean;
  current_period_start: string | null;
  current_period_end: string | null;
  trial_start: string | null;
  trial_end: string | null;
  billing_provider: string | null;
  asaas_subscription_id: string | null;
  created_at: string;
  updated_at: string;
}

interface UserUsageCounterRow {
  id: string;
  user_id: string;
  period: string;
  charges_sent: number;
  sheets_imports: number;
  drive_lookups: number;
  created_at: string;
  updated_at: string;
}

/** Erro de cobrança com o código devolvido pela Edge Function (ex.: documento_necessario). */
export class BillingError extends Error {
  constructor(message: string, public code: string | null = null) {
    super(message);
    this.name = "BillingError";
  }
}

/**
 * Chama uma Edge Function de cobrança. Em resposta non-2xx o supabase-js só
 * dá uma mensagem genérica; o corpo real ({ error, code }) vem em error.context.
 */
const invokeBilling = async <T>(fn: string, body: Record<string, unknown>, fallback: string): Promise<T> => {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (!error) return data as T;

  let message = fallback;
  let code: string | null = null;
  try {
    const ctx = (error as unknown as { context?: Response }).context;
    if (ctx) {
      const parsed = await ctx.json() as { error?: string; code?: string };
      if (parsed.error) message = parsed.error;
      if (parsed.code) code = parsed.code;
    }
  } catch { /* corpo não-JSON: usa a mensagem genérica */ }
  throw new BillingError(message, code);
};

export type BillingAction = "sync" | "pay" | "change_plan" | "cancel" | "reactivate";

const SUBSCRIPTIONS_TABLE = "user_subscriptions";
const USAGE_TABLE = "user_usage_counters";
const SUBSCRIPTION_FIELDS = `
  id,
  user_id,
  stripe_customer_id,
  stripe_subscription_id,
  stripe_price_id,
  plan,
  status,
  cancel_at_period_end,
  current_period_start,
  current_period_end,
  trial_start,
  trial_end,
  billing_provider,
  asaas_subscription_id,
  created_at,
  updated_at
`;
const USAGE_FIELDS = `
  id,
  user_id,
  period,
  charges_sent,
  sheets_imports,
  drive_lookups,
  created_at,
  updated_at
`;

const mapSubscriptionRow = (row: UserSubscriptionRow): UserSubscription => ({
  id: row.id,
  userId: row.user_id,
  stripeCustomerId: row.stripe_customer_id,
  stripeSubscriptionId: row.stripe_subscription_id,
  stripePriceId: row.stripe_price_id,
  plan: row.plan,
  status: row.status,
  cancelAtPeriodEnd: row.cancel_at_period_end,
  currentPeriodStart: row.current_period_start,
  currentPeriodEnd: row.current_period_end,
  trialStart: row.trial_start,
  trialEnd: row.trial_end,
  billingProvider: row.billing_provider,
  asaasSubscriptionId: row.asaas_subscription_id,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapUsageRow = (row: UserUsageCounterRow): UserUsageCounter => ({
  id: row.id,
  userId: row.user_id,
  period: row.period,
  chargesSent: Number(row.charges_sent || 0),
  sheetsImports: Number(row.sheets_imports || 0),
  driveLookups: Number(row.drive_lookups || 0),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

// IMPORTANTE: usa UTC para casar com a chave de período gravada pelo backend
// (Edge Functions usam getUTCMonth ao incrementar charges_sent). Usar mês local
// aqui fazia o card "Uso mensal" ler uma linha diferente da que o backend grava,
// divergindo de "enviadas" perto da virada de mês. Mantém UTC em todo o sistema.
export const getUsagePeriodKey = (referenceDate = new Date()) => {
  const year = referenceDate.getUTCFullYear();
  const month = `${referenceDate.getUTCMonth() + 1}`.padStart(2, "0");
  return `${year}-${month}`;
};

export const subscriptionService = {
  async getSubscription(userId: string) {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from(SUBSCRIPTIONS_TABLE)
      .select(SUBSCRIPTION_FIELDS)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      throw new Error(error.message || "Falha ao carregar assinatura.");
    }

    return data ? mapSubscriptionRow(data as UserSubscriptionRow) : null;
  },

  async getUsage(userId: string, period = getUsagePeriodKey()) {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from(USAGE_TABLE)
      .select(USAGE_FIELDS)
      .eq("user_id", userId)
      .eq("period", period)
      .maybeSingle();

    if (error) {
      throw new Error(error.message || "Falha ao carregar contadores de uso.");
    }

    return data
      ? mapUsageRow(data as UserUsageCounterRow)
      : {
          id: `usage-${userId}-${period}`,
          userId,
          period,
          chargesSent: 0,
          sheetsImports: 0,
          driveLookups: 0,
        };
  },

  /**
   * Inicia a assinatura no Asaas. Primeira assinatura: volta "trialing" e o
   * acesso já está liberado. Depois disso: volta o link da fatura a pagar.
   * cpfCnpj só é enviado quando o cadastro não tem documento (vai direto ao
   * Asaas; não é gravado).
   */
  async createCheckoutSession(planId: PlanId, cpfCnpj?: string) {
    const data = await invokeBilling<{ status: string; invoice_url?: string | null; trial_end?: string | null }>(
      "asaas-checkout",
      cpfCnpj ? { planId, cpfCnpj } : { planId },
      "Falha ao iniciar a assinatura.",
    );

    // Analytics (opt-in): só o plano escolhido — sem dados de pagamento/PII.
    track("checkout_started", { plan: planId });

    return data;
  },

  /** Gerenciar assinatura: sincronizar, pagar fatura, trocar plano, cancelar. */
  async billingAction(action: BillingAction, planId?: PlanId) {
    return invokeBilling<{
      synced?: boolean;
      invoice_url?: string | null;
      due_date?: string;
      value?: number;
      plan?: PlanId;
      status?: string;
      current_period_end?: string | null;
    }>("asaas-billing", planId ? { action, planId } : { action }, "Falha ao processar a assinatura.");
  },

  async recordUsage(metric: "charges_sent" | "sheets_imports" | "drive_lookups", amount = 1) {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.functions.invoke("record-usage-event", {
      body: { metric, amount },
    });

    if (error) {
      throw new Error(error.message || "Falha ao registrar uso.");
    }

    return data as { period: string; counters: UserUsageCounterRow };
  },
};

export const getSubscriptionEntitlements = (
  subscription: UserSubscription | null,
  usage: UserUsageCounter | null,
) => {
  const planDefinition: PlanDefinition = getPlanDefinition(subscription?.plan);
  const chargesUsed = usage?.chargesSent || 0;
  const remainingCharges = Math.max(planDefinition.monthlyChargeLimit - chargesUsed, 0);
  const isTrialing = subscription?.status === "trialing";
  const isActive = subscription?.status === "active";
  // Regra única com o servidor (billingStatus.ts): considera fim do teste,
  // tolerância de pagamento e cancelamento no fim do período pago.
  const canUseApp = canUseSubscription(subscription && {
    status: subscription.status,
    cancel_at_period_end: subscription.cancelAtPeriodEnd,
    current_period_end: subscription.currentPeriodEnd,
    billing_provider: subscription.billingProvider,
    asaas_subscription_id: subscription.asaasSubscriptionId,
  });
  const canSendCharge = canUseApp && remainingCharges > 0;

  return {
    planDefinition,
    plan: planDefinition.id,
    limits: {
      charges: planDefinition.monthlyChargeLimit,
    },
    remainingCharges,
    canUseApp,
    canSendCharge,
    isTrialing,
    isActive,
  };
};
