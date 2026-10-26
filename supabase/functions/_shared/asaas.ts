/**
 * asaas.ts — cliente da API do Asaas (cobrança da assinatura do NC Finance).
 * Deno / Supabase Edge Functions apenas.
 *
 * Regras de segurança:
 * - ASAAS_API_KEY só existe aqui (secret do Supabase). Nunca vai ao browser.
 * - Nada de CPF/CNPJ, e-mail ou chave nos logs.
 *
 * Secrets:
 *   ASAAS_API_KEY        chave da conta ($aact_hmlg_… no sandbox, $aact_prod_… em produção)
 *   ASAAS_ENV            opcional: "sandbox" | "production". Sem ele, o ambiente
 *                        sai do prefixo da chave — evita o 401 de chave de um
 *                        ambiente usada no outro.
 *   ASAAS_WEBHOOK_TOKEN  token que o Asaas manda no header asaas-access-token
 */

import { createClient } from "npm:@supabase/supabase-js@2.49.8";
import {
  computeSubscriptionState,
  type AsaasPaymentLite,
} from "./billingStatus.ts";
import { isPlanId, planFromValue, type PlanId } from "./billingPlans.ts";

// deno-lint-ignore no-explicit-any
type AdminClient = ReturnType<typeof createClient<any, any, any>>;

const BASE_URL = {
  sandbox: "https://api-sandbox.asaas.com/v3",
  production: "https://api.asaas.com/v3",
} as const;

const TIMEOUT_MS = 15_000;

/** Erro da API com mensagem já segura para mostrar ao usuário. */
export class AsaasError extends Error {
  constructor(public status: number, message: string, public code: string | null = null) {
    super(message);
    this.name = "AsaasError";
  }
}

export const asaasConfigured = () => Boolean(Deno.env.get("ASAAS_API_KEY"));

const ambiente = (key: string): keyof typeof BASE_URL => {
  const env = (Deno.env.get("ASAAS_ENV") || "").trim().toLowerCase();
  if (env === "production" || env === "sandbox") return env;
  return key.includes("_prod_") ? "production" : "sandbox";
};

const asaasRequest = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
  const key = Deno.env.get("ASAAS_API_KEY") || "";
  if (!key) {
    throw new AsaasError(503, "Pagamentos ainda não configurados. Fale com o suporte.", "nao_configurado");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${BASE_URL[ambiente(key)]}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        "access_token": key,
        // Obrigatório para contas criadas a partir de 13/06/2024.
        "User-Agent": "nc-finance",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    const timeout = err instanceof Error && err.name === "AbortError";
    throw new AsaasError(502, timeout ? "O Asaas demorou para responder. Tente de novo." : "Falha ao contatar o Asaas.");
  } finally {
    clearTimeout(timer);
  }

  const text = await response.text();
  let json: Record<string, unknown> | null = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* corpo não-JSON */ }

  if (!response.ok) {
    // O Asaas devolve { errors: [{ code, description }] } com descrição em
    // português, pensada para o usuário final ("CPF/CNPJ informado é inválido").
    const first = (json?.errors as Array<{ code?: string; description?: string }> | undefined)?.[0];
    console.log(JSON.stringify({
      source: "asaas.request.error", method, path: path.split("?")[0].replace(/\/(sub|cus|pay)_\w+/g, "/$1_*"),
      http: response.status, code: first?.code ?? null,
    }));
    if (response.status === 401) {
      throw new AsaasError(503, "Pagamentos indisponíveis no momento. Fale com o suporte.", "chave_invalida");
    }
    throw new AsaasError(
      response.status >= 500 ? 502 : 400,
      first?.description || "O Asaas recusou a operação.",
      first?.code ?? null,
    );
  }

  return json as T;
};

// ─── Tipos (só os campos que usamos; o Asaas manda vários outros) ───────────

export interface AsaasSubscription {
  id: string;
  customer: string;
  value: number;
  status: string;          // ACTIVE | INACTIVE | EXPIRED
  deleted?: boolean;
  nextDueDate?: string;
  externalReference?: string | null;
}

export interface AsaasPayment extends AsaasPaymentLite {
  id: string;
  invoiceUrl?: string | null;
  value: number;
}

interface AsaasList<T> {
  data: T[];
  hasMore?: boolean;
}

// ─── Clientes ───────────────────────────────────────────────────────────────

/**
 * Cliente Asaas da conta. Reaproveita o id gravado; senão procura pelo
 * externalReference (= user_id) antes de criar — a API aceita clientes
 * duplicados, e uma tentativa repetida depois de um timeout criaria outro.
 */
export const findOrCreateCustomer = async (params: {
  existingId: string | null;
  userId: string;
  name: string;
  email: string | null;
  cpfCnpj: () => string | null;
}): Promise<string> => {
  if (params.existingId) return params.existingId;

  const found = await asaasRequest<AsaasList<{ id: string }>>(
    "GET", `/customers?externalReference=${encodeURIComponent(params.userId)}`,
  );
  if (found?.data?.[0]?.id) return found.data[0].id;

  const cpfCnpj = params.cpfCnpj();
  if (!cpfCnpj) {
    throw new AsaasError(400, "Informe seu CPF ou CNPJ para emitir a cobrança.", "documento_necessario");
  }

  const created = await asaasRequest<{ id: string }>("POST", "/customers", {
    name: params.name,
    cpfCnpj,
    email: params.email || undefined,
    externalReference: params.userId,
  });
  return created.id;
};

// ─── Assinaturas ────────────────────────────────────────────────────────────

