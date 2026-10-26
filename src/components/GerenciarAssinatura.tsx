import React, { useState } from "react";
import { X } from "lucide-react";
import { PLAN_LIST, getPlanDefinition } from "../config/plans";
import { BillingError, type BillingAction } from "../services/subscriptionService";
import type { PlanId, UserSubscription } from "../types";

/**
 * Gerenciar assinatura — substitui o portal da Stripe: pagar a fatura em
 * aberto, trocar de plano e cancelar. Tudo passa pela Edge Function
 * asaas-billing; aqui só há a tela.
 */

interface GerenciarAssinaturaProps {
  subscription: UserSubscription | null;
  onClose: () => void;
  onAction: (action: BillingAction, planId?: PlanId) => Promise<{ invoice_url?: string | null; current_period_end?: string | null }>;
  /** Conta sem assinatura no Asaas (ex.: criada na época da Stripe): ativa uma. */
  onCheckout: (planId: PlanId, cpfCnpj?: string) => Promise<{ status: string; invoice_url?: string | null; trial_end?: string | null }>;
  /** Recarrega a assinatura depois de uma mudança. */
  onChanged: () => Promise<void>;
}

const formatDate = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—";

const STATUS_PT: Record<string, string> = {
  trialing:   "Teste grátis",
  active:     "Ativa",
  past_due:   "Pagamento pendente",
  canceled:   "Cancelada",
  incomplete: "Aguardando pagamento",
};

