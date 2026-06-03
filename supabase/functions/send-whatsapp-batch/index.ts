/**
 * send-whatsapp-batch — Edge Function para envio em lote de cobranças via Z-API global.
 *
 * Fluxo:
 *  1.  Valida JWT / auth.uid()
 *  2.  Valida payload (debtorIds[])
 *  3.  Valida credenciais Z-API
 *  4.  Valida assinatura Stripe (trialing | active)
 *  5.  Verifica plano: Basic → bloqueado; Pro/Premium → prossegue
 *  6.  Lê snapshot de uso mensal e calcula capacidade restante
 *  7.  Para cada debtorId (até o limite restante):
 *      a. Busca devedor em user_registros_financeiros filtrado por user_id
 *      b. Valida telefone
 *      c. Verifica idempotência (5 min)
 *      d. Monta mensagem (template por tom + variáveis + PDF link se existir)
 *      e. Envia via Z-API global (ou simula em dryRun)
 *      f. Registra log individual em user_logs_cobranca
 *  8.  Incrementa charges_sent com o total de sucessos
 *  9.  Retorna resumo sanitizado
 *
 * Segredos: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, AUTOMATION_CRON_SECRET
 * Z-API credentials lidas de platform_integrations via loadZApiCredentials() — não hardcoded
 *
 * Planos:
 *  - Basic   → bloqueado (403 plano_sem_recurso)
 *  - Pro     → habilitado
 *  - Premium → habilitado
 *
 * Limite:
 *  Se debtorIds.length > remaining, processa apenas até o limite restante.
 *  Os excedentes recebem status "bloqueado_limite" no resumo.
 */

import { createClient } from "npm:@supabase/supabase-js@2.49.8";
import { corsHeaders } from "../_shared/cors.ts";
import { normalizePhone, validatePhone, sendTextMessage, sendDocumentMessage } from "../_shared/zapi.ts";
import { downloadDriveFile, getDriveAccessToken } from "../_shared/driveFolderIndex.ts";
import { checkSubscription }               from "../_shared/subscriptionGuard.ts";
import { getUsageSnapshot, incrementChargesSent } from "../_shared/usageGuard.ts";
import { insertBillingLog }                from "../_shared/billingLog.ts";
import { buildMessage }                    from "../_shared/messageBuilder.ts";
import { loadZApiCredentialsForUser }       from "../_shared/platformIntegrations.ts";
import { sanitizeError }                   from "../_shared/sanitize.ts";
import { checkPilotGuard, incrementPilotDailyCount } from "../_shared/pilotGuard.ts";

// ─── Env ──────────────────────────────────────────────────────────────────────

const SUPABASE_URL      = Deno.env.get("SUPABASE_URL")            || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")       || "";
const SERVICE_ROLE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
// Z-API credentials loaded via loadZApiCredentialsForUser() — user_zapi_config → platform_integrations → env vars

// ─── Constants ────────────────────────────────────────────────────────────────

const BATCH_ALLOWED_PLANS  = ["pro", "premium"];
const MAX_BATCH_SIZE        = 200; // hard cap to avoid timeouts
const PROVIDER              = "zapi";

// ─── Types ────────────────────────────────────────────────────────────────────

type BatchItemStatus =
  | "sucesso"
  | "erro"
  | "duplicado"
  | "telefone_invalido"
  | "bloqueado_limite"
  | "devedor_nao_encontrado";