export const createSubscription = (params: {
  customer: string;
  value: number;
  nextDueDate: string;
  description: string;
  userId: string;
}) =>
  asaasRequest<AsaasSubscription>("POST", "/subscriptions", {
    customer: params.customer,
    // UNDEFINED: o cliente escolhe Pix, boleto ou cartão na página da fatura.
    billingType: "UNDEFINED",
    value: params.value,
    nextDueDate: params.nextDueDate,
    cycle: "MONTHLY",
    description: params.description,
    externalReference: params.userId,
  });

/** null quando a assinatura não existe mais no Asaas. */
export const getSubscription = async (id: string): Promise<AsaasSubscription | null> => {
  try {
    return await asaasRequest<AsaasSubscription>("GET", `/subscriptions/${encodeURIComponent(id)}`);
  } catch (err) {
    if (err instanceof AsaasError && err.status === 400 && /not_found|invalid_object/i.test(err.code || "")) return null;
    if (err instanceof AsaasError && err.status === 404) return null;
    throw err;
  }
};

export const listSubscriptionPayments = async (id: string): Promise<AsaasPayment[]> => {
  const out: AsaasPayment[] = [];
  for (let offset = 0; offset < 1000; offset += 100) {
    const page = await asaasRequest<AsaasList<AsaasPayment>>(
      "GET", `/subscriptions/${encodeURIComponent(id)}/payments?limit=100&offset=${offset}`,
    );
    out.push(...(page?.data ?? []));
    if (!page?.hasMore) break;
  }
  return out;
};

export const updateSubscription = (id: string, body: Record<string, unknown>) =>
  asaasRequest<AsaasSubscription>("PUT", `/subscriptions/${encodeURIComponent(id)}`, body);

/** Encerra a recorrência. O Asaas apaga as cobranças pendentes; as pagas ficam. */
export const deleteSubscription = async (id: string): Promise<void> => {
  try {
    await asaasRequest("DELETE", `/subscriptions/${encodeURIComponent(id)}`);
  } catch (err) {
    // Já removida: o objetivo foi atingido.
    if (err instanceof AsaasError && (err.status === 404 || /not_found/i.test(err.code || ""))) return;
    throw err;
  }
};

/** Remove uma cobrança. Já removida conta como sucesso. */
const deletePayment = async (id: string): Promise<void> => {
  try {
    await asaasRequest("DELETE", `/payments/${encodeURIComponent(id)}`);
  } catch (err) {
    if (err instanceof AsaasError && (err.status === 404 || /not_found/i.test(err.code || ""))) return;
    throw err;
  }
};

/**
 * Cancelamento pelo cliente. Desativa (INACTIVE) em vez de remover: a
 * assinatura e o histórico do que foi pago continuam lá, e "Reativar" religa a
 * mesma assinatura. As cobranças em aberto são removidas para o Asaas não
 * cobrar nem mandar lembrete de uma assinatura cancelada.
 */
export const inactivateSubscription = async (id: string): Promise<void> => {
  await updateSubscription(id, { status: "INACTIVE" });
  const abertas = (await listSubscriptionPayments(id))
    .filter((p) => !p.deleted && (p.status === "PENDING" || p.status === "OVERDUE"));
  for (const p of abertas) await deletePayment(p.id);
};

/** Fatura em aberto mais antiga (vencida ou pendente), com o link de pagamento. */
export const openInvoice = (payments: AsaasPayment[]): AsaasPayment | null =>
  payments
    .filter((p) => !p.deleted && (p.status === "OVERDUE" || p.status === "PENDING") && p.invoiceUrl)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0] ?? null;

// ─── Sincronização com o banco ──────────────────────────────────────────────

/**
 * Recalcula a linha de user_subscriptions a partir do estado ATUAL no Asaas.
 *
 * Usado pelo webhook, pelo botão "Atualizar assinatura" e depois de cada ação
 * (checkout, troca de plano, cancelamento). Como relê tudo da API, é
 * idempotente e não depende da ordem dos webhooks.
 *
 * Só grava se a linha ainda aponta para ESTA assinatura: o webhook atrasado de
 * uma assinatura antiga (substituída num novo checkout) não pode sobrescrever
 * o estado da nova.
 */
export const syncAsaasSubscription = async (
  admin: AdminClient,
  userId: string,
  subscriptionId: string,
) => {
  const { data: row, error: rowError } = await admin
    .from("user_subscriptions")
    .select("plan, trial_end, asaas_subscription_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (rowError) throw rowError;
  if (!row || row.asaas_subscription_id !== subscriptionId) return null;

  const subscription = await getSubscription(subscriptionId);
  const payments = subscription ? await listSubscriptionPayments(subscriptionId) : [];
  const state = computeSubscriptionState(subscription, payments, { trialEnd: row.trial_end ?? null });

  // Plano sai do valor cobrado (fonte de verdade). Valor fora da tabela mantém
  // o plano atual em vez de rebaixar.
  const plan: PlanId = planFromValue(subscription?.value) ?? (isPlanId(row.plan) ? row.plan : "basic");

  const { data: saved, error } = await admin
    .from("user_subscriptions")
    .update({
      plan,
      status: state.status,
      cancel_at_period_end: state.cancelAtPeriodEnd,
      current_period_start: state.currentPeriodStart,
      current_period_end: state.currentPeriodEnd,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("asaas_subscription_id", subscriptionId)
    .select("plan, status, cancel_at_period_end, current_period_end")
    .maybeSingle();
  if (error) throw error;

  console.log(JSON.stringify({
    source: "asaas.sync", user_id: userId, plan, status: state.status,
    cancel_at_period_end: state.cancelAtPeriodEnd, payments: payments.length,
  }));

  return { row: saved, payments };
};
