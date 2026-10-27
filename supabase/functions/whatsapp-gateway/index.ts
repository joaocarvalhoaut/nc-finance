/**
 * whatsapp-gateway — backend seguro para gerenciamento da instância Z-API.
 *
 * Endpoints:
 *   GET  ?action=status    → retorna somente campos seguros (sem token/client_token)
 *   GET  ?action=qr        → retorna QR Code data da Z-API para conexão
 *   POST { action: "save", instanceId, token, clientToken }
 *        → salva credenciais em platform_integrations (requer X-Admin-Token)
 *   POST { action: "validate" }
 *        → testa conexão Z-API, atualiza status em platform_integrations
 *
 * Regras de segurança:
 *   - token e client_token NUNCA são retornados ao browser.
 *   - Ação "save" requer header X-Admin-Token === GATEWAY_ADMIN_SECRET (env var).
 *   - Ações "status" e "qr" requerem apenas JWT autenticado.
 *   - Toda resposta ao frontend contém apenas: status, connected,
 *     connected_pending_phone, phone_number_masked, updated_at, qrCode.
 *
 * Secrets necessários (Supabase Secrets):
 *   GATEWAY_ADMIN_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *   SUPABASE_ANON_KEY
 */

import { createClient }           from "npm:@supabase/supabase-js@2.49.8";
import { corsHeaders }            from "../_shared/cors.ts";
import {
  loadZApiCredentialsForUser,
  loadUserZApiStatus,
  updateUserZApiStatus,
  saveUserZApiCredentials,
}                                 from "../_shared/platformIntegrations.ts";
import { maskToken }              from "../_shared/sanitize.ts";
import { checkRateLimit }         from "../_shared/rateLimit.ts";
import { checkSubscription }      from "../_shared/subscriptionGuard.ts";
import { zapiPartnerConfigured }  from "../_shared/zapiPartner.ts";
import {
  ensureSubscribed,
  loadAutoInstance,
  needsNewInstance,
  provisionInstanceForUser,
}                                 from "../_shared/zapiProvisioning.ts";

// ─── Env ──────────────────────────────────────────────────────────────────────

const SUPABASE_URL        = Deno.env.get("SUPABASE_URL")             ?? "";
const SUPABASE_ANON_KEY   = Deno.env.get("SUPABASE_ANON_KEY")        ?? "";
const SERVICE_ROLE_KEY    = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const GATEWAY_ADMIN_SECRET= Deno.env.get("GATEWAY_ADMIN_SECRET")     ?? "";

const ZAPI_BASE = "https://api.z-api.io";
const TIMEOUT_MS = 10_000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ok  = (body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const err = (status: number, message: string) =>
  new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/** Fetch Z-API status endpoint for the given instance */
async function fetchZApiStatus(instanceId: string, token: string, clientToken: string) {
  const url = `${ZAPI_BASE}/instances/${instanceId}/token/${token}/status`;
  const ctrl = new AbortController();
  const tid  = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "Client-Token": clientToken },
      signal:  ctrl.signal,
    });
    clearTimeout(tid);
    if (!res.ok) return null;
    return await res.json() as Record<string, unknown>;
  } catch {
    clearTimeout(tid);
    return null;
  }
}

/**
 * Fetch the connected phone number from Z-API.
 * Z-API's /status endpoint does not always return the phone — this endpoint does.
 */
