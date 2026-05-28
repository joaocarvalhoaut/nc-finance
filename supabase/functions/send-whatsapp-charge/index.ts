/**
 * send-whatsapp-charge — Edge Function segura para envio real via Z-API global.
 *
 * Fluxo completo (backend-only):
 *  1. Valida JWT / auth.uid()
 *  2. Valida payload
 *  3. Valida credenciais Z-API configuradas
 *  4. Valida assinatura Stripe (trialing | active)
 *  5. Valida limite mensal do plano
 *  6. Normaliza e valida telefone
 *  7. Verifica idempotência (evita duplicidade em 5 min)
 *  8. Envia via Z-API global
 *  9. Salva log em user_logs_cobranca (via service role — sem RLS bypass no frontend)
 * 10. Incrementa charges_sent em user_usage_counters
 * 11. Retorna resposta sanitizada (NUNCA retorna credenciais)
 *
 * Segredos necessários (Supabase Secrets — NUNCA no frontend):
 *   ZAPI_INSTANCE_ID, ZAPI_TOKEN, ZAPI_CLIENT_TOKEN
 */

import { createClient } from "npm:@supabase/supabase-js@2.49.8";
import { corsHeaders } from "../_shared/cors.ts";
import { normalizePhone, validatePhone, sendTextMessage, sendDocumentMessage } from "../_shared/zapi.ts";
import { downloadDriveFile, getDriveAccessToken } from "../_shared/driveFolderIndex.ts";
import { loadZApiCredentialsForUser } from "../_shared/platformIntegrations.ts";
import { maskPhone, messagePreview, sanitizeError } from "../_shared/sanitize.ts";
import { checkPilotGuard, incrementPilotDailyCount } from "../_shared/pilotGuard.ts";

// ─── Env ──────────────────────────────────────────────────────────────────────

const SUPABASE_URL       = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_ANON_KEY  = Deno.env.get("SUPABASE_ANON_KEY") || "";
const SERVICE_ROLE_KEY   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
// Note: ZAPI_* env vars are read via loadZApiCredentials() — not hardcoded here

// ─── Plan limits (espelha src/config/plans.ts) ────────────────────────────────

type PlanId = "basic" | "pro" | "premium";

const PLAN_LIMITS: Record<PlanId, number> = {
  basic:   300,
  pro:     1_500,
  premium: 5_000,
};

const getPlanLimit = (plan: string): number =>
  PLAN_LIMITS[plan as PlanId] ?? 300;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const getPeriodKey = (): string => {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
};

const hashKey = async (raw: string): Promise<string> => {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
};

