/**
 * billingPlans.ts — preço mensal de cada plano, em reais.
 *
 * FONTE ÚNICA: o checkout do Asaas cobra estes valores e a tela de planos os
 * exibe. Puro (sem Deno, sem DOM): roda nas Edge Functions e no front.
 *
 * Os preços da landing page (LandingPage.tsx) são escritos à mão — ao mudar
 * um valor aqui, mude lá também.
 */

export type PlanId = "basic" | "pro" | "premium";

export const PLAN_IDS: readonly PlanId[] = ["basic", "pro", "premium"];

export const PLAN_PRICE_BRL: Record<PlanId, number> = {
  basic: 49,
  pro: 97,
  premium: 197,
};

export const isPlanId = (value: unknown): value is PlanId =>
  value === "basic" || value === "pro" || value === "premium";

/**
 * Plano correspondente ao valor cobrado pela assinatura.
 *
 * Devolve null quando o valor não bate com nenhum plano (ex.: valor ajustado à
 * mão no painel do Asaas, adicional de número próprio). Quem chama mantém o
 * plano que já tinha — nunca rebaixa para o Básico em silêncio, que era o que
 * o fallback da Stripe fazia.
 */
export const planFromValue = (value: number | null | undefined): PlanId | null => {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return PLAN_IDS.find((id) => Math.abs(PLAN_PRICE_BRL[id] - value) < 0.005) ?? null;
};
