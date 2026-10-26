/**
 * asaas-checkout — inicia a assinatura do NC Finance no Asaas.
 *
 * Fluxo:
 *  1. Autentica o usuário (JWT) e aplica rate limit.
 *  2. Recusa se já existe assinatura em uso (evita duas recorrências cobrando).
 *  3. Encerra no Asaas a assinatura anterior não paga, se houver.
 *  4. Cria/recupera o cliente no Asaas (nome + CPF do cadastro, ou o CPF/CNPJ
 *     enviado agora, se o cadastro não tiver).
 *  5. Cria a assinatura mensal (Pix, boleto ou cartão — o cliente escolhe).
 *     Primeira assinatura: 1ª fatura vence em 7 dias, com acesso liberado já
 *     (teste grátis, sem cartão). Depois disso: vence hoje e o acesso libera
 *     quando o pagamento cair.
 *  6. Grava a linha em user_subscriptions e devolve o link da fatura quando
 *     há pagamento a fazer agora.
 *
 * O CPF/CNPJ vai direto ao Asaas e não é gravado nem logado aqui.
 */

import { createClient } from "npm:@supabase/supabase-js@2.49.8";
import { corsHeaders } from "../_shared/cors.ts";
import { checkRateLimit, tooManyRequests } from "../_shared/rateLimit.ts";
import {
  AsaasError,
  asaasConfigured,
  createSubscription,
  deleteSubscription,
  findOrCreateCustomer,
  listSubscriptionPayments,
  openInvoice,
} from "../_shared/asaas.ts";
import { isPlanId, PLAN_PRICE_BRL } from "../_shared/billingPlans.ts";
import { addDays, brDateToIso, canUseSubscription, todayBr } from "../_shared/billingStatus.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const TRIAL_DAYS = 7;
const PLAN_NAME = { basic: "Básico", pro: "Pro", premium: "Premium" } as const;

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader) return json(401, { error: "Nao autenticado." });

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return json(401, { error: "Sessao invalida." });

    // Rate limit: 10/min por usuário.
    const rl = await checkRateLimit(admin, `checkout:${user.id}`, 10, 60);
    if (!rl.allowed) return tooManyRequests(rl.retryAfter, corsHeaders);

    const body = (await request.json().catch(() => ({}))) as { planId?: unknown; cpfCnpj?: unknown };
    const planId = body.planId;
    if (!isPlanId(planId)) return json(400, { error: "Plano invalido." });

    if (!asaasConfigured()) {
      return json(503, { error: "Pagamentos ainda não configurados. Fale com o suporte.", code: "nao_configurado" });
    }

    const { data: row, error: rowError } = await admin
      .from("user_subscriptions")
      .select("status, cancel_at_period_end, current_period_end, billing_provider, asaas_customer_id, asaas_subscription_id, trial_start")
      .eq("user_id", user.id)
      .maybeSingle();
    if (rowError) throw rowError;

    // ── 2. Já assinante: troca de plano é pelo "Gerenciar assinatura" ───────
    if (row?.asaas_subscription_id && canUseSubscription(row)) {
      return json(409, {
        error: row.cancel_at_period_end
          ? "Sua assinatura foi cancelada e continua valendo até o fim do período pago. Depois disso, é só assinar de novo."
          : "Você já tem uma assinatura ativa. Para trocar de plano, use \"Gerenciar assinatura\".",
        code: "ja_assinante",
      });
    }

    // ── 3. Assinatura anterior não paga: encerra para não ficarem duas ──────
    if (row?.asaas_subscription_id) {
      await deleteSubscription(row.asaas_subscription_id);
    }

    // ── 4. Cliente ──────────────────────────────────────────────────────────
    const { data: profile } = await admin
      .from("user_profiles")
      .select("full_name, cpf")
      .eq("user_id", user.id)
      .maybeSingle();

    const customerId = await findOrCreateCustomer({
      existingId: row?.asaas_customer_id ?? null,
      userId: user.id,
      name: profile?.full_name || String(user.user_metadata?.full_name || "") || user.email || "Cliente NC Finance",
      email: user.email ?? null,
      cpfCnpj: () => {
        const enviado = typeof body.cpfCnpj === "string" ? body.cpfCnpj.replace(/\D/g, "") : "";
        if (enviado.length === 11 || enviado.length === 14) return enviado;
        const cadastro = String(profile?.cpf || "").replace(/\D/g, "");
        return cadastro.length === 11 ? cadastro : null;
      },
    });

    // ── 5. Assinatura ───────────────────────────────────────────────────────
    // Teste grátis só na primeira assinatura pelo Asaas. Contas que vieram da
    // Stripe (modo de teste, nunca pagaram) também ganham o teste.
    const comTeste = !(row?.billing_provider === "asaas" && row?.trial_start);
    const hoje = todayBr();
    const primeiroVencimento = comTeste ? addDays(hoje, TRIAL_DAYS) : hoje;

    const subscription = await createSubscription({
      customer: customerId,
      value: PLAN_PRICE_BRL[planId],
      nextDueDate: primeiroVencimento,
      description: `NC Finance — plano ${PLAN_NAME[planId]}`,
      userId: user.id,
    });

    // ── 6. Grava ────────────────────────────────────────────────────────────
    const trialEnd = comTeste ? brDateToIso(primeiroVencimento) : null;
    const { error: upsertError } = await admin.from("user_subscriptions").upsert(
      {
        user_id: user.id,
        billing_provider: "asaas",
        asaas_customer_id: customerId,
        asaas_subscription_id: subscription.id,
        plan: planId,
        status: comTeste ? "trialing" : "incomplete",
        cancel_at_period_end: false,
        current_period_start: null,
        current_period_end: trialEnd,
        trial_start: comTeste ? new Date().toISOString() : row?.trial_start ?? null,
        trial_end: trialEnd,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

    if (upsertError) {
      // Sem a linha no banco o usuário não teria acesso, mas o Asaas cobraria:
      // desfaz a assinatura recém-criada.
      await deleteSubscription(subscription.id).catch(() => {});
      throw upsertError;
    }

    console.log(JSON.stringify({ source: "asaas-checkout.created", user_id: user.id, plan: planId, trial: comTeste }));

    if (comTeste) {
      return json(200, { status: "trialing", trial_end: trialEnd });
    }

    const fatura = openInvoice(await listSubscriptionPayments(subscription.id));
    return json(200, { status: "incomplete", invoice_url: fatura?.invoiceUrl ?? null });
  } catch (error) {
    if (error instanceof AsaasError) {
      return json(error.status, { error: error.message, code: error.code });
    }
    console.log(JSON.stringify({
      source: "asaas-checkout.error",
      message: error instanceof Error ? error.message : String((error as { message?: unknown })?.message ?? error),
    }));
    return json(500, { error: "Falha ao iniciar a assinatura. Tente novamente." });
  }
});
