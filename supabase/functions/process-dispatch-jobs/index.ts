/**
 * process-dispatch-jobs — worker que processa a fila de jobs de disparo.
 *
 * Chamada pelo pg_cron a cada 5 minutos.
 * Protegida por AUTOMATION_CRON_SECRET.
 *
 * Por job:
 *  1. Claim atômico (UPDATE status='processing' WHERE status IN ('queued','retrying'))
 *  2. Valida assinatura/plano/limite
 *  3. Verifica janela de envio da regra (Premium)
 *  4. Busca devedor
 *  5. Valida telefone
 *  6. Verifica idempotência (5 min)
 *  7. Monta mensagem (com PDF link se disponível)
 *  8. Envia via Z-API global
 *  9. Registra log em user_logs_cobranca
 * 10. Incrementa charges_sent em sucesso
 * 11. Atualiza job (success | failed | retrying | skipped | blocked_*)
 *
 * Retry backoff: 5 min → 15 min → 60 min → failed
 *
 * Secrets: AUTOMATION_CRON_SECRET, ZAPI_INSTANCE_ID, ZAPI_TOKEN, ZAPI_CLIENT_TOKEN,
 *          SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient }                          from "npm:@supabase/supabase-js@2.49.8";
import { corsHeaders }                           from "../_shared/cors.ts";
import { normalizePhone, validatePhone, sendTextMessage } from "../_shared/zapi.ts";
import { checkSubscription }                     from "../_shared/subscriptionGuard.ts";
import { getUsageSnapshot, incrementChargesSent, getPlanLimit } from "../_shared/usageGuard.ts";
import { insertBillingLog }                      from "../_shared/billingLog.ts";
import { buildMessage }                          from "../_shared/messageBuilder.ts";
import { loadZApiCredentialsForUser }             from "../_shared/platformIntegrations.ts";
import { sanitizeError }                         from "../_shared/sanitize.ts";

// ─── Env ──────────────────────────────────────────────────────────────────────

const SUPABASE_URL       = Deno.env.get("SUPABASE_URL")             || "";
const SERVICE_ROLE_KEY   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const CRON_SECRET        = Deno.env.get("AUTOMATION_CRON_SECRET")    || "";

// ─── Short.io helper ──────────────────────────────────────────────────────────

/** Encurta URL via Short.io. Em caso de falha retorna a URL original. */
const shortenUrl = async (url: string): Promise<string> => {
  const apiKey = Deno.env.get("SHORTIO_API_KEY");
  const domain = Deno.env.get("SHORTIO_DOMAIN") ?? "ncfinance.s.gy";
  if (!apiKey) return url;
  try {
    const res = await fetch("https://api.short.io/links", {
      method: "POST",
      headers: { "authorization": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ originalURL: url, domain }),
    });
    if (!res.ok) return url;
    const json = await res.json() as { shortURL?: string };
    return json.shortURL ?? url;
  } catch {
    return url;
  }
};
// Z-API credentials loaded dynamically via loadZApiCredentials() — not hardcoded

// ─── Constants ────────────────────────────────────────────────────────────────

const JOBS_PER_TICK        = 50;          // jobs processados por invocação
const RETRY_DELAYS_MIN     = [5, 15, 60]; // backoff em minutos por tentativa
const AUTOMATION_PLANS     = ["pro", "premium"];
const PROVIDER             = "zapi";

// ─── Admin client (service role) ──────────────────────────────────────────────

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// ─── SHA-256 helper ───────────────────────────────────────────────────────────

const hashKey = async (raw: string): Promise<string> => {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
};

// ─── Process one job ──────────────────────────────────────────────────────────

