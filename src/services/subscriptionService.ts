import { getPlanDefinition, PLAN_DEFINITIONS, type PlanDefinition } from "../config/plans";
import type { PlanId, UserSubscription, UserUsageCounter } from "../types";
import { getSupabaseClient } from "./supabaseClient";

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

  async createCheckoutSession(planId: PlanId) {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.functions.invoke("create-checkout-session", {
      body: { planId },
    });

    if (error) {
      throw new Error(error.message || "Falha ao criar sessão de checkout.");
    }

    return data as { checkout_url: string };
  },

  async createBillingPortalSession() {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.functions.invoke("create-billing-portal-session");

    if (error) {
      throw new Error(error.message || "Falha ao abrir portal de cobrança.");
    }

    return data as { portal_url: string };
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
  const canUseApp = isTrialing || isActive;
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

export const getPlanByPriceId = (priceId: string | null | undefined) => {
  const found = Object.values(PLAN_DEFINITIONS).find((plan) => plan.stripePriceId === priceId);
  return found?.id || null;
};
