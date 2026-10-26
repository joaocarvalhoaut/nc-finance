/**
 * zapiProvisioning.ts — ciclo de vida da instância Z-API de cada conta.
 *
 *   1. Cliente clica em "Conectar WhatsApp" sem instância → provisionInstanceForUser
 *      cria uma pela API de parceiro e grava em user_zapi_config
 *      (auto_provisioned = true). A Z-API dá 2 dias de teste.
 *   2. O celular escaneia o QR → ensureSubscribed assina a instância (a partir
 *      daqui a Z-API cobra). Quem cria e nunca conecta não gera custo.
 *   3. A assinatura do NC Finance deixa de valer (cancelou, não pagou, prazo da
 *      Stripe) → reconcileAutoInstances, que roda todo dia junto com o
 *      agendador, cancela a instância. Exclusão de conta cancela na hora.
 *
 * Instâncias cadastradas à mão pelo suporte (auto_provisioned = false) nunca
 * são criadas, assinadas nem canceladas por aqui.
 */

import { createClient } from "npm:@supabase/supabase-js@2.49.8";
import { ACCESS_COLUMNS, canUseSubscription } from "./billingStatus.ts";
import { cancelInstance, createInstance, subscribeInstance, zapiPartnerConfigured } from "./zapiPartner.ts";

// deno-lint-ignore no-explicit-any
type AdminClient = ReturnType<typeof createClient<any, any, any>>;

/** A Z-API apaga instância não assinada em 2 dias; recriamos antes disso vencer. */
const TESTE_ZAPI_MS = 40 * 60 * 60 * 1000;

export interface AutoInstanceRow {
  user_id: string;
  instance_id: string | null;
  token: string | null;
  is_active: boolean;
  connected: boolean;
  auto_provisioned: boolean;
  provisioned_at: string | null;
  subscribed_at: string | null;
  canceled_at: string | null;
}

const AUTO_COLUMNS =
  "user_id, instance_id, token, is_active, connected, auto_provisioned, provisioned_at, subscribed_at, canceled_at";

export const loadAutoInstance = async (admin: AdminClient, userId: string): Promise<AutoInstanceRow | null> => {
  const { data, error } = await admin.from("user_zapi_config").select(AUTO_COLUMNS).eq("user_id", userId).maybeSingle();
  if (!error) return (data as AutoInstanceRow | null) ?? null;

  // Colunas da migration 20261026150000 ainda não existem: trata toda instância
  // como cadastrada à mão. Sem isso, um erro de leitura viraria "conta sem
  // instância" e criaria instâncias (com custo) por cima das que já funcionam.
  const { data: legado } = await admin
    .from("user_zapi_config")
    .select("user_id, instance_id, token, is_active, connected")
    .eq("user_id", userId)
    .maybeSingle();
  if (!legado) return null;
  return { ...(legado as Pick<AutoInstanceRow, "user_id" | "instance_id" | "token" | "is_active" | "connected">),
    auto_provisioned: false, provisioned_at: null, subscribed_at: null, canceled_at: null };
};

/**
 * A conta precisa de uma instância nova? Sim quando não tem nenhuma ativa, ou
 * quando a automática foi cancelada ou expirou o teste da Z-API sem conectar.
 */
export const needsNewInstance = (row: AutoInstanceRow | null, now = Date.now()): boolean => {
  if (!row || !row.is_active || !row.instance_id || !row.token) return true;
  if (!row.auto_provisioned) return false; // instância do suporte: não mexe
  if (row.canceled_at) return true;
  if (!row.subscribed_at && row.provisioned_at && now - Date.parse(row.provisioned_at) > TESTE_ZAPI_MS) return true;
  return false;
};

/** URLs de webhook com que cada instância nova já nasce configurada. */
const callbacksFor = (): Record<string, string> => {
  const base = `${Deno.env.get("SUPABASE_URL") || ""}/functions/v1`;
  const callbacks: Record<string, string> = {
    // Entregue / lido / falhou → histórico de cobranças.
    messageStatusCallbackUrl: `${base}/sync-whatsapp-status`,
  };
  // Mensagens recebidas ("PARE", "SAIR") → lista de não-contatar. Só com o
  // secret configurado; sem ele a função recusa o processamento.
  const inboundSecret = Deno.env.get("WHATSAPP_INBOUND_SECRET") || "";
  if (inboundSecret) {
    callbacks.receivedCallbackUrl = `${base}/whatsapp-inbound?secret=${encodeURIComponent(inboundSecret)}`;
  }
  return callbacks;
};

