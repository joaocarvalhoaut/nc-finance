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
import { normalizePhone, validatePhone, sendTextMessage } from "../_shared/zapi.ts";

// ─── Env ──────────────────────────────────────────────────────────────────────

const SUPABASE_URL       = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_ANON_KEY  = Deno.env.get("SUPABASE_ANON_KEY") || "";
const SERVICE_ROLE_KEY   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const ZAPI_INSTANCE_ID   = Deno.env.get("ZAPI_INSTANCE_ID") || "";
const ZAPI_TOKEN         = Deno.env.get("ZAPI_TOKEN") || "";
const ZAPI_CLIENT_TOKEN  = Deno.env.get("ZAPI_CLIENT_TOKEN") || "";

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

    // ── 3. Valida credenciais Z-API ────────────────────────────────────────────
    if (!ZAPI_INSTANCE_ID || !ZAPI_TOKEN || !ZAPI_CLIENT_TOKEN) {
      return errResponse(503, {
        error: "Z-API nao configurada na plataforma. Contate o suporte.",
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
      await admin.from("user_logs_cobranca").insert({
        user_id: userId,
        client_name: (body.clientName || "Desconhecido").slice(0, 255),
        document_number: (body.documentNumber || "").slice(0, 100),
        phone: body.phone,
        amount: Number(body.amount || 0),
        tone: body.tone || "neutro",
        message: body.message.slice(0, 500),
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
        phone: body.phone,
        amount: Number(body.amount || 0),
        tone: body.tone || "neutro",
        message: body.message.slice(0, 500),
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
        phone: body.phone,
        amount: Number(body.amount || 0),
        tone: body.tone || "neutro",
        message: body.message.slice(0, 500),
        status: "telefone_invalido",
        type: "manual",
        provider: "zapi",
        error_message: `Telefone invalido: "${body.phone}" → normalizado: "${normalizedPhone}"`,
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

    // ── 8. Envia via Z-API global ──────────────────────────────────────────────
    const zapiResult = await sendTextMessage({
      instanceId: ZAPI_INSTANCE_ID,
      token: ZAPI_TOKEN,
      clientToken: ZAPI_CLIENT_TOKEN,
      phone: normalizedPhone,
      message: body.message,
    });

    const logStatus = zapiResult.success ? "sucesso" : "erro";

    // ── 9. Persiste log (service role — nunca expõe credenciais) ───────────────
    const { data: insertedLog } = await admin
      .from("user_logs_cobranca")
      .insert({
        user_id: userId,
        client_name: (body.clientName || "Desconhecido").slice(0, 255),
        document_number: (body.documentNumber || "").slice(0, 100),
        phone: normalizedPhone,
        amount: Number(body.amount || 0),
        tone: body.tone || "neutro",
        message: body.message.slice(0, 2_000),
        status: logStatus,
        type: "manual",
        provider: "zapi",
        provider_message_id: zapiResult.messageId,
        error_message: zapiResult.error,
        idempotency_key: idempotencyHash,
        debtor_id: body.debtorId || null,
      })
      .select("id, created_at")
      .single();

    // ── 10. Incrementa usage counter (apenas em caso de sucesso) ───────────────
    if (zapiResult.success) {
      await admin.from("user_usage_counters").upsert(
        {
          user_id: userId,
          period,
          charges_sent: chargesUsed + 1,
          sheets_imports: Number(usageRow?.sheets_imports ?? 0),
          drive_lookups: Number(usageRow?.drive_lookups ?? 0),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,period" },
      );
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