async function fetchZApiPhone(instanceId: string, token: string, clientToken: string): Promise<string | null> {
  // Try multiple known Z-API endpoints for phone retrieval
  const endpoints = [
    `/instances/${instanceId}/token/${token}/phone`,
    `/instances/${instanceId}/token/${token}/connected`,
    `/instances/${instanceId}/token/${token}/device`,
  ];

  for (const path of endpoints) {
    const ctrl = new AbortController();
    const tid  = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${ZAPI_BASE}${path}`, {
        headers: { "Client-Token": clientToken, "Content-Type": "application/json" },
        signal:  ctrl.signal,
      });
      clearTimeout(tid);
      if (!res.ok) continue;
      const data = await res.json() as Record<string, unknown>;
      // Try various field names used across Z-API versions
      const phone = (
        data.phone     ??
        data.phoneNumber ??
        data.connectedPhone ??
        data.number    ??
        data.wid       ??
        data.value
      );
      if (phone && typeof phone === "string" && /\d{8,}/.test(phone)) {
        return phone;
      }
    } catch {
      clearTimeout(tid);
    }
  }
  return null;
}

/** Fetch Z-API QR code for the given instance */
async function fetchZApiQR(instanceId: string, token: string, clientToken: string) {
  const url = `${ZAPI_BASE}/instances/${instanceId}/token/${token}/qr-code/image`;
  const ctrl = new AbortController();
  const tid  = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "Client-Token": clientToken },
      signal:  ctrl.signal,
    });
    clearTimeout(tid);
    if (!res.ok) return null;
    const data = await res.json() as Record<string, unknown>;
    // Return only the QR value — no credentials
    return (data.value ?? data.qrcode ?? data.qr ?? null) as string | null;
  } catch {
    clearTimeout(tid);
    return null;
  }
}

/**
 * user_id da conta com este e-mail. A Admin API do Supabase não filtra por
 * e-mail, então percorre as páginas — suficiente enquanto a base tiver poucos
 * milhares de contas (só o suporte chama, ao ligar uma instância a um cliente).
 */
async function findUserIdByEmail(
  // Genéricos explícitos pelo mesmo motivo de platformIntegrations.ts.
  // deno-lint-ignore no-explicit-any
  admin: ReturnType<typeof createClient<any, any, any>>,
  email: string,
): Promise<string | null> {
  const POR_PAGINA = 200;
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: POR_PAGINA });
    if (error) throw error;
    const achado = data.users.find((u) => (u.email ?? "").toLowerCase() === email);
    if (achado) return achado.id;
    if (data.users.length < POR_PAGINA) break;
  }
  return null;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // ── JWT auth required for all actions ─────────────────────────────────────
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return err(401, "Não autenticado.");

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) return err(401, "Sessão inválida.");

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const url    = new URL(req.url);
  const action = url.searchParams.get("action") ?? "";

  // ── GET ?action=status ─────────────────────────────────────────────────────
  if (req.method === "GET" && (action === "status" || action === "")) {
    const status = await loadUserZApiStatus(admin, user.id);
    if (!status) {
      return ok({
        ok: true,
        status: "inactive",
        connected: false,
        connected_pending_phone: false,
        phone_number_masked: null,
        updated_at: null,
      });
    }
    return ok({ ok: true, ...status });
  }

  // ── GET ?action=qr ─────────────────────────────────────────────────────────
  if (req.method === "GET" && action === "qr") {
    // Sem instância (ou a automática expirou/foi cancelada): cria uma agora pela
    // API de parceiro da Z-API — o cliente conecta o próprio número sozinho.
    if (needsNewInstance(await loadAutoInstance(admin, user.id))) {
      if (!zapiPartnerConfigured()) {
        return err(503, "A conexão do WhatsApp ainda não está disponível. Fale com o suporte.");
      }
      const sub = await checkSubscription(admin, user.id);
      if (!sub.ok) return err(403, "Ative sua assinatura para conectar o WhatsApp.");

      // Cada instância criada pode virar custo: no máximo 3 por hora por conta.
      const rl = await checkRateLimit(admin, `zapi-provision:${user.id}`, 3, 3600);
      if (!rl.allowed) return err(429, "Muitas tentativas de conexão. Tente de novo em alguns minutos.");

      try {
        await provisionInstanceForUser(admin, user.id);
      } catch (e) {
        console.log(JSON.stringify({
          source: "whatsapp-gateway.provision_error", user_id: user.id,
          message: e instanceof Error ? e.message : String(e),
        }));
        return err(502, "Não foi possível preparar seu número agora. Tente de novo em instantes.");
      }
      // Instância recém-criada leva alguns segundos para subir: a tela tenta de novo.
      return ok({ ok: true, preparing: true, qrCode: null });
    }

    const creds = await loadZApiCredentialsForUser(admin, user.id);
    if (!creds) {
      return err(503, "Nenhum número de WhatsApp conectado a esta conta. Fale com o suporte.");
    }
    // Já pareado: não há QR a mostrar (escanear de novo falharia). Atualiza o
    // status e avisa a tela, que troca o QR por "Conectado".
    const atual = await fetchZApiStatus(creds.instanceId, creds.token, creds.clientToken);
    if (atual && Boolean(atual.connected ?? atual.status === "CONNECTED")) {
      const phone = ((atual.phone ?? atual.smartphonePhone ?? atual.number ?? "") as string)
        || (await fetchZApiPhone(creds.instanceId, creds.token, creds.clientToken)) || null;
      await updateUserZApiStatus(admin, user.id, {
        status: "active", connected: true, connected_pending_phone: false, phone_number: phone, last_error: null,
      });
      await ensureSubscribed(admin, user.id);
      return ok({ ok: true, connected: true, qrCode: null });
    }

    const qrCode = await fetchZApiQR(creds.instanceId, creds.token, creds.clientToken);
    if (!qrCode) {
      return err(502, "Não foi possível obter QR Code da Z-API. Verifique se a instância já está conectada.");
    }
    // ── SAFE: returns only qrCode string, no credentials ──────────────────
    return ok({ ok: true, qrCode });
  }

  // ── POST ───────────────────────────────────────────────────────────────────
  if (req.method !== "POST") {
    return err(405, "Método não permitido.");
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return err(400, "Payload inválido (JSON esperado).");
  }

  const postAction = String(body.action ?? "");

  // ── POST { action: "save" } — requires X-Admin-Token ──────────────────────
  if (postAction === "save") {
    if (!GATEWAY_ADMIN_SECRET) {
      return err(503, "GATEWAY_ADMIN_SECRET não configurado. Defina o secret antes de usar esta ação.");
    }

    const providedAdminToken = req.headers.get("X-Admin-Token") ?? "";
    if (providedAdminToken !== GATEWAY_ADMIN_SECRET) {
      // Safe log: do NOT log the provided token
      console.warn("[whatsapp-gateway] tentativa de save sem X-Admin-Token válido.");
      return err(403, "Token de administrador inválido.");
    }

    const instanceId  = String(body.instanceId  ?? "").trim();
    const token       = String(body.token        ?? "").trim();
    const clientToken = String(body.clientToken  ?? "").trim();
    const label       = String(body.label        ?? "").trim();
    if (!instanceId || !token || !clientToken) {
      return err(400, "Campos obrigatórios: instanceId, token, clientToken.");
    }

    // Conta destino: o suporte liga uma instância comprada à mão na Z-API à conta
    // de um cliente pelo e-mail dele (ou pelo targetUserId). Sem nenhum dos
    // dois, grava na própria conta de quem chamou.
    let targetUserId = String(body.targetUserId ?? "").trim() || user.id;
    const targetEmail = String(body.targetEmail ?? "").trim().toLowerCase();
    if (targetEmail) {
      const encontrado = await findUserIdByEmail(admin, targetEmail);
      if (!encontrado) return err(404, "Nenhuma conta com esse e-mail.");
      targetUserId = encontrado;
    }

    await saveUserZApiCredentials(admin, targetUserId, {
      instanceId, token, clientToken, label: label || undefined,
    });

    // Safe log: mask token values
    console.log(`[whatsapp-gateway] credentials saved — instanceId=${maskToken(instanceId)} token=${maskToken(token)}`);

    return ok({
      ok: true,
      message: targetUserId === user.id
        ? "Salvo com sucesso. Agora conecte o número pelo \"Conectar WhatsApp\"."
        : `Salvo com sucesso na conta ${targetEmail || "do cliente"}. Ele já pode conectar o número pelo "Conectar WhatsApp".`,
    });
  }

  // ── POST { action: "validate" } ───────────────────────────────────────────
  if (postAction === "validate") {
    const creds = await loadZApiCredentialsForUser(admin, user.id);
    if (!creds) {
      return err(503, "Nenhum número de WhatsApp conectado a esta conta. Fale com o suporte para provisionar a instância.");
    }

    const zapiStatus = await fetchZApiStatus(creds.instanceId, creds.token, creds.clientToken);

    if (!zapiStatus) {
      await updateUserZApiStatus(admin, user.id, {
        status:    "error",
        connected: false,
        last_error: "Não foi possível contatar a Z-API. Verifique instanceId/token.",
      });
      return err(502, "Falha ao contatar a Z-API. Verifique as credenciais e tente novamente.");
    }

    // Parse Z-API status response
    // Typical fields: connected (bool), smartphoneConnected (bool), phone (string)
    const connected     = Boolean(zapiStatus.connected ?? zapiStatus.status === "CONNECTED");
    // A Z-API respondeu e o número não está pareado ("You are not connected" /
    // "You need to restore the session"): a instância está no ar esperando o QR
    // Code. Antes isso virava status "error" e a tela mostrava "Erro de conexão"
    // para quem só precisava escanear. "error" fica para quando a Z-API nem responde.
    const pendingPhone  = !connected;
    // Try phone from status response first, then fetch from secondary endpoint
    let rawPhone = (zapiStatus.phone ?? zapiStatus.smartphonePhone ?? zapiStatus.number ?? "") as string;
    if (!rawPhone && connected) {
      rawPhone = (await fetchZApiPhone(creds.instanceId, creds.token, creds.clientToken)) ?? "";
    }

    await updateUserZApiStatus(admin, user.id, {
      status:                  connected ? "active" : "inactive",
      connected,
      connected_pending_phone: pendingPhone,
      phone_number:            rawPhone || null,
      last_error:              connected ? null : String(zapiStatus.message ?? zapiStatus.error ?? ""),
    });

    // Primeiro pareamento de uma instância automática: passa a assinar na Z-API.
    if (connected) await ensureSubscribed(admin, user.id);

    const platformStatus = await loadUserZApiStatus(admin, user.id);

    return ok({
      ok: true,
      message: connected
        ? "Conexão Z-API validada com sucesso."
        : "Número ainda não conectado. Abra a aba QR Code e escaneie com o WhatsApp do celular.",
      ...platformStatus,
    });
  }

  // ── POST { action: "init" } — bootstrap: reads ZAPI_* env vars into platform_integrations ──
  if (postAction === "init") {
    if (!GATEWAY_ADMIN_SECRET) {
      return err(503, "GATEWAY_ADMIN_SECRET não configurado. Defina o secret antes de usar esta ação.");
    }

    const providedAdminToken = req.headers.get("X-Admin-Token") ?? "";
    if (providedAdminToken !== GATEWAY_ADMIN_SECRET) {
      console.warn("[whatsapp-gateway] tentativa de init sem X-Admin-Token válido.");
      return err(403, "Token de administrador inválido.");
    }

    // Read ZAPI_* env vars (only accessible server-side — never returned to browser)
    const envInstanceId  = Deno.env.get("ZAPI_INSTANCE_ID")  ?? "";
    const envToken       = Deno.env.get("ZAPI_TOKEN")         ?? "";
    const envClientToken = Deno.env.get("ZAPI_CLIENT_TOKEN")  ?? "";

    if (!envInstanceId || !envToken || !envClientToken) {
      return err(503, "Env vars ZAPI_INSTANCE_ID / ZAPI_TOKEN / ZAPI_CLIENT_TOKEN não configuradas nos secrets. Configure-as via Supabase Secrets antes de chamar init.");
    }

    // Vincula o numero das env vars a ESTA conta (nao mais a uma instancia global).
    await saveUserZApiCredentials(admin, user.id, {
      instanceId:  envInstanceId,
      token:       envToken,
      clientToken: envClientToken,
      label:       "Numero vinculado via init",
    });

    // Safe log: never log the actual values
    console.log(`[whatsapp-gateway] init — credentials bootstrapped from env vars to platform_integrations. instanceId=${maskToken(envInstanceId)}`);

    return ok({ ok: true, message: "Credenciais inicializadas a partir das variáveis de ambiente. Use action=validate para testar a conexão." });
  }

  return err(400, `Ação desconhecida: "${postAction}". Use: save, init, validate.`);
});