/** Cria uma instância para a conta e grava as credenciais (substitui a anterior). */
export const provisionInstanceForUser = async (admin: AdminClient, userId: string): Promise<void> => {
  if (!zapiPartnerConfigured()) throw new Error("Provisionamento automatico da Z-API nao configurado.");

  // Nome visível só no painel da Z-API: identifica a conta sem dado pessoal.
  const created = await createInstance({ name: `NC Finance ${userId.slice(0, 8)}`, callbacks: callbacksFor() });
  if (!created?.id || !created?.token) throw new Error("Z-API nao devolveu id/token da instancia.");

  const { error } = await admin.from("user_zapi_config").upsert(
    {
      user_id: userId,
      instance_id: created.id,
      token: created.token,
      client_token: Deno.env.get("ZAPI_CLIENT_TOKEN") || "",
      label: "Automática",
      is_active: true,
      status: "inactive",
      connected: false,
      connected_pending_phone: true,
      phone_number: null,
      last_error: null,
      auto_provisioned: true,
      provisioned_at: new Date().toISOString(),
      subscribed_at: null,
      canceled_at: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) throw error;

  console.log(JSON.stringify({ source: "zapi-provision.created", user_id: userId }));
};

/** Assina a instância automática na primeira vez que o número conecta. Nunca lança. */
export const ensureSubscribed = async (admin: AdminClient, userId: string): Promise<void> => {
  try {
    const row = await loadAutoInstance(admin, userId);
    if (!row?.auto_provisioned || row.subscribed_at || row.canceled_at || !row.instance_id || !row.token) return;
    await subscribeInstance(row.instance_id, row.token);
    await admin.from("user_zapi_config")
      .update({ subscribed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("instance_id", row.instance_id);
    console.log(JSON.stringify({ source: "zapi-provision.subscribed", user_id: userId }));
  } catch (err) {
    // A verificação diária tenta de novo; o envio não depende disto.
    console.log(JSON.stringify({
      source: "zapi-provision.subscribe_error", user_id: userId,
      message: err instanceof Error ? err.message : String(err),
    }));
  }
};

/**
 * Cancela a instância automática da conta (assinatura do NC Finance acabou ou
 * conta excluída) e desliga o envio por ela. Nunca lança.
 */
export const cancelAutoInstance = async (admin: AdminClient, userId: string, motivo: string): Promise<void> => {
  try {
    const row = await loadAutoInstance(admin, userId);
    if (!row?.auto_provisioned || row.canceled_at || !row.instance_id || !row.token) return;
    // Nunca assinada: não há o que cancelar — a Z-API apaga sozinha em 2 dias.
    if (row.subscribed_at) await cancelInstance(row.instance_id, row.token);
    await admin.from("user_zapi_config")
      .update({
        canceled_at: new Date().toISOString(), is_active: false, connected: false,
        status: "inactive", updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .eq("instance_id", row.instance_id);
    console.log(JSON.stringify({ source: "zapi-provision.canceled", user_id: userId, motivo }));
  } catch (err) {
    console.log(JSON.stringify({
      source: "zapi-provision.cancel_error", user_id: userId, motivo,
      message: err instanceof Error ? err.message : String(err),
    }));
  }
};

/**
 * Verificação diária (chamada pelo run-automation-scheduler):
 *   - assinatura do NC Finance não vale mais → cancela a instância;
 *   - conectou mas a assinatura da instância falhou antes → tenta de novo;
 *   - criada e nunca conectada, teste da Z-API vencido → desativa (a próxima
 *     "Conectar WhatsApp" cria outra).
 */
export const reconcileAutoInstances = async (admin: AdminClient): Promise<{ canceled: number; subscribed: number; expired: number }> => {
  const result = { canceled: 0, subscribed: 0, expired: 0 };
  if (!zapiPartnerConfigured()) return result;

  const { data: rows, error } = await admin
    .from("user_zapi_config")
    .select(AUTO_COLUMNS)
    .eq("auto_provisioned", true)
    .eq("is_active", true)
    .is("canceled_at", null);
  if (error) throw error;

  for (const row of (rows ?? []) as AutoInstanceRow[]) {
    const { data: sub } = await admin.from("user_subscriptions").select(ACCESS_COLUMNS).eq("user_id", row.user_id).maybeSingle();

    if (!canUseSubscription(sub)) {
      await cancelAutoInstance(admin, row.user_id, "assinatura_inativa");
      result.canceled++;
    } else if (!row.subscribed_at && row.connected) {
      await ensureSubscribed(admin, row.user_id);
      result.subscribed++;
    } else if (!row.subscribed_at && row.provisioned_at && Date.now() - Date.parse(row.provisioned_at) > TESTE_ZAPI_MS) {
      await admin.from("user_zapi_config")
        .update({ is_active: false, status: "inactive", updated_at: new Date().toISOString() })
        .eq("user_id", row.user_id)
        .eq("instance_id", row.instance_id);
      result.expired++;
    }
  }

  console.log(JSON.stringify({ source: "zapi-provision.reconcile", ...result }));
  return result;
};
