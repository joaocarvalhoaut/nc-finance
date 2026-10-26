/**
 * billingStatus.ts — status da assinatura e regra de acesso.
 *
 * FONTE ÚNICA da pergunta "esta conta pode usar o sistema?". Usada pelas Edge
 * Functions (guard de envio, importação, Drive, automação) e pelo front
 * (bloqueio de tela). Puro: sem Deno, sem DOM, sem imports.
 *
 * O status gravado no banco é o mesmo vocabulário de antes (trialing, active,
 * past_due, canceled, incomplete), então as telas não mudam. O que muda é que
 * o acesso agora considera DATAS, não só o status:
 *
 *   trialing  → libera até o fim do teste (+ tolerância)
 *   active    → libera; se cancelada, só até o fim do período já pago
 *   past_due  → libera durante a tolerância após o vencimento em aberto
 *   resto     → bloqueia
 *
 * Antes do status: cortesia libera sempre; conta da época da Stripe sem
 * assinatura no Asaas só vale até STRIPE_LEGACY_CUTOFF.
 *
 * Tolerância: boleto pago no dia do vencimento leva até 3 dias úteis para
 * compensar, e o Asaas marca a cobrança como vencida no dia seguinte. Sem
 * tolerância, quem pagou em dia seria bloqueado.
 */

export const GRACE_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

export type LocalSubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "incomplete";

/**
 * Prazo das contas da época da Stripe (que nunca cobrou de verdade) para
 * ativarem a assinatura pelo Asaas: acesso até o fim de 02/11/2026 (Brasília).
 * Depois disso, sem assinatura no Asaas, a conta é bloqueada como qualquer outra.
 */
export const STRIPE_LEGACY_CUTOFF = "2026-11-03T03:00:00.000Z";

/**
 * Colunas de user_subscriptions que canUseSubscription precisa. Todo select
 * que alimenta o guard usa esta lista — faltar uma coluna desliga a regra
 * correspondente em silêncio.
 */
export const ACCESS_COLUMNS =
  "status, plan, cancel_at_period_end, current_period_end, billing_provider, asaas_subscription_id";

export interface AccessRow {
  status: string | null | undefined;
  cancel_at_period_end?: boolean | null;
  current_period_end?: string | null;
  /** "asaas" | "stripe" (legado) | "cortesia" (acesso sem cobrança, ex.: o dono) */
  billing_provider?: string | null;
  asaas_subscription_id?: string | null;
}

/** Conta da época da Stripe que ainda não ativou a assinatura no Asaas. */
export const isStripeLegacy = (row: AccessRow | null | undefined): boolean =>
  row?.billing_provider === "stripe" && !row?.asaas_subscription_id;

/** Pode usar o sistema agora? */
export const canUseSubscription = (row: AccessRow | null | undefined, now: Date = new Date()): boolean => {
  if (!row) return false;
  // Cortesia: liberada sempre, sem cobrança. Marcada à mão no banco.
  if (row.billing_provider === "cortesia") return true;
  // Legado da Stripe: além da regra normal, só até o prazo de migração.
  if (isStripeLegacy(row) && now.getTime() >= Date.parse(STRIPE_LEGACY_CUTOFF)) return false;

  const end = row.current_period_end ? Date.parse(row.current_period_end) : NaN;
  const hasEnd = Number.isFinite(end);
  const t = now.getTime();

  switch (row.status) {
    case "trialing":
      return !hasEnd || t < end + GRACE_DAYS * DAY_MS;
    case "active":
      if (row.cancel_at_period_end && hasEnd) return t < end;
      return true;
    case "past_due":
      return hasEnd && t < end + GRACE_DAYS * DAY_MS;
    default:
      return false;
  }
};

// ─── Datas ──────────────────────────────────────────────────────────────────
// O Asaas trabalha com datas de calendário ("YYYY-MM-DD") no horário de
// Brasília. Gravamos no banco o início desse dia em Brasília (03:00 UTC —
// o Brasil não tem horário de verão desde 2019).

/** "2026-10-26" → "2026-10-26T03:00:00.000Z" (meia-noite em Brasília) */
export const brDateToIso = (date: string): string => `${date}T03:00:00.000Z`;

/** Data de hoje em Brasília, "YYYY-MM-DD". */
export const todayBr = (now: Date = new Date()): string =>
  new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);

/** Soma dias a uma data "YYYY-MM-DD". */
export const addDays = (date: string, days: number): string => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/**
 * Soma meses a uma data "YYYY-MM-DD", limitando ao último dia do mês:
 * 31/01 + 1 mês = 28/02 (ou 29), nunca 03/03.
 */
