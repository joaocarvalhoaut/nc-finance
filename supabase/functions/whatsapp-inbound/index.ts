/**
 * whatsapp-inbound — recebe mensagens RECEBIDAS do Z-API (on-message-received)
 * e auto-detecta pedidos de opt-out ("PARE", "SAIR", …), adicionando o número à
 * lista de não-contatar. Protege o número contra ban e cumpre o direito de
 * oposição (LGPD).
 *
 * Segurança: público (verify_jwt=false — o Z-API não manda JWT). Se o secret
 * WHATSAPP_INBOUND_SECRET estiver configurado, exige `?secret=` na URL do
 * webhook (configurada no painel Z-API). Sem secret, funciona mas registra
 * aviso. O pior caso de abuso é marcar um número como não-contatar (bloqueia
 * envio) — sem exposição de dados.
 *
 * Mapeamento do destinatário:
 *   • número próprio do cliente (user_zapi_config.instance_id) → aquele usuário
 *   • número global da plataforma → todos os usuários que têm esse telefone
 *     como devedor (o "PARE" vale para quem poderia contatá-lo)
 */

import { createClient } from "npm:@supabase/supabase-js@2.49.8";
import { corsHeaders } from "../_shared/cors.ts";
import { isOptOutMessage, addOptOut } from "../_shared/optOut.ts";

const SUPABASE_URL     = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const INBOUND_SECRET   = Deno.env.get("WHATSAPP_INBOUND_SECRET") || "";

const onlyDigits = (s: string) => (s ?? "").replace(/\D/g, "");

const ok = (body: Record<string, unknown> = { ok: true }) =>
  new Response(JSON.stringify(body), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST")   return ok({ ignored: "method" });

  // Verificação de secret (se configurado)
  if (INBOUND_SECRET) {
    const url = new URL(request.url);
    if (url.searchParams.get("secret") !== INBOUND_SECRET) {
      return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  } else {
    console.warn("[whatsapp-inbound] WHATSAPP_INBOUND_SECRET não configurado — endpoint aberto.");
  }

  let payload: Record<string, any>;
  try { payload = await request.json(); } catch { return ok({ ignored: "invalid_json" }); }

  // Ignora mensagens enviadas por nós mesmos.
  if (payload.fromMe === true || payload.fromApi === true) return ok({ ignored: "fromMe" });

  // Extrai telefone do remetente e o texto (formatos variam no Z-API).
  const senderPhone = onlyDigits(String(payload.phone ?? payload.participantPhone ?? payload.sender ?? ""));
  const text = String(
    payload.text?.message ?? payload.message ?? payload.body ??
    payload.notification ?? payload.text ?? "",
  );
  if (!senderPhone || !text) return ok({ ignored: "no_phone_or_text" });

  // Só age em mensagens de opt-out — não armazenamos o resto (privacidade).
  if (!isOptOutMessage(text)) return ok({ ignored: "not_opt_out" });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const instanceId = String(payload.instanceId ?? payload.instance ?? "");
  const targetUserIds = new Set<string>();

  // 1. Número próprio do cliente → aquele usuário
  if (instanceId) {
    const { data: cfg } = await admin
      .from("user_zapi_config")
      .select("user_id")
      .eq("instance_id", instanceId)
      .maybeSingle();
    if (cfg?.user_id) targetUserIds.add(cfg.user_id as string);
  }

  // 2. Número global (ou complementando) → todos com esse telefone como devedor
  if (targetUserIds.size === 0) {
    const { data: rows } = await admin
      .from("user_registros_financeiros")
      .select("user_id")
      .eq("phone", senderPhone)
      .limit(500);
    for (const r of rows ?? []) if (r.user_id) targetUserIds.add(r.user_id as string);
  }

  let added = 0;
  for (const uid of targetUserIds) {
    await addOptOut(admin, uid, senderPhone, "Devedor respondeu pedindo para não ser contatado.", "reply");
    added++;
  }

  console.log(`[whatsapp-inbound] opt-out automático: phone=***${senderPhone.slice(-4)} usuarios=${added}`);
  return ok({ ok: true, optedOutFor: added });
});
