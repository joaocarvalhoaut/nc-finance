import React from "react";
import { CreditCard, Gauge, ShieldCheck } from "lucide-react";
import { getPlanDefinition } from "../config/plans";
import type { UserSubscription, UserUsageCounter } from "../types";

interface SubscriptionStatusCardProps {
  subscription: UserSubscription | null;
  usage: UserUsageCounter | null;
  remainingCharges: number;
  canSendCharge: boolean;
  onManageSubscription: () => void;
}

const formatDate = (value: string | null | undefined) => {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("pt-BR");
};

const STATUS_PT: Record<string, string> = {
  trialing:    "Em avaliação",
  active:      "Ativa",
  past_due:    "Pagamento pendente",
  canceled:    "Cancelada",
  unpaid:      "Inadimplente",
  incomplete:  "Incompleta",
  not_started: "Não iniciada",
};

export default function SubscriptionStatusCard({
  subscription,
  usage,
  remainingCharges,
  canSendCharge,
  onManageSubscription,
}: SubscriptionStatusCardProps) {
  const plan = getPlanDefinition(subscription?.plan);

  return (
    <div className="rounded-[28px] border border-zinc-900 bg-zinc-900/60 p-5 shadow-xl">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-300">
            <ShieldCheck className="h-4 w-4" /> Assinatura da conta
          </div>
          <h3 className="text-lg font-black text-white">{plan.name}</h3>
          <p className="text-sm text-zinc-400">
            Status: <span className="font-semibold text-white">{STATUS_PT[subscription?.status || "not_started"] ?? subscription?.status}</span>
            {subscription?.cancelAtPeriodEnd && (
              <span className="ml-2 text-amber-300">• cancelamento no fim do período</span>
            )}
          </p>
        </div>

        <button
          onClick={onManageSubscription}
          className="inline-flex items-center justify-center gap-2 rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-2 text-sm font-semibold text-white transition hover:border-emerald-400"
        >
          <CreditCard className="h-4 w-4" />
          Gerenciar assinatura
        </button>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
          <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">Trial / renovação</div>
          <div className="mt-2 text-lg font-bold text-white">
            {subscription?.status === "trialing" ? formatDate(subscription.trialEnd) : formatDate(subscription?.currentPeriodEnd)}
          </div>
          <div className="text-xs text-zinc-500">
            {subscription?.status === "trialing" ? "Fim do trial" : "Próxima cobrança"}
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
          <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">Uso mensal</div>
          <div className="mt-2 text-lg font-bold text-white">{usage?.chargesSent || 0}</div>
          <div className="text-xs text-zinc-500">de {plan.monthlyChargeLimit.toLocaleString("pt-BR")} cobranças</div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-zinc-500">
            <Gauge className="h-4 w-4" /> Restante
          </div>
          <div className="mt-2 text-lg font-bold text-emerald-300">{remainingCharges}</div>
          <div className={`text-xs ${canSendCharge ? "text-emerald-300" : "text-rose-300"}`}>
            {canSendCharge ? "Envios liberados" : "Envios bloqueados pelo plano/status"}
          </div>
        </div>
      </div>
    </div>
  );
}