export const addMonths = (date: string, months: number): string => {
  const [y, m, d] = date.split("-").map(Number);
  const alvo = new Date(Date.UTC(y, m - 1 + months, 1));
  const ultimoDia = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(d, ultimoDia));
  return alvo.toISOString().slice(0, 10);
};

// ─── Asaas → status local ───────────────────────────────────────────────────

export interface AsaasSubscriptionLite {
  status: string;          // ACTIVE | INACTIVE | EXPIRED
  deleted?: boolean;
}

export interface AsaasPaymentLite {
  status: string;          // PENDING | RECEIVED | CONFIRMED | OVERDUE | REFUNDED | ...
  dueDate: string;         // "YYYY-MM-DD"
  deleted?: boolean;
}

export interface SubscriptionState {
  status: LocalSubscriptionStatus;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

/** Status de cobrança que contam como pagas. Estorno e chargeback não contam. */
const PAID = new Set(["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"]);

const byDueDate = (a: AsaasPaymentLite, b: AsaasPaymentLite) => a.dueDate.localeCompare(b.dueDate);

/**
 * Traduz o estado da assinatura no Asaas para o status local.
 *
 * Sempre recalculado do zero a partir da assinatura e de TODAS as suas
 * cobranças, buscadas na hora na API. Por isso não importa a ordem em que os
 * webhooks chegam, nem se algum se perdeu: o resultado é o mesmo.
 *
 * `trialEnd` vem do banco (gravado no checkout): o Asaas não tem o conceito de
 * período de teste — o teste é só a primeira cobrança vencendo 7 dias depois.
 */
export const computeSubscriptionState = (
  subscription: AsaasSubscriptionLite | null,
  payments: AsaasPaymentLite[],
  opts: { trialEnd: string | null; now?: Date },
): SubscriptionState => {
  const now = opts.now ?? new Date();
  const vivas = payments.filter((p) => !p.deleted);
  const pagas = vivas.filter((p) => PAID.has(p.status)).sort(byDueDate);
  const ultimaPaga = pagas.length > 0 ? pagas[pagas.length - 1] : undefined;

  // Período coberto pela última fatura paga: do vencimento dela até o mesmo
  // dia do mês seguinte (planos mensais).
  const pagoInicio = ultimaPaga ? brDateToIso(ultimaPaga.dueDate) : null;
  const pagoFim = ultimaPaga ? brDateToIso(addMonths(ultimaPaga.dueDate, 1)) : null;

  const encerrada = !subscription || subscription.deleted === true || subscription.status !== "ACTIVE";

  if (encerrada) {
    // Cancelou com mês pago: mantém o acesso até o fim do que já pagou.
    if (pagoFim && Date.parse(pagoFim) > now.getTime()) {
      return { status: "active", currentPeriodStart: pagoInicio, currentPeriodEnd: pagoFim, cancelAtPeriodEnd: true };
    }
    // Cancelou durante o teste: mantém até o fim do teste.
    if (!ultimaPaga && opts.trialEnd && Date.parse(opts.trialEnd) > now.getTime()) {
      return { status: "trialing", currentPeriodStart: null, currentPeriodEnd: opts.trialEnd, cancelAtPeriodEnd: true };
    }
    return { status: "canceled", currentPeriodStart: pagoInicio, currentPeriodEnd: pagoFim, cancelAtPeriodEnd: false };
  }

  // Fatura vencida e não paga: a tolerância conta a partir do vencimento mais antigo.
  const vencidas = vivas.filter((p) => p.status === "OVERDUE").sort(byDueDate);
  if (vencidas.length > 0) {
    return {
      status: "past_due",
      currentPeriodStart: pagoInicio,
      currentPeriodEnd: brDateToIso(vencidas[0].dueDate),
      cancelAtPeriodEnd: false,
    };
  }

  if (ultimaPaga) {
    return { status: "active", currentPeriodStart: pagoInicio, currentPeriodEnd: pagoFim, cancelAtPeriodEnd: false };
  }

  // Nada pago ainda: em teste (se começou com teste) ou aguardando o 1º pagamento.
  if (opts.trialEnd) {
    return { status: "trialing", currentPeriodStart: null, currentPeriodEnd: opts.trialEnd, cancelAtPeriodEnd: false };
  }
  return { status: "incomplete", currentPeriodStart: null, currentPeriodEnd: null, cancelAtPeriodEnd: false };
};
