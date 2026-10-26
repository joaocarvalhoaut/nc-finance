/**
 * asaas-billing — "Gerenciar assinatura" (substitui o portal da Stripe).
 *
 * POST { action }:
 *   sync         relê a assinatura no Asaas e atualiza o banco (botão
 *                "Atualizar assinatura"; cobre webhook atrasado ou perdido)
 *   pay          devolve o link da fatura em aberto mais antiga
 *   change_plan  { planId } muda o valor da assinatura; vale na hora e na
 *                fatura em aberto
 *   cancel       encerra a recorrência; o acesso segue até o fim do período pago
 *
 * Sempre opera na assinatura da conta autenticada — nenhum id vem do cliente.
 */

import { createClient } from "npm:@supabase/supabase-js@2.49.8";
import { corsHeaders } from "../_shared/cors.ts";
import { checkRateLimit, tooManyRequests } from "../_shared/rateLimit.ts";
import {
  AsaasError,
  deleteSubscription,
  listSubscriptionPayments,
  openInvoice,
  syncAsaasSubscription,
  updateSubscription,
} from "../_shared/asaas.ts";
import { isPlanId, PLAN_PRICE_BRL } from "../_shared/billingPlans.ts";
import { canUseSubscription } from "../_shared/billingStatus.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

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

    const rl = await checkRateLimit(admin, `billing:${user.id}`, 20, 60);
    if (!rl.allowed) return tooManyRequests(rl.retryAfter, corsHeaders);

    const body = (await request.json().catch(() => ({}))) as { action?: unknown; planId?: unknown };

    const { data: row, error: rowError } = await admin
      .from("user_subscriptions")
      .select("plan, status, cancel_at_period_end, current_period_end, asaas_subscription_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (rowError) throw rowError;

    const subscriptionId: string | null = row?.asaas_subscription_id ?? null;
    if (!subscriptionId) {
      // "Atualizar" sem assinatura no Asaas não é erro: só não há o que sincronizar.
      if (body.action === "sync") return json(200, { synced: false });
      return json(404, {
        error: "Nenhuma assinatura encontrada. Escolha um plano para assinar.",
        code: "sem_assinatura",
      });
    }

    switch (body.action) {
      case "sync": {
        await syncAsaasSubscription(admin, user.id, subscriptionId);
        return json(200, { synced: true });
      }

      case "pay": {
        const fatura = openInvoice(await listSubscriptionPayments(subscriptionId));
        if (!fatura) return json(404, { error: "Nenhuma fatura em aberto.", code: "sem_fatura" });
        return json(200, { invoice_url: fatura.invoiceUrl, due_date: fatura.dueDate, value: fatura.value });
      }

      case "change_plan": {
        const planId = body.planId;
        if (!isPlanId(planId)) return json(400, { error: "Plano invalido." });
        if (!canUseSubscription(row) || row?.cancel_at_period_end) {
          return json(409, { error: "Só é possível trocar de plano com a assinatura ativa.", code: "assinatura_inativa" });
        }
        if (row?.plan === planId) return json(200, { plan: planId });

        // updatePendingPayments: a fatura já gerada e ainda não paga passa a
        // ter o valor novo. As próximas já nascem com ele.
        await updateSubscription(subscriptionId, { value: PLAN_PRICE_BRL[planId], updatePendingPayments: true });
        const result = await syncAsaasSubscription(admin, user.id, subscriptionId);
        console.log(JSON.stringify({ source: "asaas-billing.change_plan", user_id: user.id, from: row?.plan, to: planId }));
        return json(200, { plan: result?.row?.plan ?? planId });
      }

      case "cancel": {
        await deleteSubscription(subscriptionId);
        const result = await syncAsaasSubscription(admin, user.id, subscriptionId);
        console.log(JSON.stringify({ source: "asaas-billing.cancel", user_id: user.id }));
        return json(200, {
          status: result?.row?.status ?? "canceled",
          current_period_end: result?.row?.current_period_end ?? null,
        });
      }

      default:
        return json(400, { error: "Acao invalida." });
    }
  } catch (error) {
    if (error instanceof AsaasError) {
      return json(error.status, { error: error.message, code: error.code });
    }
    console.log(JSON.stringify({
      source: "asaas-billing.error",
      message: error instanceof Error ? error.message : String((error as { message?: unknown })?.message ?? error),
    }));
    return json(500, { error: "Falha ao processar a assinatura. Tente novamente." });
  }
});