export default function GerenciarAssinatura({ subscription, onClose, onAction, onCheckout, onChanged }: GerenciarAssinaturaProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [planoPendente, setPlanoPendente] = useState<PlanId | null>(null);
  const [confirmarCancelamento, setConfirmarCancelamento] = useState(false);
  // Ativação no Asaas: plano escolhido e, se o cadastro não tiver CPF, o documento.
  const [planoAtivar, setPlanoAtivar] = useState<PlanId | null>(null);
  const [pedirDocumento, setPedirDocumento] = useState(false);
  const [documento, setDocumento] = useState("");
  const documentoDigitos = documento.replace(/\D/g, "");

  const plano = getPlanDefinition(subscription?.plan);
  const status = subscription?.status ?? "not_started";
  const cancelada = Boolean(subscription?.cancelAtPeriodEnd) || status === "canceled";
  const fim = subscription?.currentPeriodEnd ?? null;
  // Conta sem assinatura no Asaas: as ações de pagar, trocar e cancelar não têm
  // o que alterar — a tela oferece ativar a assinatura.
  const semAsaas = !subscription?.asaasSubscriptionId;

  const linhaData =
    cancelada && status !== "canceled" ? `Cancelada — acesso até ${formatDate(fim)}`
    : status === "trialing" && fim ? `Teste grátis até ${formatDate(fim)}. A primeira fatura vence nesse dia.`
    : status === "past_due" ? `Fatura vencida em ${formatDate(fim)}.`
    : status === "active" ? `Próxima fatura: ${formatDate(fim)}`
    : null;

  const executar = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    setInfo("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao processar a assinatura.");
    } finally {
      setBusy(false);
    }
  };

  const pagar = () => executar(async () => {
    try {
      const { invoice_url } = await onAction("pay");
      if (invoice_url) window.location.assign(invoice_url);
    } catch (e) {
      // Tudo pago e a próxima fatura ainda não foi gerada: não é erro.
      if (e instanceof BillingError && e.code === "sem_fatura") {
        setInfo(fim && status === "active"
          ? `Nada em aberto — está tudo pago. A próxima fatura vence em ${formatDate(fim)}.`
          : "Nada em aberto — está tudo pago.");
        return;
      }
      throw e;
    }
  });

  const trocarPlano = (planId: PlanId) => executar(async () => {
    await onAction("change_plan", planId);
    await onChanged();
    setPlanoPendente(null);
    setInfo(`Plano alterado para ${getPlanDefinition(planId).name}. O novo valor vale a partir da fatura em aberto.`);
  });

  const ativar = (planId: PlanId) => executar(async () => {
    try {
      const result = await onCheckout(planId, pedirDocumento ? documentoDigitos : undefined);
      if (result.invoice_url) {
        window.location.assign(result.invoice_url);
        return;
      }
      await onChanged();
      setPlanoAtivar(null);
      setPedirDocumento(false);
      setInfo(result.trial_end
        ? `Assinatura ativada. Teste grátis até ${formatDate(result.trial_end)}, quando vence a primeira fatura.`
        : "Assinatura ativada.");
    } catch (e) {
      if (e instanceof BillingError && e.code === "documento_necessario") {
        setPedirDocumento(true);
        throw new Error("Informe seu CPF ou CNPJ para emitir a cobrança.");
      }
      throw e;
    }
  });

  const cancelar = () => executar(async () => {
    const { current_period_end } = await onAction("cancel");
    await onChanged();
    setConfirmarCancelamento(false);
    setInfo(`Assinatura cancelada. Você continua com acesso até ${formatDate(current_period_end ?? fim)}.`);
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-sm font-bold text-white">Gerenciar assinatura</h3>
          <button onClick={onClose} disabled={busy} className="text-zinc-500 hover:text-white cursor-pointer disabled:opacity-50" aria-label="Fechar">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="bg-zinc-950 rounded-xl p-3 space-y-1 text-xs">
          <div className="flex justify-between gap-3">
            <span className="text-zinc-500">Plano</span>
            <span className="text-zinc-200">{plano.name} — R$ {plano.priceBRL.toLocaleString("pt-BR")}/mês</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-zinc-500">Status</span>
            <span className="text-zinc-200">{cancelada ? "Cancelada" : STATUS_PT[status] ?? status}</span>
          </div>
          {linhaData && <p className="text-zinc-400 pt-1">{linhaData}</p>}
        </div>

        {error && <p className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-xl px-3 py-2">{error}</p>}
        {info && <p className="text-xs text-emerald-200 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-3 py-2">{info}</p>}

        {semAsaas && (
          <div className="space-y-2">
            <p className="text-xs text-zinc-300 leading-relaxed">
              Sua conta ainda não tem assinatura no novo sistema de pagamento (Asaas).
              Escolha o plano para ativar — a fatura mensal é paga por Pix, boleto ou cartão.
            </p>
            {PLAN_LIST.map((p) => (
              planoAtivar === p.id ? (
                <div key={p.id} className="border border-emerald-700/60 rounded-xl p-3 space-y-2">
                  <p className="text-xs text-zinc-300">
                    Ativar o <strong className="text-white">{p.name}</strong> por R$ {p.priceBRL.toLocaleString("pt-BR")}/mês?
                    Na primeira assinatura a fatura só vence depois de 7 dias grátis.
                  </p>
                  {pedirDocumento && (
                    <input
                      value={documento}
                      onChange={(e) => setDocumento(e.target.value)}
                      inputMode="numeric"
                      autoFocus
                      placeholder="CPF ou CNPJ"
                      className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-white font-mono placeholder:text-zinc-600 focus:border-emerald-400 focus:outline-none"
                    />
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={() => void ativar(p.id)}
                      disabled={busy || (pedirDocumento && documentoDigitos.length !== 11 && documentoDigitos.length !== 14)}
                      className="flex-1 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white cursor-pointer"
                    >
                      Ativar
                    </button>
                    <button
                      onClick={() => { setPlanoAtivar(null); setPedirDocumento(false); }}
                      disabled={busy}
                      className="flex-1 py-2 rounded-xl text-xs font-bold bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 text-white cursor-pointer"
                    >
                      Voltar
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  key={p.id}
                  onClick={() => { setPlanoAtivar(p.id); setError(""); }}
                  disabled={busy}
                  className="w-full flex items-center justify-between gap-3 py-2.5 px-3 rounded-xl text-xs bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-white transition-colors cursor-pointer"
                >
                  <span className="font-bold">{p.name}</span>
                  <span className="text-zinc-400">
                    {p.monthlyChargeLimit.toLocaleString("pt-BR")} cobranças · R$ {p.priceBRL.toLocaleString("pt-BR")}/mês
                  </span>
                </button>
              )
            ))}
          </div>
        )}

        {!semAsaas && !cancelada && (
          <button
            onClick={() => void pagar()}
            disabled={busy}
            className="w-full py-2.5 px-3 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white transition-colors cursor-pointer"
          >
            Pagar fatura em aberto
            <span className="block text-[10px] font-normal opacity-80">Pix, boleto ou cartão</span>
          </button>
        )}

        {!semAsaas && !cancelada && (status === "active" || status === "trialing" || status === "past_due") && (
          <div className="space-y-2">
            <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">Trocar de plano</p>
            {PLAN_LIST.filter((p) => p.id !== plano.id).map((p) => (
              planoPendente === p.id ? (
                <div key={p.id} className="border border-emerald-700/60 rounded-xl p-3 space-y-2">
                  <p className="text-xs text-zinc-300">
                    Mudar para o <strong className="text-white">{p.name}</strong> por R$ {p.priceBRL.toLocaleString("pt-BR")}/mês?
                    O limite muda na hora e a fatura em aberto passa a ter o novo valor.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => void trocarPlano(p.id)}
                      disabled={busy}
                      className="flex-1 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white cursor-pointer"
                    >
                      Confirmar
                    </button>
                    <button
                      onClick={() => setPlanoPendente(null)}
                      disabled={busy}
                      className="flex-1 py-2 rounded-xl text-xs font-bold bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 text-white cursor-pointer"
                    >
                      Voltar
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  key={p.id}
                  onClick={() => setPlanoPendente(p.id)}
                  disabled={busy}
                  className="w-full flex items-center justify-between gap-3 py-2.5 px-3 rounded-xl text-xs bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-white transition-colors cursor-pointer"
                >
                  <span className="font-bold">{p.name}</span>
                  <span className="text-zinc-400">
                    {p.monthlyChargeLimit.toLocaleString("pt-BR")} cobranças · R$ {p.priceBRL.toLocaleString("pt-BR")}/mês
                  </span>
                </button>
              )
            ))}
          </div>
        )}

        {!semAsaas && !cancelada && status !== "not_started" && (
          confirmarCancelamento ? (
            <div className="border border-rose-800/60 rounded-xl p-3 space-y-2">
              <p className="text-xs text-zinc-300">
                {status === "trialing"
                  ? <>Você continua usando até o fim do teste ({formatDate(fim)}) e nada será cobrado.</>
                  : <>Você continua com acesso até o fim do período pago. Depois disso o envio de cobranças é bloqueado.</>}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => void cancelar()}
                  disabled={busy}
                  className="flex-1 py-2 rounded-xl text-xs font-bold bg-rose-700 hover:bg-rose-600 disabled:opacity-50 text-white cursor-pointer"
                >
                  Confirmar cancelamento
                </button>
                <button
                  onClick={() => setConfirmarCancelamento(false)}
                  disabled={busy}
                  className="flex-1 py-2 rounded-xl text-xs font-bold bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 text-white cursor-pointer"
                >
                  Manter assinatura
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setConfirmarCancelamento(true)}
              disabled={busy}
              className="w-full text-[10px] text-zinc-600 hover:text-rose-400 disabled:opacity-50 transition-colors pt-1 cursor-pointer"
            >
              Cancelar assinatura
            </button>
          )
        )}
      </div>
    </div>
  );
}
