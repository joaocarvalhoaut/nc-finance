import React, { useState } from "react";
import { Check, X } from "lucide-react";
import { PLAN_LIST, getPlanDefinition } from "../config/plans";
import { BillingError, type BillingAction } from "../services/subscriptionService";
import type { PlanId, UserSubscription } from "../types";
import { subscriptionBadge } from "../config/subscriptionBadge";

/**
 * Gerenciar assinatura — substitui o portal da Stripe: pagar a fatura em
 * aberto, trocar de plano, cancelar e reativar. Tudo passa pela Edge Function
 * asaas-billing; aqui só há a tela.
 */

interface GerenciarAssinaturaProps {
  subscription: UserSubscription | null;
  /** Cobranças enviadas no mês, para a barra de uso. */
  chargesSent?: number;
  onClose: () => void;
  onAction: (action: BillingAction, planId?: PlanId) => Promise<{ invoice_url?: string | null; current_period_end?: string | null }>;
  /** Conta sem assinatura no Asaas (ex.: criada na época da Stripe): ativa uma. */
  onCheckout: (planId: PlanId, cpfCnpj?: string) => Promise<{ status: string; invoice_url?: string | null; trial_end?: string | null }>;
  /** Recarrega a assinatura depois de uma mudança. */
  onChanged: () => Promise<void>;
}

const formatDate = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—";

const brl = (v: number) => `R$ ${v.toLocaleString("pt-BR")}`;

const Rotulo = ({ children }: { children: React.ReactNode }) => (
  <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">{children}</p>
);

