import React from "react";
import { AlertTriangle, ArrowRight, BadgeCheck, CreditCard, ShieldCheck, Sparkles } from "lucide-react";
import { PLAN_LIST } from "../config/plans";
import type { PlanId, UserSubscription, UserUsageCounter } from "../types";

interface SubscriptionGateProps {
  email: string;
  loading: boolean;
  error: string;
  selectedPlanId: PlanId | null;
  onSelectPlan: (planId: PlanId) => void;
  onManageSubscription: () => void;
  onRefresh: () => void;
  subscription: UserSubscription | null;
  usage: UserUsageCounter | null;
}

const formatDate = (value: string | null | undefined) => {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("pt-BR");
};

export default function SubscriptionGate({
  email,
  loading,
  error,
  selectedPlanId,
  onSelectPlan,
  onManageSubscription,
  onRefresh,
  subscription,
  usage,
}: SubscriptionGateProps) {
  return (
    <div className="min-h-screen bg-zinc-950 text-white px-4 py-10 sm:px-8">
      <div className="mx-auto max-w-6xl space-y-8">
        <div className="rounded-[32px] border border-emerald-500/10 bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 p-8 shadow-2xl">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">
                <ShieldCheck className="h-4 w-4" /> Assinatura obrigatória
              </div>
              <div>
                <h1 className="text-3xl font-black tracking-tight sm:text-4xl">Ative seu acesso ao NC Finance</h1>
                <p className="mt-2 max-w-2xl text-sm text-zinc-400 sm:text-base">
                  Cada conta possui uma assinatura Stripe com 7 dias grátis. O cartão é exigido no checkout,
                  mas você pode cancelar a qualquer momento pelo portal de cobrança.
                </p>
              </div>
            </div>

            <div className="rounded-3xl border border-zinc-800 bg-zinc-950/80 p-5 text-sm text-zinc-300">
              <div className="text-zinc-500">Conta autenticada</div>
              <div className="mt-1 font-mono text-emerald-300">{email}</div>
              {subscription && (
                <div className="mt-4 space-y-1 text-xs">
                  <div>Status atual: <span className="font-semibold text-white">{subscription.status}</span></div>
                  <div>Plano atual: <span className="font-semibold text-white">{subscription.plan}</span></div>
                  <div>Fim do período: <span className="font-semibold text-white">{formatDate(subscription.currentPeriodEnd)}</span></div>
                  <div>Uso do mês: <span className="font-semibold text-white">{usage?.chargesSent || 0}</span> cobranças</div>
                </div>
              )}
            </div>
          </div>
        </div>

        {(error || loading) && (
          <div className="space-y-3">
            {loading && (
              <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-100">
                Atualizando assinatura e limites...
              </div>
            )}
            {error && (
              <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                {error}
              </div>
            )}
          </div>
        )}

        {subscription && (
          <div className="rounded-[28px] border border-zinc-800 bg-zinc-900/50 p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">
                  <AlertTriangle className="h-4 w-4" /> Assinatura encontrada
                </div>
                <p className="text-sm text-zinc-300">
                  Você já tem uma assinatura registrada. Se precisar atualizar cartão, cancelar no fim do período
                  ou reativar seu acesso, use o portal Stripe.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={onManageSubscription}
                  className="rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-2 text-sm font-semibold text-white transition hover:border-emerald-400"
                >
                  Gerenciar assinatura
                </button>
                <button
                  onClick={onRefresh}
                  className="rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:border-zinc-600"
                >
                  Atualizar status
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="grid gap-5 lg:grid-cols-3">
          {PLAN_LIST.map((plan) => {
            const isSelected = selectedPlanId === plan.id;
            return (
              <div
                key={plan.id}
                className={`rounded-[28px] border p-6 shadow-xl transition-all ${
                  isSelected
                    ? "border-emerald-400 bg-emerald-500/10"
                    : "border-zinc-800 bg-zinc-900/50 hover:border-zinc-700"
                }`}
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm uppercase tracking-[0.2em] text-zinc-500">{plan.id}</div>
                      <h2 className="text-2xl font-black">{plan.name}</h2>
                    </div>
                    {isSelected && <BadgeCheck className="h-6 w-6 text-emerald-300" />}
                  </div>

                  <p className="text-sm text-zinc-400">{plan.description}</p>
                  <div className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-4">
                    <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">Limite mensal</div>
                    <div className="mt-2 text-3xl font-black text-emerald-300">
                      {plan.monthlyChargeLimit.toLocaleString("pt-BR")}
                    </div>
                    <div className="text-sm text-zinc-500">cobranças/envios por mês</div>
                  </div>

                  <ul className="space-y-2 text-sm text-zinc-300">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2">
                        <Sparkles className="mt-0.5 h-4 w-4 text-emerald-300" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <button
                  onClick={() => onSelectPlan(plan.id)}
                  disabled={loading}
                  className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-bold text-black transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <CreditCard className="h-4 w-4" />
                  Iniciar trial de 7 dias
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
