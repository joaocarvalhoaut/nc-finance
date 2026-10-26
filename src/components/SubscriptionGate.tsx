import React, { useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  BadgeCheck,
  CreditCard,
  LogOut,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { PLAN_LIST } from "../config/plans";
import type { PlanId, UserSubscription, UserUsageCounter } from "../types";

interface SubscriptionGateProps {
  email: string;
  loading: boolean;
  error: string;
  selectedPlanId: PlanId | null;
  onSelectPlan: (planId: PlanId) => void;
  /** Abre a fatura em aberto no Asaas (assinatura aguardando pagamento). */
  onManageSubscription: () => void;
  /** Plano aguardando CPF/CNPJ (o cadastro não tem documento). */
  documentPromptPlanId?: PlanId | null;
  onSubmitDocument?: (planId: PlanId, cpfCnpj: string) => void;
  onCancelDocument?: () => void;
  onRefresh: () => void;
  onBack: () => void;
  onLogout: () => void;
  subscription: UserSubscription | null;
  usage: UserUsageCounter | null;
  /** true enquanto o polling pós-checkout está rodando */
  isSyncing?: boolean;
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

export default function SubscriptionGate({
  email,
  loading,
  error,
  selectedPlanId,
  onSelectPlan,
  onManageSubscription,
  onRefresh,
  onBack,
  onLogout,
  subscription,
  usage,
  isSyncing = false,
  documentPromptPlanId = null,
  onSubmitDocument,
  onCancelDocument,
}: SubscriptionGateProps) {
  const isBusy = loading || isSyncing;
  const [documento, setDocumento] = useState("");
  const documentoDigitos = documento.replace(/\D/g, "");
  const documentoValido = documentoDigitos.length === 11 || documentoDigitos.length === 14;
  // Fatura a pagar: assinatura criada mas sem pagamento, ou vencida além da tolerância.
  const temFatura = subscription?.status === "incomplete" || subscription?.status === "past_due";

  return (
    <div className="min-h-screen bg-zinc-950 text-white px-4 py-10 sm:px-8">
      <div className="mx-auto max-w-6xl space-y-8">

        {/* ── Top navigation row ─────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-4">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:border-zinc-600 hover:text-white cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar para início
          </button>

          <button
            onClick={onLogout}
            className="inline-flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm font-medium text-rose-400 transition hover:border-rose-500/40 hover:bg-rose-500/10 cursor-pointer"
          >
            <LogOut className="h-4 w-4" />
            Sair da conta
          </button>
        </div>

        {/* ── Header card ────────────────────────────────────────────────── */}
        <div className="rounded-[32px] border border-emerald-500/10 bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 p-8 shadow-2xl">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">
                <ShieldCheck className="h-4 w-4" /> Assinatura obrigatória
              </div>
              <div>
                <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
                  Ative seu acesso ao NC Finance
                </h1>
                <p className="mt-2 max-w-2xl text-sm text-zinc-400 sm:text-base">
                  Na primeira assinatura você tem 7 dias grátis, sem cartão. A fatura mensal
                  pode ser paga por Pix, boleto ou cartão, e você cancela quando quiser.
                </p>
              </div>
            </div>

            <div className="rounded-3xl border border-zinc-800 bg-zinc-950/80 p-5 text-sm text-zinc-300 min-w-[220px]">
              <div className="text-zinc-500">Conta autenticada</div>
              <div className="mt-1 font-mono text-emerald-300 truncate">{email}</div>
              {subscription && (
                <div className="mt-4 space-y-1 text-xs">
                  <div>
                    Status:{" "}
                    <span className="font-semibold text-white">{STATUS_PT[subscription.status] ?? subscription.status}</span>
                  </div>
                  <div>
                    Plano:{" "}
                    <span className="font-semibold text-white">{subscription.plan}</span>
                  </div>
                  <div>
                    Fim do período:{" "}
                    <span className="font-semibold text-white">
                      {formatDate(subscription.currentPeriodEnd)}
                    </span>
                  </div>
                  <div>
                    Uso do mês:{" "}
                    <span className="font-semibold text-white">
                      {usage?.chargesSent || 0}
                    </span>{" "}
                    cobranças
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Syncing banner (pós-checkout) ──────────────────────────────── */}
        {isSyncing && (
          <div className="flex items-center gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-5 py-4">
            <RefreshCw className="h-5 w-5 text-emerald-400 animate-spin flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-emerald-200">
                Sincronizando pagamento…
              </p>
              <p className="text-xs text-emerald-400/70 mt-0.5">
                O pagamento foi confirmado. Aguardando atualização da assinatura — isso pode
                levar alguns segundos.
              </p>
            </div>
          </div>
        )}

        {/* ── Status banners ──────────────────────────────────────────────── */}
        {(error || (loading && !isSyncing)) && (
          <div className="space-y-3">
            {loading && !isSyncing && (
              <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-100">
                Verificando assinatura…
              </div>
            )}
            {error && (
              <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200 flex items-start justify-between gap-3">
                <span>{error}</span>
                <button
                  onClick={onRefresh}
                  className="flex-shrink-0 text-xs underline text-rose-300 hover:text-rose-100 cursor-pointer"
                >
                  Tentar novamente
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── CPF/CNPJ para emitir a cobrança ──────────────────────────────── */}
        {documentPromptPlanId && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (documentoValido) onSubmitDocument?.(documentPromptPlanId, documentoDigitos);
            }}
            className="rounded-2xl border border-emerald-500/20 bg-zinc-900/60 p-5 space-y-3"
          >
            <div>
              <p className="text-sm font-semibold text-white">Informe seu CPF ou CNPJ</p>
              <p className="text-xs text-zinc-400 mt-1">
                É exigido para emitir a fatura da assinatura. Vai direto para o Asaas, que processa o
                pagamento — não fica guardado no NC Finance.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                value={documento}
                onChange={(e) => setDocumento(e.target.value)}
                inputMode="numeric"
                autoFocus
                placeholder="000.000.000-00 ou 00.000.000/0000-00"
                className="flex-1 rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-2.5 text-sm text-white font-mono placeholder:text-zinc-600 focus:border-emerald-400 focus:outline-none"
              />
              <button
                type="submit"
                disabled={!documentoValido || isBusy}
                className="rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-black transition hover:bg-emerald-300 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                Continuar
              </button>
              <button
                type="button"
                onClick={onCancelDocument}
                className="rounded-xl border border-zinc-800 px-4 py-2.5 text-sm text-zinc-400 hover:text-white cursor-pointer"
              >
                Voltar
              </button>
            </div>
          </form>
        )}

        {/* ── Assinatura existente mas status bloqueado ───────────────────── */}
        {subscription && !isSyncing && (
          <div className="rounded-[28px] border border-zinc-800 bg-zinc-900/50 p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">
                  <AlertTriangle className="h-4 w-4" /> Assinatura encontrada
                </div>
                <p className="text-sm text-zinc-300">
                  {temFatura
                    ? <>Sua assinatura está aguardando pagamento ({STATUS_PT[subscription.status] ?? subscription.status}).
                        Pague a fatura por Pix, boleto ou cartão para liberar o acesso. Se já pagou,
                        clique em "Atualizar assinatura" — boleto pode levar até 3 dias úteis para compensar.</>
                    : <>Sua assinatura está {(STATUS_PT[subscription.status] ?? subscription.status).toLowerCase()}.
                        Escolha um plano abaixo para assinar de novo.</>}
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                {temFatura && (
                  <button
                    onClick={onManageSubscription}
                    disabled={isBusy}
                    className="rounded-2xl bg-white px-4 py-2 text-sm font-bold text-black transition hover:bg-emerald-300 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                  >
                    Pagar fatura
                  </button>
                )}
                <button
                  onClick={onRefresh}
                  disabled={isBusy}
                  className="rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:border-zinc-600 flex items-center gap-1.5 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                  Atualizar assinatura
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Planos ─────────────────────────────────────────────────────── */}
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
                      <div className="text-sm uppercase tracking-[0.2em] text-zinc-500">
                        {plan.id}
                      </div>
                      <h2 className="text-2xl font-black">{plan.name}</h2>
                    </div>
                    {isSelected && <BadgeCheck className="h-6 w-6 text-emerald-300" />}
                  </div>

                  <p className="text-sm text-zinc-400">{plan.description}</p>

                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-black text-white">
                      R$ {plan.priceBRL.toLocaleString("pt-BR")}
                    </span>
                    <span className="text-sm text-zinc-500">/mês</span>
                  </div>

                  <div className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-4">
                    <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">
                      Limite mensal
                    </div>
                    <div className="mt-2 text-3xl font-black text-emerald-300">
                      {plan.monthlyChargeLimit.toLocaleString("pt-BR")}
                    </div>
                    <div className="text-sm text-zinc-500">cobranças/envios por mês</div>
                  </div>

                  <ul className="space-y-2 text-sm text-zinc-300">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2">
                        <Sparkles className="mt-0.5 h-4 w-4 text-emerald-300 flex-shrink-0" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <button
                  onClick={() => onSelectPlan(plan.id)}
                  disabled={isBusy}
                  className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-bold text-black transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <CreditCard className="h-4 w-4" />
                  {isSyncing ? "Aguardando confirmação…" : `Assinar o ${plan.name}`}
                  {!isSyncing && <ArrowRight className="h-4 w-4" />}
                  {isSyncing && (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  )}
                </button>
              </div>
            );
          })}
        </div>

        {/* ── Help footer ────────────────────────────────────────────────── */}
        <p className="text-center text-xs text-zinc-600 pb-4">
          Problemas com o pagamento?{" "}
          <button
            onClick={onRefresh}
            className="text-zinc-400 underline hover:text-white cursor-pointer"
          >
            Forçar atualização do status
          </button>
          {" · "}
          <button
            onClick={onLogout}
            className="text-zinc-400 underline hover:text-white cursor-pointer"
          >
            Sair e usar outra conta
          </button>
        </p>
      </div>
    </div>
  );
}
