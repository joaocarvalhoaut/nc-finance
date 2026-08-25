/**
 * whatsapp-cloud-webhook — webhook ÚNICO da WhatsApp Cloud API (Meta oficial).
 *
 * A Meta usa um só endpoint para tudo:
 *   • GET  → verificação inicial (hub.challenge)
 *   • POST → eventos: statuses[] (sent/delivered/read/failed) e messages[] (inbound)
 *
 * Substitui, no mundo Cloud, o par sync-whatsapp-status + whatsapp-inbound da Z-API.
 * É uma função NOVA e separada — não interfere nas funções Z-API atuais. Só passa
 * a ser usada quando você apontar o webhook da Meta para cá e virar WHATSAPP_PROVIDER=cloud.
 *
 * Segurança:
 *   • GET: confere hub.verify_token == WHATSAPP_VERIFY_TOKEN.
 *   • POST: valida X-Hub-Signature-256 (HMAC-SHA256 do corpo cru com WHATSAPP_APP_SECRET).
 *   • Nunca loga telefone, texto ou token completos.
 *
 * Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, WHATSAPP_VERIFY_TOKEN, WHATSAPP_APP_SECRET
 * Registro: verify_jwt = false (a Meta não manda JWT).
 */

import { createClient } from "npm:@supabase/supabase-js@2.49.8";
import { corsHeaders } from "../_shared/cors.ts";
import { maskPhone, sanitizeError } from "../_shared/sanitize.ts";
import { isOptOutMessage, addOptOut } from "../_shared/optOut.ts";

const SUPABASE_URL     = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const VERIFY_TOKEN     = Deno.env.get("WHATSAPP_VERIFY_TOKEN") ?? "";
const APP_SECRET       = Deno.env.get("WHATSAPP_APP_SECRET") ?? "";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const onlyDigits = (s: string) => (s ?? "").replace(/\D/g, "");

// Cloud API status → status interno (mesmo vocabulário do sync-whatsapp-status).
const CLOUD_STATUS_MAP: Record<string, string> = {
  sent:      "enviado",
  delivered: "entregue",
  read:      "lido",
  failed:    "erro",
  deleted:   "erro",
};
const mapStatus = (raw: string): string =>
  CLOUD_STATUS_MAP[(raw ?? "").toLowerCase()] ?? (raw ?? "").toLowerCase() ?? "desconhecido";

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

// ─── Validação da assinatura X-Hub-Signature-256 ──────────────────────────────

const timingSafeEqual = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

const verifySignature = async (rawBody: string, header: string | null): Promise<boolean> => {
  if (!APP_SECRET) {
    // Sem app secret configurado, não dá para validar — recusa por segurança.
    console.warn("[whatsapp-cloud-webhook] WHATSAPP_APP_SECRET ausente — rejeitando POST.");
    return false;
  }
  if (!header || !header.startsWith("sha256=")) return false;
  const expected = header.slice("sha256=".length);

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(APP_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const computed = Array.from(new Uint8Array(sigBuf)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return timingSafeEqual(computed, expected);
};

// ─── Handlers de evento ───────────────────────────────────────────────────────

/** Atualiza user_logs_cobranca a partir de um status (match por wamid). */
const handleStatus = async (st: Record<string, unknown>): Promise<number> => {
  const wamid = String(st.id ?? "");
  const rawStatus = String(st.status ?? "");
  if (!wamid || !rawStatus) return 0;
  const mapped = mapStatus(rawStatus);

  const { data: updated, error } = await admin
    .from("user_logs_cobranca")
    .update({ status: mapped, updated_at: new Date().toISOString() })
    .eq("provider_message_id", wamid)
    .not("status", "in", '("lido","cancelado","liquidado")')
    .select("id")
    .limit(5);

  if (error) console.error("[whatsapp-cloud-webhook] status update err:", sanitizeError(String(error.message)));
  const n = (updated ?? []).length;
  console.log(JSON.stringify({ source: "cloud-webhook", kind: "status", wamid, rawStatus, mapped, updatedRows: n }));
  return n;
};

/** Trata mensagem recebida: só age em opt-out ("PARE"/"SAIR"), como a Z-API. */
const handleInbound = async (msg: Record<string, unknown>): Promise<number> => {
  const senderPhone = onlyDigits(String(msg.from ?? ""));
  const text = String((msg.text as Record<string, unknown> | undefined)?.body ?? msg.button ?? "");
  if (!senderPhone || !text || !isOptOutMessage(text)) return 0;

  // Cloud (número global): mapeia por devedor com esse telefone.
  const { data: rows } = await admin
    .from("user_registros_financeiros")
    .select("user_id")
    .eq("phone", senderPhone)
    .limit(500);

  const targets = new Set<string>();
  for (const r of rows ?? []) if (r.user_id) targets.add(r.user_id as string);

  let added = 0;
  for (const uid of targets) {
    await addOptOut(admin, uid, senderPhone, "Devedor respondeu pedindo para não ser contatado.", "reply");
    added++;
  }
  console.log(`[whatsapp-cloud-webhook] opt-out phone=***${senderPhone.slice(-4)} usuarios=${added}`);
  return added;
};

// ─── Handler principal ────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // ── GET: verificação do webhook (Meta) ──────────────────────────────────────
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && VERIFY_TOKEN && token === VERIFY_TOKEN) {
      return new Response(challenge ?? "", { status: 200, headers: corsHeaders });
    }
    return json(403, { error: "verify_token inválido." });
  }

  if (req.method !== "POST") return json(405, { error: "Method not allowed." });

  // ── POST: valida assinatura sobre o corpo CRU (antes de parsear) ─────────────
  const rawBody = await req.text();
  const valid = await verifySignature(rawBody, req.headers.get("X-Hub-Signature-256"));
  if (!valid) return json(401, { error: "assinatura inválida." });

  let payload: Record<string, any>;
  try { payload = JSON.parse(rawBody); } catch { return json(400, { error: "payload inválido." }); }

  try {
    let statuses = 0, inbound = 0;
    const entries = (payload.entry ?? []) as Array<Record<string, any>>;
    for (const entry of entries) {
      for (const change of (entry.changes ?? []) as Array<Record<string, any>>) {
        const value = change.value ?? {};
        for (const st of (value.statuses ?? []) as Array<Record<string, unknown>>) statuses += await handleStatus(st);
        for (const msg of (value.messages ?? []) as Array<Record<string, unknown>>) inbound += await handleInbound(msg);
      }
    }
    return json(200, { ok: true, statusUpdates: statuses, optOuts: inbound });
  } catch (err) {
    console.error("[whatsapp-cloud-webhook] unhandled:", sanitizeError(err instanceof Error ? err.message : String(err)));
    return json(500, { error: "erro interno." });
  }
});
