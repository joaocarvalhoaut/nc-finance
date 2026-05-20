/**
 * usageGuard.ts — lê e incrementa contadores de uso mensal.
 * Usado por Edge Functions que consomem charges_sent.
 */

import { createClient } from "npm:@supabase/supabase-js@2.49.8";

type AdminClient = ReturnType<typeof createClient>;

// ─── Plan limits (espelha src/config/plans.ts) ────────────────────────────────

type PlanId = "basic" | "pro" | "premium";

export const PLAN_LIMITS: Record<PlanId, number> = {
  basic:   300,
  pro:     1_500,
  premium: 5_000,
};

export const getPlanLimit = (plan: string): number =>
  PLAN_LIMITS[plan as PlanId] ?? 300;

export const getPeriodKey = (): string => {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UsageSnapshot {
  period: string;
  chargesUsed: number;
  planLimit: number;
  remaining: number;
  sheetsImports: number;
  driveLookups: number;
}

// ─── Read ─────────────────────────────────────────────────────────────────────

/**
 * Lê o snapshot de uso atual do usuário para o período corrente.
 */
export const getUsageSnapshot = async (
  admin: AdminClient,
  userId: string,
  plan: string,
): Promise<UsageSnapshot> => {
  const period = getPeriodKey();
  const { data: row } = await admin
    .from("user_usage_counters")
    .select("charges_sent, sheets_imports, drive_lookups")
    .eq("user_id", userId)
    .eq("period", period)
    .maybeSingle();

  const chargesUsed = Number((row as Record<string, number> | null)?.charges_sent ?? 0);
  const planLimit   = getPlanLimit(plan);

  return {
    period,
    chargesUsed,
    planLimit,
    remaining:     Math.max(0, planLimit - chargesUsed),
    sheetsImports: Number((row as Record<string, number> | null)?.sheets_imports ?? 0),
    driveLookups:  Number((row as Record<string, number> | null)?.drive_lookups  ?? 0),
  };
};

// ─── Increment ────────────────────────────────────────────────────────────────

/**
 * Incrementa charges_sent pelo delta informado.
 * Usa upsert para criar o registro do período se ainda não existir.
 * Deve ser chamado uma vez ao final do lote, com o total de sucessos.
 */
export const incrementChargesSent = async (
  admin: AdminClient,
  userId: string,
  snapshot: UsageSnapshot,
  delta: number,
): Promise<void> => {
  if (delta <= 0) return;

  await admin.from("user_usage_counters").upsert(
    {
      user_id:        userId,
      period:         snapshot.period,
      charges_sent:   snapshot.chargesUsed + delta,
      sheets_imports: snapshot.sheetsImports,
      drive_lookups:  snapshot.driveLookups,
      updated_at:     new Date().toISOString(),
    },
    { onConflict: "user_id,period" },
  );
};
