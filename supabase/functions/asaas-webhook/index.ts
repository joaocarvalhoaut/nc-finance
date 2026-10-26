/**
 * asaas-webhook — eventos de cobrança e de assinatura do Asaas.
 *
 * Autenticação: o Asaas manda no header `asaas-access-token` o token
 * cadastrado no webhook (secret ASAAS_WEBHOOK_TOKEN). Sem JWT do Supabase
 * (verify_jwt = false no config.toml).
 *
 * O evento só serve de gatilho: o estado é relido da API do Asaas
 * (syncAsaasSubscription). Assim a ordem de chegada não importa e reenvios
 * não causam efeito duplo.
 *
 * Respostas: 200 para tudo que foi tratado ou não nos interessa (cobranças
 * avulsas, eventos de outras assinaturas). Erro só em falha transitória, para
 * o Asaas reenviar. Atenção: muitas falhas seguidas PAUSAM a fila de webhooks
 * no Asaas — se isso acontecer, reative em Integrações > Webhooks no painel.
 */

import { createClient } from "npm:@supabase/supabase-js@2.49.8";
import { syncAsaasSubscription } from "../_shared/asaas.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const webhookToken = Deno.env.get("ASAAS_WEBHOOK_TOKEN") || "";

const admin = createClient(supabaseUrl, serviceRoleKey);

const reply = (status: number, body: Record<string, unknown> = { received: true }) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** Comparação em tempo constante — não vaza o token por tempo de resposta. */
const sameToken = (a: string, b: string) => {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  let diff = ea.length ^ eb.length;
  for (let i = 0; i < Math.max(ea.length, eb.length); i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return diff === 0;
};

interface AsaasEvent {
  id?: string;
  event?: string;
  payment?: { subscription?: string | null; externalReference?: string | null } | null;
  subscription?: { id?: string; externalReference?: string | null } | null;
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return reply(405, { error: "Metodo nao permitido." });

  if (!webhookToken) {
    console.log(JSON.stringify({ source: "asaas-webhook.error", message: "ASAAS_WEBHOOK_TOKEN nao configurado." }));
    return reply(500, { error: "Webhook nao configurado." });
  }
  if (!sameToken(request.headers.get("asaas-access-token") || "", webhookToken)) {
    return reply(401, { error: "Token invalido." });
  }

  let event: AsaasEvent;
  try {
    event = await request.json();
  } catch {
    return reply(400, { error: "Corpo invalido." });
  }

  const eventId = typeof event.id === "string" ? event.id : null;
  const eventType = String(event.event || "desconhecido");
  const subscriptionId = event.subscription?.id || event.payment?.subscription || null;

  try {
    // Reenvio de evento já processado (o id é estável entre reenvios).
    if (eventId) {
      const { data: seen } = await admin
        .from("asaas_webhook_events")
        .select("event_id")
        .eq("event_id", eventId)
        .maybeSingle();
      if (seen) return reply(200, { received: true, duplicate: true });
    }

    // Cobrança avulsa, sem assinatura: não é do NC Finance.
    if (!subscriptionId) {
      console.log(JSON.stringify({ source: "asaas-webhook.ignored", event_type: eventType, reason: "sem_assinatura" }));
      return reply(200);
    }

    const { data: row } = await admin
      .from("user_subscriptions")
      .select("user_id")
      .eq("asaas_subscription_id", subscriptionId)
      .maybeSingle();

    if (!row?.user_id) {
      // Assinatura antiga (já substituída) ou criada à mão no painel.
      console.log(JSON.stringify({ source: "asaas-webhook.ignored", event_type: eventType, reason: "assinatura_desconhecida" }));
      return reply(200);
    }

    await syncAsaasSubscription(admin, row.user_id, subscriptionId);

    // Marca como processado só DEPOIS de sincronizar: se falhar antes, o
    // reenvio do Asaas processa de novo.
    if (eventId) {
      await admin
        .from("asaas_webhook_events")
        .upsert({ event_id: eventId, event_type: eventType }, { onConflict: "event_id" });
    }

    console.log(JSON.stringify({ source: "asaas-webhook.processed", event_type: eventType, user_id: row.user_id }));
    return reply(200);
  } catch (error) {
    console.log(JSON.stringify({
      source: "asaas-webhook.error",
      event_type: eventType,
      message: error instanceof Error ? error.message : String((error as { message?: unknown })?.message ?? error),
    }));
    return reply(500, { error: "Falha ao processar." });
  }
});
