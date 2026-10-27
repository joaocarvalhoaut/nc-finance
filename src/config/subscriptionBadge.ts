import type { UserSubscription } from "../types";

/**
 * Selo de status da assinatura (texto + cores). Fonte única para a página
 * Minha Conta e a janela Gerenciar assinatura — antes cada tela tinha a sua
 * tabela e a conta cortesia aparecia como "Ativa" numa e "Cortesia" na outra.
 */
export interface SubscriptionBadge {
  txt: string;
  cls: string;
}

const SELO = {
  active:     { txt: "Ativa",                cls: "text-emerald-300 border-emerald-500/30 bg-emerald-500/10" },
  trialing:   { txt: "Teste grátis",         cls: "text-sky-300 border-sky-500/30 bg-sky-500/10" },
  past_due:   { txt: "Pagamento pendente",   cls: "text-amber-300 border-amber-500/30 bg-amber-500/10" },
  incomplete: { txt: "Aguardando pagamento", cls: "text-amber-300 border-amber-500/30 bg-amber-500/10" },
  canceled:   { txt: "Cancelada",            cls: "text-rose-300 border-rose-500/30 bg-rose-500/10" },
  cortesia:   { txt: "Cortesia",             cls: "text-emerald-300 border-emerald-500/30 bg-emerald-500/10" },
  sem_asaas:  { txt: "Não ativada",          cls: "text-zinc-300 border-zinc-600 bg-zinc-800" },
} satisfies Record<string, SubscriptionBadge>;

export const subscriptionBadge = (subscription: UserSubscription | null | undefined): SubscriptionBadge => {
  if (!subscription) return SELO.sem_asaas;
  if (subscription.billingProvider === "cortesia") return SELO.cortesia;
  if (!subscription.asaasSubscriptionId) return SELO.sem_asaas;
  if (subscription.cancelAtPeriodEnd || subscription.status === "canceled") return SELO.canceled;
  return (SELO as Record<string, SubscriptionBadge>)[subscription.status] ?? { txt: subscription.status, cls: SELO.sem_asaas.cls };
};