interface BatchItemResult {
  debtorId:    string;
  clientName:  string;
  phone:       string;
  status:      BatchItemStatus;
  messageId:   string | null;
  logId:       string | null;
  error:       string | null;
  sentWithPdf: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const okResponse  = (body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const errResponse = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const hashKey = async (raw: string): Promise<string> => {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
};

/** Encurta uma URL via Short.io API. Retorna a URL original em caso de falha. */
const shortenUrl = async (url: string): Promise<string> => {
  const apiKey = Deno.env.get("SHORTIO_API_KEY");
  const domain = Deno.env.get("SHORTIO_DOMAIN") ?? "ncfinance.s.gy";
  if (!apiKey) return url; // token não configurado — usa URL original

  try {
    const res = await fetch("https://api.short.io/links", {
      method: "POST",
      headers: {
        "authorization": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ originalURL: url, domain }),
      signal: AbortSignal.timeout(5_000),
    });
    if (res.ok) {
      const data = await res.json() as Record<string, unknown>;
      const short = (data.shortURL ?? data.secureShortURL) as string | undefined;
      if (short?.startsWith("https://")) return short;
    }
  } catch { /* ignore — usa URL original */ }
  return url;
};

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

    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) {
      return errResponse(401, { error: "Sessao invalida.", status: "nao_autenticado" });
    }
    const userId = user.id;

    // ── 2. Parse payload ───────────────────────────────────────────────────────
    let body: {
      debtorIds?: unknown;
      tone?: string;
      customMessage?: string;
      dryRun?: boolean;
      debtorPdfPaths?: Record<string, { path: string; name: string }> | null;
    };
    try {
      body = await request.json();
    } catch {
      return errResponse(400, { error: "Payload invalido (JSON esperado).", status: "payload_invalido" });
    }

    if (!Array.isArray(body.debtorIds) || body.debtorIds.length === 0) {
      return errResponse(400, {
        error: "Campo obrigatorio: debtorIds (array nao vazio).",
        status: "payload_invalido",
      });
    }

    // Sanitiza: apenas strings, sem duplicatas, hard cap
    const rawIds = [...new Set(
      (body.debtorIds as unknown[])
        .filter((id): id is string => typeof id === "string" && id.length > 0)
    )].slice(0, MAX_BATCH_SIZE);

    if (rawIds.length === 0) {
      return errResponse(400, { error: "Nenhum debtorId valido fornecido.", status: "payload_invalido" });
    }

    const tone           = typeof body.tone === "string" ? body.tone : "neutro";
    const customMessage  = typeof body.customMessage === "string" ? body.customMessage : null;
    const dryRun         = body.dryRun === true;
    // NOTE: debtorPdfPaths from the request body is intentionally IGNORED.
    // PDF storage paths are always derived server-side from the verified userId + debtorId
    // to prevent cross-user document access (IDOR vulnerability).

    // ── 3. Valida credenciais Z-API — número próprio (add-on) tem prioridade ─────
    // Lookup order: user_zapi_config → platform_integrations → env vars
    const zapiCreds = await loadZApiCredentialsForUser(admin, userId);
    if (!zapiCreds) {
      return errResponse(503, {
        error: "Z-API nao configurada na plataforma. Configure as credenciais no painel de integrações.",
        status: "zapi_nao_configurada",
      });
    }

    // ── 3b. Pilot-mode guard ──────────────────────────────────────────────────
    // Only runs if this tenant has a pilot_config row (non-pilot tenants pass through).
    const pilotResult = await checkPilotGuard(admin, userId);
    if (!pilotResult.ok && pilotResult.reason !== "config_ausente") {
      return errResponse(pilotResult.statusCode, {
        error:  pilotResult.message,
        status: pilotResult.reason,
      });
    }

    // Clamp rawIds to pilot remaining capacity (on top of plan limit)
    const pilotRemaining = pilotResult.ok ? pilotResult.remaining : Number.MAX_SAFE_INTEGER;

    // ── 4. Valida assinatura Stripe ────────────────────────────────────────────
    const subResult = await checkSubscription(admin, userId);
    if (!subResult.ok) {
      return errResponse(subResult.guard.statusCode, {
        error: subResult.guard.error,
        status: subResult.guard.kind,
      });
    }
    const { subscription } = subResult;

    // ── 5. Verifica plano (Basic bloqueado para lote) ─────────────────────────
    if (!BATCH_ALLOWED_PLANS.includes(subscription.plan)) {
      return errResponse(403, {
        error: "Envio em lote disponível apenas nos planos Pro e Premium. Faça upgrade para continuar.",
        status: "plano_sem_recurso",
        plan: subscription.plan,
      });
    }

    // ── 6. Lê snapshot de uso e calcula capacidade ────────────────────────────
    const usage = await getUsageSnapshot(admin, userId, subscription.plan);
    const { remaining } = usage;

    // Apply the stricter of plan limit vs pilot daily limit
    const effectiveLimit = Math.min(remaining, pilotRemaining);

    // Devedores que PODEM ser processados vs. que ficam bloqueados por limite
    const idsToProcess  = rawIds.slice(0, effectiveLimit);
    const idsOverLimit  = rawIds.slice(effectiveLimit);

    // ── 7. Busca devedores (apenas os que pertencem ao userId) ────────────────
    // Se idsToProcess estiver vazio por limite zerado, pularemos o loop abaixo
    const results: BatchItemResult[] = [];

    // Pré-popula resultados para os IDs acima do limite
    for (const id of idsOverLimit) {
      results.push({
        debtorId:    id,
        clientName:  "",
        phone:       "",
        status:      "bloqueado_limite",
        messageId:   null,
        logId:       null,
        error:       `Limite mensal atingido (${usage.chargesUsed}/${usage.planLimit} cobranças).`,
        sentWithPdf: false,
      });
    }

    // Contadores
    let successCount  = 0;
    let failedCount   = 0;
    let duplicateCount= 0;
    let invalidPhone  = 0;
    const today = new Date().toISOString().slice(0, 10);

    // ── Pre-fetch Drive access token once (for PDF attachment in loop) ────────
    // Non-blocking: if token unavailable, batch continues without attachments
    const driveAccessToken = await getDriveAccessToken().catch(() => null);

    // ── 7. Loop de envio ──────────────────────────────────────────────────────
    for (const debtorId of idsToProcess) {
      // a. Busca devedor — filtrado pelo userId (user_id = auth.uid() derivado)
      const { data: debtorRow } = await admin
        .from("user_registros_financeiros")
        .select(
          "id, client_name, document_number, due_date, amount, phone, " +
          "updated_value, category, drive_file_id, drive_file_url, drive_file_name",
        )
        .eq("id", debtorId)
        .eq("user_id", userId) // garante que o devedor pertence ao usuário
        .maybeSingle();

      if (!debtorRow) {
        results.push({
          debtorId,
          clientName:  "",
          phone:       "",
          status:      "devedor_nao_encontrado",
          messageId:   null,
          logId:       null,
          error:       "Devedor nao encontrado ou nao pertence a esta conta.",
          sentWithPdf: false,
        });
        continue;
      }

      const dr = debtorRow as Record<string, unknown>;
      const clientName    = String(dr.client_name   ?? "");
      const documentNumber= String(dr.document_number ?? "");
      const rawPhone      = String(dr.phone          ?? "");
      const dueDate       = String(dr.due_date       ?? "");
      const amount        = Number(dr.updated_value ?? dr.amount ?? 0);
      const driveFileId   = (dr.drive_file_id   as string | null) ?? null;
      const driveFileUrl  = (dr.drive_file_url  as string | null) ?? null;
      const driveFileName = (dr.drive_file_name as string | null) ?? null;

      // b. Normaliza e valida telefone
      const normalizedPhone = normalizePhone(rawPhone);
      if (!validatePhone(normalizedPhone)) {
        const logId = await insertBillingLog(admin, {
          userId, clientName, documentNumber,
          phone: rawPhone || "sem_telefone",
          amount,
          tone,
          message: "N/A",
          status: "telefone_invalido",
          type: "lote",
          provider: PROVIDER,
          // P2: do not log raw phone number in error message
          errorMessage: `Telefone invalido: tamanho=${rawPhone.replace(/\D/g, "").length}d`,
          debtorId,
        });

        results.push({
          debtorId, clientName, phone: rawPhone,
          status:      "telefone_invalido",
          messageId:   null, logId,
          error:       `Telefone invalido: ${rawPhone || "(vazio)"}`,
          sentWithPdf: false,
        });
        invalidPhone++;
        continue;
      }

      // c. Monta mensagem
      const message = buildMessage(
        { clientName, documentNumber, dueDate, amount, driveFileUrl, driveFileName },
        tone,
        customMessage,
      );

      // d. Idempotência: 5 minutos, baseada em userId+phone+hash_mensagem+data
      const idempotencyRaw  = `${userId}::${normalizedPhone}::${message.slice(0, 100)}::${today}`;
      const idempotencyHash = await hashKey(idempotencyRaw);
      const fiveMinutesAgo  = new Date(Date.now() - 5 * 60 * 1_000).toISOString();

      const { data: dupRow } = await admin
        .from("user_logs_cobranca")
        .select("id")
        .eq("user_id", userId)
        .eq("idempotency_key", idempotencyHash)
        .eq("status", "sucesso")
        .gte("created_at", fiveMinutesAgo)
        .maybeSingle();

      if (dupRow) {
        results.push({
          debtorId, clientName, phone: normalizedPhone,
          status:      "duplicado",
          messageId:   null,
          logId:       (dupRow as { id: string }).id,
          error:       "Envio duplicado detectado (janela de 5 min).",
          sentWithPdf: false,
        });
        duplicateCount++;
        continue;
      }

      // e. Envia (ou simula em dryRun)
      // Strategy: send a single text message. If the debtor has a PDF attached,
      // append the public storage URL to the message so the recipient can tap to
      // open/download the boleto PDF directly. This is the most reliable approach
      // because Z-API's send-document endpoint (URL or base64) does not deliver a
      // proper WhatsApp document on this plan/instance — it converts documents to a
      // plain-text reference instead.
      let zapiResult = { success: false, messageId: null as string | null, zaapId: null as string | null, error: "dryRun" };
      let sentWithPdf = false;

      // ── Resolve PDF storage path + build message with link ────────────────────
      // Path is always derived from the server-verified userId + debtorId.
      // Never trust caller-supplied paths (prevents IDOR cross-user document access).
      const pdfStoragePath = driveFileId === "uploaded"
        ? `${userId}/${debtorId}/boleto.${driveFileName?.split(".").pop() ?? "pdf"}`
        : null;

      // Build the final message: append short PDF link if available
      let finalMessage = message;
      if (pdfStoragePath) {
        const publicPdfUrl = `${SUPABASE_URL}/storage/v1/object/public/charge-pdfs/${pdfStoragePath}`;
        const shortUrl = await shortenUrl(publicPdfUrl);
        finalMessage = `${message}\n\n📎 Boleto: ${shortUrl}`;
        sentWithPdf = true; // link is included — recipient can access the PDF
        console.log(`[batch] PDF link appended for debtorId=${debtorId} short=${shortUrl}`);
      } else if (driveFileId && driveFileId !== "uploaded" && driveAccessToken) {
        // Legacy: Drive-matched PDF — no public URL, skip link but still try document send
        const pdfBytes = await downloadDriveFile(driveFileId, driveAccessToken).catch(() => null);
        if (pdfBytes && pdfBytes.length > 0 && !dryRun) {
          // Attempt document send for Drive PDFs (no public URL available for these)
          const pdfResult = await sendDocumentMessage({
            instanceId:    zapiCreds.instanceId,
            token:         zapiCreds.token,
            clientToken:   zapiCreds.clientToken,
            phone:         normalizedPhone,
            fileName:      driveFileName ?? "boleto.pdf",
            documentBytes: pdfBytes,
            caption:       null,
          });
          if (pdfResult.success) {
            sentWithPdf = true;
            console.log(`[batch] Drive PDF sent for debtorId=${debtorId}`);
          }
        }
      }

      if (!dryRun) {
        zapiResult = await sendTextMessage({
          instanceId:  zapiCreds.instanceId,
          token:       zapiCreds.token,
          clientToken: zapiCreds.clientToken,
          phone:       normalizedPhone,
          message:     finalMessage,
        });
        console.log(`[batch] text send debtorId=${debtorId} success=${zapiResult.success} withPdfLink=${sentWithPdf}`);
      } else {
        // dryRun: simula sucesso sem enviar
        zapiResult = { success: true, messageId: `dry-${debtorId.slice(0, 8)}`, zaapId: null, error: null };
      }

      const logStatus: string = zapiResult.success ? "sucesso" : "erro";
      console.log(`[batch] debtorId=${debtorId} status=${logStatus} sentWithPdf=${sentWithPdf}`);

      // f. Registra log individual
      // dryRun: NÃO grava idempotencyKey — evita bloquear envio real posterior.
      const logId = await insertBillingLog(admin, {
        userId, clientName, documentNumber,
        phone:            normalizedPhone,
        amount,
        tone,
        message,
        status:           logStatus,
        type:             "lote",
        provider:         PROVIDER,
        providerMessageId: zapiResult.messageId,
        errorMessage:     zapiResult.error,
        idempotencyKey:   dryRun ? null : idempotencyHash,
        debtorId,
      });

      results.push({
        debtorId, clientName, phone: normalizedPhone,
        status:      logStatus as BatchItemStatus,
        messageId:   zapiResult.messageId,
        logId,
        error:       zapiResult.error,
        sentWithPdf,
      });

      if (zapiResult.success) {
        successCount++;
      } else {
        failedCount++;
      }
    }

    // ── 8. Incrementa charges_sent e pilot counter com total de sucessos reais ──
    if (successCount > 0 && !dryRun) {
      await incrementChargesSent(admin, userId, usage, successCount);
      if (pilotResult.ok) {
        incrementPilotDailyCount(admin, userId, successCount).catch((e: unknown) => {
          console.error("[send-whatsapp-batch] pilot counter increment failed:", e instanceof Error ? e.message : String(e));
        });
      }
    }

    // ── 9. Retorna resumo sanitizado ──────────────────────────────────────────
    const totalProcessed = results.filter(
      r => r.status !== "bloqueado_limite",
    ).length;

    return okResponse({
      success:        true,
      status:         "completed",
      dryRun,
      totalRequested: rawIds.length,
      totalProcessed,
      sent:           successCount,
      failed:         failedCount,
      duplicated:     duplicateCount,
      invalidPhone,
      blockedLimit:   idsOverLimit.length,
      blockedPlan:    0,
      usageAfter:     dryRun ? usage.chargesUsed : usage.chargesUsed + successCount,
      usageLimit:     usage.planLimit,
      results,
    });

  } catch (err) {
    // P2: sanitize error — no PII in unhandled error logs
    console.error("[send-whatsapp-batch] unhandled:", sanitizeError(err instanceof Error ? err.message : String(err)));
    return errResponse(500, {
      error: "Erro interno. Tente novamente ou contate o suporte.",
      status: "erro_interno",
    });
  }
});
