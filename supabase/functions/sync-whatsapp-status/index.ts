/**
 * sync-whatsapp-status — receptor de webhooks Z-API para atualização de status.
 *
 * A Z-API envia callbacks quando mensagens mudam de estado:
 *   SEND → RECEIVED → DELIVERED → READ
 *   ou SEND → FAILED
 *
 * Fluxo:
 *   1. Valida Client-Token do header contra platform_integrations (sem company_integrations)
 *   2. Extrai messageId e status do payload
 *   3. Atualiza user_logs_cobranca.status onde provider_message_id = messageId
 *   4. Nunca loga telefone, mensagem ou token completo
 *
 * Configuração na Z-API:
 *   Webhook URL: https://<project>.supabase.co/functions/v1/sync-whatsapp-status
 *
 * Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Prioridade 3 — usa SOMENTE platform_integrations, sem fallback para
 * company_integrations ou qualquer tabela por-empresa.
 */

import { createClient } from "npm:@supabase/supabase-js@2.49.8";
import { corsHeaders }  from "../_shared/cors.ts";
import { maskPhone, sanitizeError } from "../_shared/sanitize.ts";

// ─── Env ──────────────────────────────────────────────────────────────────────

const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")             ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

// ─── Z-API status map ─────────────────────────────────────────────────────────

// Z-API status strings → our internal status strings
const ZAPI_STATUS_MAP: Record<string, string> = {
  SEND:      "enviado",
  RECEIVED:  "recebido",
  DELIVERED: "entregue",
  READ:      "lido",
  FAILED:    "erro",
  ERROR:     "erro",
  // Aliases used in different Z-API versions
  sent:      "enviado",
  delivered: "entregue",
  read:      "lido",
  failed:    "erro",
};

const mapStatus = (raw: string): string =>
  ZAPI_STATUS_MAP[raw] ?? ZAPI_STATUS_MAP[raw?.toUpperCase()] ?? raw?.toLowerCase() ?? "desconhecido";

// ─── Handler ──────────────────────────────────────────────────────────────────

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed." }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // ── 1. Valida Client-Token via platform_integrations ──────────────────
    // Z-API inclui o Client-Token no header de cada webhook.
    const receivedToken = req.headers.get("Client-Token") ?? "";

    // Load client_token from platform_integrations only (NO company_integrations fallback)
    const { data: piRow, error: piErr } = await admin
      .from("platform_integrations")
      .select("client_token, status")
      .eq("provider", "zapi")
      .maybeSingle();

    if (piErr || !piRow) {
      // platform_integrations not configured → reject webhook
      console.warn("[sync-whatsapp-status] platform_integrations not found — rejecting webhook");
      return new Response(JSON.stringify({ error: "Integração não configurada." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const row = piRow as Record<string, string | null>;
    const expectedToken = row.client_token ?? "";

    if (!expectedToken || receivedToken !== expectedToken) {
      // Safe log: do NOT log the received or expected tokens
      console.warn("[sync-whatsapp-status] Client-Token inválido no webhook.");
      return new Response(JSON.stringify({ error: "Client-Token inválido." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 2. Parse payload ───────────────────────────────────────────────────
    let payload: Record<string, unknown>;
    try {
      payload = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Payload inválido." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Z-API webhook formats vary by version — support multiple shapes
    const messageId = String(
      payload.messageId ?? payload.id ?? payload.message_id ?? ""
    );
    const rawStatus = String(
      payload.status ?? payload.type ?? payload.event ?? ""
    );
    const rawPhone = String(
      payload.phone ?? payload.to ?? payload.recipient ?? ""
    );

    if (!messageId) {
      // Not a message status update (could be connection event etc.)
      console.log("[sync-whatsapp-status] no messageId in payload — ignored");
      return new Response(JSON.stringify({ ok: true, skipped: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const mappedStatus = mapStatus(rawStatus);

    // ── 3. Update user_logs_cobranca ──────────────────────────────────────
    // Match by provider_message_id (the ID we stored when sending)
    const { data: updated, error: updateErr } = await admin
      .from("user_logs_cobranca")
      .update({
        status:     mappedStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("provider_message_id", messageId)
      // Avoid overwriting terminal states with intermediate ones
      .not("status", "in", '("lido","cancelado","liquidado")')
      .select("id, user_id")
      .limit(5); // defensive: messageId should be unique but cap results

    if (updateErr) {
      console.error("[sync-whatsapp-status] DB update error:", sanitizeError(String(updateErr.message)));
    }

    const updatedCount = (updated ?? []).length;

    // Safe log: masked phone, no token, no message content
    console.log(JSON.stringify({
      source:       "sync-whatsapp-status",
      messageId,
      rawStatus,
      mappedStatus,
      phone_masked: maskPhone(rawPhone),
      updatedRows:  updatedCount,
    }));

    return new Response(
      JSON.stringify({ ok: true, messageId, status: mappedStatus, updatedRows: updatedCount }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );

  } catch (unhandled) {
    console.error("[sync-whatsapp-status] unhandled:", sanitizeError(
      unhandled instanceof Error ? unhandled.message : String(unhandled),
    ));
    return new Response(JSON.stringify({ error: "Erro interno." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