const processJob = async (job: Record<string, unknown>): Promise<void> => {
  const jobId    = String(job.id);
  const userId   = String(job.user_id);
  const debtorId = String(job.debtor_id);
  const ruleId   = (job.automation_rule_id as string | null) ?? null;
  const attempts = Number(job.attempts ?? 0);
  const maxAttempts = Number(job.max_attempts ?? 3);
  const meta     = (job.metadata as Record<string, unknown>) ?? {};
  const tone     = String(meta.tone ?? "neutro");

  // ── Claim atômico ────────────────────────────────────────────────────────
  const { data: claimed } = await admin
    .from("user_dispatch_jobs")
    .update({ status: "processing", updated_at: new Date().toISOString() })
    .eq("id", jobId)
    .in("status", ["queued", "retrying"])
    .select("id")
    .maybeSingle();

  if (!claimed) return; // Outro worker já processou

  const markJob = async (
    status: string,
    extras: Record<string, unknown> = {},
  ) => {
    await admin
      .from("user_dispatch_jobs")
      .update({ status, updated_at: new Date().toISOString(), ...extras })
      .eq("id", jobId);
  };

  try {
    // ── 1. Carrega credenciais Z-API — número próprio (add-on) tem prioridade ──
    // Lookup: user_zapi_config → platform_integrations → env vars
    const zapiCreds = await loadZApiCredentialsForUser(admin, userId);
    if (!zapiCreds) {
      await markJob("failed", { last_error: "Z-API nao configurada (platform_integrations ausente)." });
      return;
    }

    // ── 2. Valida assinatura ──────────────────────────────────────────────
    const subResult = await checkSubscription(admin, userId);
    if (!subResult.ok) {
      await markJob("blocked_subscription", { last_error: subResult.guard.error });
      return;
    }
    const { subscription } = subResult;

    // ── 3. Verifica plano ─────────────────────────────────────────────────
    if (!AUTOMATION_PLANS.includes(subscription.plan)) {
      await markJob("skipped", { last_error: "Plano nao autoriza automacao." });
      return;
    }

    // ── 4. Verifica janela de envio (se regra tiver configuração) ─────────
    if (ruleId) {
      const { data: rule } = await admin
        .from("user_automation_rules")
        .select("send_window_start, send_window_end, enabled")
        .eq("id", ruleId)
        .maybeSingle();

      const r = rule as Record<string, unknown> | null;
      if (r && r.enabled === false) {
        await markJob("skipped", { last_error: "Regra desativada." });
        return;
      }

      if (r?.send_window_start && r?.send_window_end) {
        const now = new Date();
        const hhmm = `${String(now.getUTCHours()).padStart(2, "0")}:${String(now.getUTCMinutes()).padStart(2, "0")}`;
        const start = String(r.send_window_start).slice(0, 5);
        const end   = String(r.send_window_end).slice(0, 5);
        if (hhmm < start || hhmm > end) {
          // Fora da janela: recoloca em queued com próximo scheduled_for no início da janela
          const [sh, sm] = start.split(":").map(Number);
          const nextWindow = new Date();
          nextWindow.setUTCHours(sh, sm ?? 0, 0, 0);
          if (nextWindow <= new Date()) nextWindow.setUTCDate(nextWindow.getUTCDate() + 1);
          await admin
            .from("user_dispatch_jobs")
            .update({ status: "queued", scheduled_for: nextWindow.toISOString(), updated_at: new Date().toISOString() })
            .eq("id", jobId);
          return;
        }
      }
    }

    // ── 5. Valida limite mensal ────────────────────────────────────────────
    const usage = await getUsageSnapshot(admin, userId, subscription.plan);
    if (usage.remaining <= 0) {
      await markJob("blocked_limit", {
        last_error: `Limite mensal atingido (${usage.chargesUsed}/${usage.planLimit}).`,
      });
      return;
    }

    // ── 6. Busca devedor ──────────────────────────────────────────────────
    const { data: debtorRow } = await admin
      .from("user_registros_financeiros")
      .select("id, client_name, document_number, due_date, amount, updated_value, phone, drive_file_url, drive_file_name")
      .eq("id", debtorId)
      .eq("user_id", userId)
      .maybeSingle();

    if (!debtorRow) {
      await markJob("skipped", { last_error: "Devedor nao encontrado." });
      return;
    }

    const dr = debtorRow as Record<string, unknown>;
    const clientName    = String(dr.client_name    ?? "");
    const documentNumber= String(dr.document_number?? "");
    const rawPhone      = String(dr.phone          ?? "");
    const dueDate       = String(dr.due_date       ?? "");
    const amount        = Number(dr.updated_value  ?? dr.amount ?? 0);
    const driveFileUrl  = (dr.drive_file_url  as string | null) ?? null;
    const driveFileName = (dr.drive_file_name as string | null) ?? null;
    const customMsg     = (meta.custom_message as string | null) ?? null;

    // ── 7. Valida telefone ────────────────────────────────────────────────
    const normalizedPhone = normalizePhone(rawPhone);
    if (!validatePhone(normalizedPhone)) {
      const logId = await insertBillingLog(admin, {
        userId, clientName, documentNumber,
        phone: rawPhone || "sem_telefone",
        amount, tone, message: "N/A",
        status: "telefone_invalido", type: "lote", provider: PROVIDER,
        errorMessage: `Tel invalido: "${rawPhone}"`, debtorId,
      });
      await markJob("failed", {
        last_error: `Telefone invalido: ${rawPhone}`,
        provider_message_id: logId,
        attempts: attempts + 1,
      });
      return;
    }

    // ── 8. Monta mensagem (+ link do boleto PDF se disponível) ───────────
    let message = buildMessage(
      { clientName, documentNumber, dueDate, amount, driveFileUrl, driveFileName },
      tone,
      customMsg,
    );

    if (driveFileUrl) {
      const shortPdfUrl = await shortenUrl(driveFileUrl);
      message = `${message}\n\n📎 Boleto: ${shortPdfUrl}`;
      console.log(`[dispatch] PDF link appended for debtorId=${debtorId} url=${shortPdfUrl}`);
    }

    // ── 9. Idempotência (5 min) ───────────────────────────────────────────
    const today = new Date().toISOString().slice(0, 10);
    const idemRaw  = `${userId}::${normalizedPhone}::${message.slice(0, 100)}::${today}`;
    const idemHash = await hashKey(idemRaw);
    const fiveMin  = new Date(Date.now() - 5 * 60 * 1_000).toISOString();

    const { data: dupLog } = await admin
      .from("user_logs_cobranca")
      .select("id")
      .eq("user_id", userId)
      .eq("idempotency_key", idemHash)
      .eq("status", "sucesso")
      .gte("created_at", fiveMin)
      .maybeSingle();

    if (dupLog) {
      await markJob("duplicated", { last_error: "Envio duplicado em 5min.", attempts: attempts + 1 });
      return;
    }

    // ── 10. Envia via Z-API (credenciais de platform_integrations) ───────────
    const zapiResult = await sendTextMessage({
      instanceId:  zapiCreds.instanceId,
      token:       zapiCreds.token,
      clientToken: zapiCreds.clientToken,
      phone:       normalizedPhone,
      message,
    });

    const logStatus = zapiResult.success ? "sucesso" : "erro";

    // ── 11. Registra log ──────────────────────────────────────────────────
    await insertBillingLog(admin, {
      userId, clientName, documentNumber,
      phone: normalizedPhone, amount, tone, message,
      status: logStatus, type: "lote", provider: PROVIDER,
      providerMessageId: zapiResult.messageId,
      errorMessage: zapiResult.error,
      idempotencyKey: idemHash,
      debtorId,
    });

    // ── 12. Incrementa usage em sucesso ───────────────────────────────────
    if (zapiResult.success) {
      await incrementChargesSent(admin, userId, usage, 1);
      await markJob("success", {
        provider_message_id: zapiResult.messageId,
        attempts: attempts + 1,
      });
    } else {
      // ── 13. Retry ou falha definitiva ─────────────────────────────────
      const newAttempts = attempts + 1;
      if (newAttempts >= maxAttempts) {
        await markJob("failed", {
          last_error: zapiResult.error ?? "Max tentativas atingido.",
          attempts:   newAttempts,
        });
      } else {
        const delayMin = RETRY_DELAYS_MIN[newAttempts - 1] ?? 60;
        const nextScheduled = new Date(Date.now() + delayMin * 60 * 1_000).toISOString();
        await admin
          .from("user_dispatch_jobs")
          .update({
            status:        "retrying",
            attempts:      newAttempts,
            last_error:    zapiResult.error,
            scheduled_for: nextScheduled,
            updated_at:    new Date().toISOString(),
          })
          .eq("id", jobId);
      }
    }
  } catch (err) {
    // P2: sanitize error before logging — no PII in logs
    console.error(`[worker] job ${jobId} unhandled: ${sanitizeError(err instanceof Error ? err.message : String(err))}`);
    const newAttempts = attempts + 1;
    if (newAttempts >= maxAttempts) {
      await markJob("failed", {
        last_error: err instanceof Error ? err.message.slice(0, 500) : "Erro desconhecido.",
        attempts:   newAttempts,
      });
    } else {
      const delayMin = RETRY_DELAYS_MIN[newAttempts - 1] ?? 60;
      await admin
        .from("user_dispatch_jobs")
        .update({
          status:        "retrying",
          attempts:      newAttempts,
          last_error:    err instanceof Error ? err.message.slice(0, 500) : "Erro desconhecido.",
          scheduled_for: new Date(Date.now() + delayMin * 60 * 1_000).toISOString(),
          updated_at:    new Date().toISOString(),
        })
        .eq("id", jobId);
    }
  }
};