export default function GerenciarAssinatura({
  subscription, chargesSent = 0, onClose, onAction, onCheckout, onChanged,
}: GerenciarAssinaturaProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  // Plano escolhido na lista (troca ou ativação), aguardando confirmação.
  const [planoEscolhido, setPlanoEscolhido] = useState<PlanId | null>(null);
  const [confirmarCancelamento, setConfirmarCancelamento] = useState(false);
  // Ativação no Asaas: se o cadastro não tiver CPF, pede o documento.
  const [pedirDocumento, setPedirDocumento] = useState(false);
  const [documento, setDocumento] = useState("");
  const documentoDigitos = documento.replace(/\D/g, "");

  const plano = getPlanDefinition(subscription?.plan);
  const status = subscription?.status ?? "not_started";
  const cancelada = Boolean(subscription?.cancelAtPeriodEnd) || status === "canceled";
  const fim = subscription?.currentPeriodEnd ?? null;
  // Conta sem assinatura no Asaas: as ações de pagar, trocar e cancelar não têm
  // o que alterar — a tela oferece ativar a assinatura.
  const cortesia = subscription?.billingProvider === "cortesia";
  const semAsaas = !subscription?.asaasSubscriptionId && !cortesia;
  // Cancelada mas ainda no período pago (ou no teste): dá para religar.
  const podeReativar = !semAsaas && !cortesia && cancelada && status !== "canceled";
  const podeGerenciar = !semAsaas && !cortesia && !cancelada;
  const podeTrocar = podeGerenciar && (status === "active" || status === "trialing" || status === "past_due");

  const selo = subscriptionBadge(subscription);

  // Linha de data: o que importa saber agora sobre esta assinatura.
  const data: { rotulo: string; valor: string; nota?: string } | null =
    cortesia || semAsaas ? null
    : cancelada && status !== "canceled" ? { rotulo: "Acesso até", valor: formatDate(fim), nota: "Assinatura cancelada — não haverá novas cobranças." }
    : status === "trialing" && fim ? { rotulo: "Teste grátis até", valor: formatDate(fim), nota: "A primeira fatura vence nesse dia." }
    : status === "past_due" ? { rotulo: "Fatura vencida em", valor: formatDate(fim), nota: "Pague para não ter o envio bloqueado." }
    : status === "active" ? { rotulo: "Próxima fatura", valor: formatDate(fim) }
    : null;

  const limite = plano.monthlyChargeLimit || 1;
  const usoPct = Math.min(100, (chargesSent / limite) * 100);

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
    setPlanoEscolhido(null);
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
      setPlanoEscolhido(null);
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

  const reativar = () => executar(async () => {
    const { current_period_end } = await onAction("reactivate");
    await onChanged();
    setInfo(`Assinatura reativada. A próxima fatura vence em ${formatDate(current_period_end ?? fim)}.`);
  });

  const cancelar = () => executar(async () => {
    const { current_period_end } = await onAction("cancel");
    await onChanged();
    setConfirmarCancelamento(false);
    setInfo(`Assinatura cancelada. Você continua com acesso até ${formatDate(current_period_end ?? fim)}.`);
  });

  // Lista de planos: troca (assinatura ativa) ou ativação (conta sem Asaas).
  const mostrarPlanos = podeTrocar || semAsaas;
  const escolhido = planoEscolhido ? getPlanDefinition(planoEscolhido) : null;
  const documentoOk = !pedirDocumento || documentoDigitos.length === 11 || documentoDigitos.length === 14;

  const btnPrimario = "w-full py-2.5 px-3 rounded-lg text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-black disabled:opacity-50 transition-colors cursor-pointer";
  const btnSecundario = "py-2 px-3 rounded-lg text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-200 disabled:opacity-50 transition-colors cursor-pointer";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-zinc-950 border border-zinc-800 rounded-xl max-w-md w-full shadow-2xl max-h-[90vh] overflow-y-auto">

        {/* ── Plano e status ───────────────────────────────────────────── */}
        <div className="p-5 pb-4">
          <div className="flex items-start justify-between gap-3">
            <Rotulo>Assinatura</Rotulo>
            <button onClick={onClose} disabled={busy} className="-mt-1 -mr-1 p-1 text-zinc-500 hover:text-white cursor-pointer disabled:opacity-50" aria-label="Fechar">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="mt-2 flex items-center justify-between gap-3">
            <h3 className="text-2xl font-black text-white tracking-tight">{plano.name}</h3>
            <span className={`text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded border ${selo.cls}`}>{selo.txt}</span>
          </div>
          <p className="mt-1 text-xs text-zinc-400">
            {cortesia
              ? <>Sem cobrança · {plano.monthlyChargeLimit.toLocaleString("pt-BR")} cobranças/mês</>
              : <>{brl(plano.priceBRL)}/mês · {plano.monthlyChargeLimit.toLocaleString("pt-BR")} cobranças/mês</>}
          </p>
        </div>

        {/* ── Uso do mês e data ────────────────────────────────────────── */}
        <div className="border-t border-zinc-800/80 px-5 py-4 space-y-4">
          <div>
            <div className="flex items-baseline justify-between">
              <Rotulo>Uso do mês</Rotulo>
              <span className="text-xs font-mono text-zinc-300">
                {chargesSent.toLocaleString("pt-BR")} <span className="text-zinc-600">/ {plano.monthlyChargeLimit.toLocaleString("pt-BR")}</span>
              </span>
            </div>
            <div className="mt-2 h-1 bg-zinc-800 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${usoPct >= 90 ? "bg-amber-400" : "bg-emerald-500"}`} style={{ width: `${usoPct}%` }} />
            </div>
          </div>

          {data && (
            <div className="flex items-start justify-between gap-3">
              <div>
                <Rotulo>{data.rotulo}</Rotulo>
                {data.nota && <p className="text-[11px] text-zinc-500 mt-1">{data.nota}</p>}
              </div>
              <span className="text-sm font-mono text-white">{data.valor}</span>
            </div>
          )}

          {cortesia && (
            <p className="text-xs text-zinc-400 leading-relaxed">
              Acesso cortesia: todos os recursos do plano liberados, sem fatura. Não há assinatura para gerenciar.
            </p>
          )}

          {semAsaas && (
            <p className="text-xs text-zinc-400 leading-relaxed">
              Sua conta ainda não tem assinatura no novo sistema de pagamento. Escolha o plano abaixo para
              ativar — a fatura mensal é paga por Pix, boleto ou cartão.
            </p>
          )}
        </div>

        {/* ── Mensagens ────────────────────────────────────────────────── */}
        {(error || info) && (
          <div className="px-5 pb-1">
            {error && <p className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">{error}</p>}
            {info && <p className="text-xs text-emerald-200 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">{info}</p>}
          </div>
        )}

        {/* ── Ações principais ─────────────────────────────────────────── */}
        {(podeGerenciar || podeReativar) && (
          <div className="px-5 py-3">
            {podeReativar ? (
              <button onClick={() => void reativar()} disabled={busy} className={btnPrimario}>
                Reativar assinatura
                <span className="block text-[10px] font-medium opacity-70">Sem cobrança agora — a próxima fatura vence em {formatDate(fim)}</span>
              </button>
            ) : (
              <button onClick={() => void pagar()} disabled={busy} className={btnPrimario}>
                Pagar fatura em aberto
                <span className="block text-[10px] font-medium opacity-70">Pix, boleto ou cartão</span>
              </button>
            )}
          </div>
        )}

        {/* ── Planos ───────────────────────────────────────────────────── */}
        {mostrarPlanos && (
          <div className="border-t border-zinc-800/80 px-5 py-4 space-y-2">
            <Rotulo>{semAsaas ? "Escolha o plano" : "Trocar de plano"}</Rotulo>
            <div className="rounded-lg border border-zinc-800 divide-y divide-zinc-800 overflow-hidden">
              {PLAN_LIST.map((p) => {
                const atual = !semAsaas && p.id === plano.id;
                const marcado = planoEscolhido === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => { setPlanoEscolhido(marcado ? null : p.id); setError(""); setInfo(""); }}
                    disabled={busy || atual}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                      marcado ? "bg-emerald-500/10" : atual ? "bg-zinc-900/60 cursor-default" : "hover:bg-zinc-900 cursor-pointer"
                    }`}
                  >
                    <span className={`w-3.5 h-3.5 rounded-full border flex-shrink-0 flex items-center justify-center ${
                      marcado ? "border-emerald-400 bg-emerald-400" : atual ? "border-zinc-500 bg-zinc-500" : "border-zinc-600"
                    }`}>
                      {(marcado || atual) && <Check className="w-2.5 h-2.5 text-black" strokeWidth={3} />}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-xs font-bold text-white">
                        {p.name}
                        {atual && <span className="ml-2 text-[10px] font-mono uppercase tracking-wider text-zinc-500">atual</span>}
                      </span>
                      <span className="block text-[11px] text-zinc-500">{p.monthlyChargeLimit.toLocaleString("pt-BR")} cobranças/mês</span>
                    </span>
                    <span className="text-xs font-mono text-zinc-300">{brl(p.priceBRL)}</span>
                  </button>
                );
              })}
            </div>

            {escolhido && (
              <div className="rounded-lg border border-emerald-700/50 bg-emerald-500/5 p-3 space-y-2.5">
                <p className="text-xs text-zinc-300 leading-relaxed">
                  {semAsaas
                    ? <>Ativar o <strong className="text-white">{escolhido.name}</strong> por {brl(escolhido.priceBRL)}/mês. Na primeira assinatura a fatura só vence depois de 7 dias grátis.</>
                    : <>Mudar para o <strong className="text-white">{escolhido.name}</strong> por {brl(escolhido.priceBRL)}/mês. O limite muda na hora e a fatura em aberto passa a ter o novo valor.</>}
                </p>
                {semAsaas && pedirDocumento && (
                  <input
                    value={documento}
                    onChange={(e) => setDocumento(e.target.value)}
                    inputMode="numeric"
                    autoFocus
                    placeholder="CPF ou CNPJ"
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-white font-mono placeholder:text-zinc-600 focus:border-emerald-400 focus:outline-none"
                  />
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() => void (semAsaas ? ativar(escolhido.id) : trocarPlano(escolhido.id))}
                    disabled={busy || !documentoOk}
                    className="flex-1 py-2 rounded-lg text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-black disabled:opacity-50 cursor-pointer"
                  >
                    {semAsaas ? "Ativar assinatura" : "Confirmar troca"}
                  </button>
                  <button onClick={() => { setPlanoEscolhido(null); setPedirDocumento(false); }} disabled={busy} className={btnSecundario}>
                    Voltar
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Cancelar ─────────────────────────────────────────────────── */}
        {podeGerenciar && status !== "not_started" && (
          <div className="border-t border-zinc-800/80 px-5 py-3">
            {confirmarCancelamento ? (
              <div className="space-y-2.5">
                <p className="text-xs text-zinc-300 leading-relaxed">
                  {status === "trialing"
                    ? <>Você continua usando até o fim do teste ({formatDate(fim)}) e nada será cobrado.</>
                    : <>Você continua com acesso até o fim do período pago. Depois disso o envio de cobranças é bloqueado.</>}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => void cancelar()}
                    disabled={busy}
                    className="flex-1 py-2 rounded-lg text-xs font-bold bg-rose-700 hover:bg-rose-600 text-white disabled:opacity-50 cursor-pointer"
                  >
                    Confirmar cancelamento
                  </button>
                  <button onClick={() => setConfirmarCancelamento(false)} disabled={busy} className={btnSecundario}>
                    Manter
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setConfirmarCancelamento(true)}
                disabled={busy}
                className="text-[11px] text-zinc-500 hover:text-rose-400 disabled:opacity-50 transition-colors cursor-pointer"
              >
                Cancelar assinatura
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