// Resposta de erro padronizada — nunca vaza credenciais
const errResponse = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const okResponse = (body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// ─── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ── 1. Autenticação ────────────────────────────────────────────────────────
    const authHeader = request.headers.get("Authorization");
    if (!authHeader) {
      return errResponse(401, { error: "Nao autenticado.", status: "nao_autenticado" });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return errResponse(401, { error: "Sessao invalida.", status: "sessao_invalida" });
    }
    const userId = user.id;

    // ── 2. Parse e validação básica do payload ─────────────────────────────────
    let body: {
      debtorId?: string;
      phone?: string;
      message?: string;
      tone?: string;
      clientName?: string;
      documentNumber?: string;
      amount?: number;
    };

    try {
      body = await request.json();
    } catch {
      return errResponse(400, { error: "Payload invalido (JSON esperado).", status: "payload_invalido" });
    }

    if (!body.phone?.trim() || !body.message?.trim()) {
      return errResponse(400, { error: "Campos obrigatorios: phone, message.", status: "telefone_invalido" });
    }

    // ── 3. Carrega credenciais Z-API — número próprio (add-on) tem prioridade ────
    // Lookup order: user_zapi_config → platform_integrations → env vars
    const zapiCreds = await loadZApiCredentialsForUser(admin, userId);
    if (!zapiCreds) {
      return errResponse(503, {
        error: "Z-API nao configurada na plataforma. Configure as credenciais no painel de integrações.",
        status: "zapi_nao_configurada",
      });
    }

    // ── 4. Valida assinatura Stripe ────────────────────────────────────────────
    const { data: subscription } = await admin
      .from("user_subscriptions")
      .select("status, plan, current_period_end, cancel_at_period_end")
      .eq("user_id", userId)
      .maybeSingle();

    const ALLOWED_STATUSES = ["trialing", "active"];
    if (!subscription || !ALLOWED_STATUSES.includes(subscription.status)) {
      // P2: persist masked phone + message preview — never raw data
      await admin.from("user_logs_cobranca").insert({
        user_id: userId,
        client_name: (body.clientName || "Desconhecido").slice(0, 255),
        document_number: (body.documentNumber || "").slice(0, 100),
        phone: maskPhone(body.phone),
        amount: Number(body.amount || 0),
        tone: body.tone || "neutro",
        message: messagePreview(body.message, 100),
        status: "bloqueado_assinatura",
        type: "manual",
        provider: "zapi",
        error_message: `Assinatura nao autorizada: ${subscription?.status ?? "sem_assinatura"}`,
        debtor_id: body.debtorId || null,
      });

      return errResponse(403, {
        error: "Assinatura necessaria (trialing ou active). Verifique seu plano.",
        status: "bloqueado_assinatura",
      });
    }

    // ── 4b. Pilot-mode guard ──────────────────────────────────────────────────
    // If a pilot_config row exists for this user, all pilot rules must pass.
    // Users without a pilot_config row are allowed through (non-pilot tenants).
    const pilotResult = await checkPilotGuard(admin, userId);
    if (!pilotResult.ok && pilotResult.reason !== "config_ausente") {
      return errResponse(pilotResult.statusCode, {
        error:  pilotResult.message,
        status: pilotResult.reason,
      });
    }

    // ── 5. Valida limite mensal do plano ───────────────────────────────────────
    const period = getPeriodKey();
    const { data: usageRow } = await admin
      .from("user_usage_counters")
      .select("charges_sent, sheets_imports, drive_lookups")
      .eq("user_id", userId)
      .eq("period", period)
      .maybeSingle();

    const chargesUsed = Number(usageRow?.charges_sent ?? 0);
    const planLimit = getPlanLimit(subscription.plan);

    if (chargesUsed >= planLimit) {
      await admin.from("user_logs_cobranca").insert({
        user_id: userId,
        client_name: (body.clientName || "Desconhecido").slice(0, 255),
        document_number: (body.documentNumber || "").slice(0, 100),
        phone: maskPhone(body.phone),
        amount: Number(body.amount || 0),
        tone: body.tone || "neutro",
        message: messagePreview(body.message, 100),
        status: "bloqueado_limite",
        type: "manual",
        provider: "zapi",
        error_message: `Limite atingido: ${chargesUsed}/${planLimit} (plano ${subscription.plan})`,
        debtor_id: body.debtorId || null,
      });

      return errResponse(429, {
        error: `Limite mensal de ${planLimit} cobranças atingido para o plano ${subscription.plan}.`,
        status: "bloqueado_limite",
        used: chargesUsed,
        limit: planLimit,
      });
    }

    // ── 6. Normaliza e valida telefone ─────────────────────────────────────────
    const normalizedPhone = normalizePhone(body.phone);
    if (!validatePhone(normalizedPhone)) {
      await admin.from("user_logs_cobranca").insert({
        user_id: userId,
        client_name: (body.clientName || "Desconhecido").slice(0, 255),
        document_number: (body.documentNumber || "").slice(0, 100),
        // P2: masked phone — raw phone never persisted
        phone: maskPhone(body.phone),
        amount: Number(body.amount || 0),
        tone: body.tone || "neutro",
        message: messagePreview(body.message, 100),
        status: "telefone_invalido",
        type: "manual",
        provider: "zapi",
        // P2: sanitize error — no raw phone in error_message
        error_message: `Telefone invalido: tamanho=${(body.phone ?? "").replace(/\D/g,"").length}d`,
        debtor_id: body.debtorId || null,
      });

      return errResponse(400, {
        error: "Telefone invalido. Use o formato com DDI+DDD+numero (ex: 5577999887720).",
        status: "telefone_invalido",
      });
    }

    // ── 7. Idempotência: evita duplicidade em janela de 5 minutos ──────────────
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const idempotencyRaw = `${userId}::${normalizedPhone}::${body.message.slice(0, 100)}::${today}`;
    const idempotencyHash = await hashKey(idempotencyRaw);

    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: recentDuplicate } = await admin
      .from("user_logs_cobranca")
      .select("id, created_at")
      .eq("user_id", userId)
      .eq("idempotency_key", idempotencyHash)
      .eq("status", "sucesso")
      .gte("created_at", fiveMinutesAgo)
      .maybeSingle();

    if (recentDuplicate) {
      return errResponse(409, {
        error: "Envio duplicado detectado. Aguarde 5 minutos antes de reenviar a mesma mensagem.",
        status: "duplicado",
        duplicateLogId: recentDuplicate.id,
      });
    }

    // ── 8. Envia via Z-API (com PDF se houver match Drive; fallback texto) ──────
    let zapiResult: { success: boolean; messageId: string | null; zaapId: string | null; error: string | null };

    // Check if this debtor has an attached PDF (uploaded or Drive-matched)
    let debtorDriveFileId:   string | null = null;
    let debtorDriveFileName: string | null = null;
    let debtorDriveFileUrl:  string | null = null;
    if (body.debtorId) {
      const { data: dr } = await admin
        .from("user_registros_financeiros")
        .select("drive_file_id, drive_file_name, drive_file_url")
        .eq("id", body.debtorId)
        .eq("user_id", userId)
        .maybeSingle();
      if (dr) {
        debtorDriveFileId   = (dr as Record<string, unknown>).drive_file_id   as string | null ?? null;
        debtorDriveFileName = (dr as Record<string, unknown>).drive_file_name as string | null ?? null;
        debtorDriveFileUrl  = (dr as Record<string, unknown>).drive_file_url  as string | null ?? null;
      }
    }

    // Attempt PDF attachment if available
    let sentWithPdf = false;

    if (debtorDriveFileId === "uploaded" && debtorDriveFileUrl) {
      // Direct URL download from Supabase Storage (no Drive API needed)
      try {
        const pdfRes = await fetch(debtorDriveFileUrl);
        if (pdfRes.ok) {
          const pdfBuf = await pdfRes.arrayBuffer();
          const pdfBytes = new Uint8Array(pdfBuf);
          if (pdfBytes.length > 0) {
            zapiResult = await sendDocumentMessage({
              instanceId:    zapiCreds.instanceId,
              token:         zapiCreds.token,
              clientToken:   zapiCreds.clientToken,
              phone:         normalizedPhone,
              fileName:      debtorDriveFileName ?? "boleto.pdf",
              documentBytes: pdfBytes,
              caption:       body.message,
            });
            if (zapiResult.success) sentWithPdf = true;
          }
        }
      } catch (e) {
        console.warn("[send-whatsapp-charge] PDF download from storage failed, falling back to text:", e instanceof Error ? e.message : String(e));
      }
    } else if (debtorDriveFileId) {
      // Legacy: Drive-matched PDF — download from Google Drive
      const driveToken = await getDriveAccessToken().catch(() => null);
      if (driveToken) {
        const pdfBytes = await downloadDriveFile(debtorDriveFileId, driveToken).catch(() => null);
        if (pdfBytes && pdfBytes.length > 0) {
          zapiResult = await sendDocumentMessage({
            instanceId:    zapiCreds.instanceId,
            token:         zapiCreds.token,
            clientToken:   zapiCreds.clientToken,
            phone:         normalizedPhone,
            fileName:      debtorDriveFileName ?? "boleto.pdf",
            documentBytes: pdfBytes,
            caption:       body.message,
          });
          if (zapiResult.success) sentWithPdf = true;
        }
      }
    }

    // Fallback to text-only
    if (!sentWithPdf) {
      zapiResult = await sendTextMessage({
        instanceId:  zapiCreds.instanceId,
        token:       zapiCreds.token,
        clientToken: zapiCreds.clientToken,
        phone:       normalizedPhone,
        message:     body.message,
      });
    }

    const logStatus = zapiResult.success ? "sucesso" : "erro";
    void sentWithPdf;

    // ── 9. Persiste log sanitizado (P2) ────────────────────────────────────────
    const { data: insertedLog } = await admin
      .from("user_logs_cobranca")
      .insert({
        user_id:             userId,
        client_name:         (body.clientName || "Desconhecido").slice(0, 255),
        document_number:     (body.documentNumber || "").slice(0, 100),
        // P2: masked phone — raw number never stored
        phone:               maskPhone(normalizedPhone),
        amount:              Number(body.amount || 0),
        tone:                body.tone || "neutro",
        // P2: message preview — full message text never stored
        message:             messagePreview(body.message, 100),
        status:              logStatus,
        type:                "manual",
        provider:            "zapi",
        provider_message_id: zapiResult.messageId,
        // P2: sanitize error — strip any PII that might appear in provider errors
        error_message:       zapiResult.error
                               ? sanitizeError(zapiResult.error).slice(0, 300)
                               : null,
        idempotency_key:     idempotencyHash,
        debtor_id:           body.debtorId || null,
      })
      .select("id, created_at")
      .single();

    // ── 10. Incrementa usage counter e pilot counter (apenas em caso de sucesso)
    if (zapiResult.success) {
      // Pilot daily counter (fire-and-forget — non-blocking)
      if (pilotResult.ok) {
        incrementPilotDailyCount(admin, userId, 1).catch((e: unknown) => {
          console.error("[send-whatsapp-charge] pilot counter increment failed:", e instanceof Error ? e.message : String(e));
        });
      }

      // Incremento atômico via RPC — evita race condition em envios simultâneos
      await admin.rpc("increment_charges_sent", {
        p_user_id: userId,
        p_period:  period,
        p_delta:   1,
      });
    }

    // ── 11. Retorno sanitizado (NUNCA devolve credenciais) ─────────────────────
    if (!zapiResult.success) {
      return errResponse(502, {
        error: zapiResult.error || "Falha temporaria ao enviar via Z-API. Tente novamente.",
        status: "erro",
        logId: insertedLog?.id ?? null,
      });
    }

    return okResponse({
      success: true,
      status: "sucesso",
      messageId: zapiResult.messageId,
      zaapId: zapiResult.zaapId,
      logId: insertedLog?.id ?? null,
      chargesUsed: chargesUsed + 1,
      chargesLimit: planLimit,
    });

  } catch (err) {
    // Erro interno inesperado — nunca vaza stack/credenciais
    console.error("[send-whatsapp-charge] unhandled error:", err);
    return errResponse(500, {
      error: "Erro interno. Tente novamente ou contate o suporte.",
      status: "erro_interno",
    });
  }
});