// ─── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // ── Segurança ─────────────────────────────────────────────────────────────
  const auth = request.headers.get("Authorization") ?? "";
  if (!CRON_SECRET || auth.replace("Bearer ", "").trim() !== CRON_SECRET) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const now = new Date().toISOString();

    // Busca jobs elegíveis (queued ou retrying com scheduled_for vencido)
    const { data: jobs, error } = await admin
      .from("user_dispatch_jobs")
      .select("*")
      .in("status", ["queued", "retrying"])
      .lte("scheduled_for", now)
      .order("scheduled_for", { ascending: true })
      .limit(JOBS_PER_TICK);

    if (error) throw error;

    const jobList = (jobs ?? []) as Array<Record<string, unknown>>;
    let processed = 0;

    for (const job of jobList) {
      await processJob(job);
      processed++;
    }

    // Atualiza sent/failed em user_automation_runs para runs em andamento
    // (simplificado: runs ficam com sent/failed=0; os logs reais estão em user_logs_cobranca)

    // ── Rede de segurança: re-ignita indexações de boleto do Drive travadas ────
    // A indexação roda via auto-encadeamento (EdgeRuntime.waitUntil). Se um elo
    // da cadeia falhar (rede), ela para. Aqui, a cada tick, redisparamos o
    // "continue" para pastas com conteúdo ainda pendente — convergência garantida.
    let driveResumed = 0;
    try {
      const { data: pendingIdx } = await admin
        .from("user_drive_index")
        .select("user_id, folder_id")
        .eq("metadata_extraction_attempted", false)
        .limit(1000);

      if (pendingIdx && pendingIdx.length) {
        const seen = new Set<string>();
        const pairs: Array<{ user_id: string; folder_id: string }> = [];
        for (const r of pendingIdx as Array<{ user_id: string; folder_id: string }>) {
          const key = `${r.user_id}|${r.folder_id}`;
          if (!seen.has(key)) { seen.add(key); pairs.push(r); }
        }
        const toKick = pairs.slice(0, 20); // limite por tick
        await Promise.allSettled(
          toKick.map((p) =>
            fetch(`${SUPABASE_URL}/functions/v1/drive-index-folder`, {
              method: "POST",
              headers: { "Authorization": `Bearer ${CRON_SECRET}`, "Content-Type": "application/json" },
              body: JSON.stringify({ action: "continue", userId: p.user_id, folderId: p.folder_id }),
            }),
          ),
        );
        driveResumed = toKick.length;
      }
    } catch (e) {
      console.error("[process-dispatch-jobs] drive resume error:", e instanceof Error ? e.message : String(e));
    }

    return new Response(
      JSON.stringify({ success: true, jobsProcessed: processed, driveResumed, timestamp: now }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[process-dispatch-jobs] unhandled:", err);
    return new Response(
      JSON.stringify({ error: "Erro interno no worker." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
