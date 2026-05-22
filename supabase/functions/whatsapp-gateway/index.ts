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
  loadZApiCredentials,
  loadPlatformStatus,
  updatePlatformStatus,
  savePlatformCredentials,
}                                 from "../_shared/platformIntegrations.ts";
import { maskToken }              from "../_shared/sanitize.ts";

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
    const status = await loadPlatformStatus(admin);
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
    const creds = await loadZApiCredentials(admin);
    if (!creds) {
      return err(503, "Instância Z-API não configurada. Configure as credenciais primeiro.");
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

    if (!instanceId || !token || !clientToken) {
      return err(400, "Campos obrigatórios: instanceId, token, clientToken.");
    }

    await savePlatformCredentials(admin, { instanceId, token, clientToken });

    // Safe log: mask token values
    console.log(`[whatsapp-gateway] credentials saved — instanceId=${maskToken(instanceId)} token=${maskToken(token)}`);

    return ok({ ok: true, message: "Credenciais salvas. Use action=validate para testar a conexão." });
  }

  // ── POST { action: "validate" } ───────────────────────────────────────────
  if (postAction === "validate") {
    const creds = await loadZApiCredentials(admin);
    if (!creds) {
      return err(503, "Instância Z-API não configurada. Configure as credenciais antes de validar.");
    }

    const zapiStatus = await fetchZApiStatus(creds.instanceId, creds.token, creds.clientToken);

    if (!zapiStatus) {
      await updatePlatformStatus(admin, {
        status:    "error",
        connected: false,
        last_error: "Não foi possível contatar a Z-API. Verifique instanceId/token.",
      });
      return err(502, "Falha ao contatar a Z-API. Verifique as credenciais e tente novamente.");
    }

    // Parse Z-API status response
    // Typical fields: connected (bool), smartphoneConnected (bool), phone (string)
    const connected     = Boolean(zapiStatus.connected ?? zapiStatus.status === "CONNECTED");
    const pendingPhone  = !connected && Boolean(zapiStatus.qrCode ?? zapiStatus.waiting);
    // Try phone from status response first, then fetch from secondary endpoint
    let rawPhone = (zapiStatus.phone ?? zapiStatus.smartphonePhone ?? zapiStatus.number ?? "") as string;
    if (!rawPhone && connected) {
      rawPhone = (await fetchZApiPhone(creds.instanceId, creds.token, creds.clientToken)) ?? "";
    }

    await updatePlatformStatus(admin, {
      status:                  connected ? "active" : (pendingPhone ? "inactive" : "error"),
      connected,
      connected_pending_phone: pendingPhone,
      phone_number:            rawPhone || null,
      last_error:              connected ? null : String(zapiStatus.message ?? zapiStatus.error ?? ""),
    });

    const platformStatus = await loadPlatformStatus(admin);

    return ok({
      ok: true,
      message: connected
        ? "Conexão Z-API validada com sucesso."
        : pendingPhone
          ? "Instância aguardando leitura de QR Code."
          : "Z-API respondeu mas não está conectada.",
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

    await savePlatformCredentials(admin, {
      instanceId:  envInstanceId,
      token:       envToken,
      clientToken: envClientToken,
    });

    // Safe log: never log the actual values
    console.log(`[whatsapp-gateway] init — credentials bootstrapped from env vars to platform_integrations. instanceId=${maskToken(envInstanceId)}`);

    return ok({ ok: true, message: "Credenciais inicializadas a partir das variáveis de ambiente. Use action=validate para testar a conexão." });
  }

  return err(400, `Ação desconhecida: "${postAction}". Use: save, init, validate.`);
});
