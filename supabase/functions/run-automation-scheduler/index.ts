/**
 * run-automation-scheduler — cria jobs de disparo a partir das regras ativas.
 *
 * Chamada pelo pg_cron uma vez por dia (ex: 08:00 UTC).
 * Protegida por AUTOMATION_CRON_SECRET — não acessível publicamente.
 *
 * Fluxo por regra:
 *  1.  Verifica assinatura do usuário (trialing | active)
 *  2.  Verifica plano (Basic → skip)
 *  3.  Busca devedores candidatos conforme rule_type
 *  4.  Filtra candidatos que já têm job recente (últimas 20h) para a mesma regra
 *  5.  Respeita max_daily_sends (Premium)
 *  6.  Cria user_dispatch_jobs com status='queued' e scheduled_for adequado
 *  7.  Registra user_automation_runs
 *  8.  Atualiza last_run_at e next_run_at na regra
 *
 * Secrets: AUTOMATION_CRON_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "npm:@supabase/supabase-js@2.49.8";
import { corsHeaders } from "../_shared/cors.ts";

// ─── Env ──────────────────────────────────────────────────────────────────────

const SUPABASE_URL      = Deno.env.get("SUPABASE_URL")             || "";
const SERVICE_ROLE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const CRON_SECRET       = Deno.env.get("AUTOMATION_CRON_SECRET")    || "";

// ─── Plan gates ───────────────────────────────────────────────────────────────

const AUTOMATION_ALLOWED_PLANS = ["pro", "premium"];
const MAX_JOBS_PER_RULE        = 100;
const DEDUP_WINDOW_HOURS       = 20;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

type RuleRow = Record<string, unknown>;
type DebtorRow = Record<string, unknown>;

/** Calcula next_run_at: amanhã às 08:00 UTC */
const nextRunAt = (): string => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  d.setUTCHours(8, 0, 0, 0);
  return d.toISOString();
};

/** scheduled_for: respeita send_window_start ou usa now() */
const scheduledFor = (sendWindowStart: string | null): string => {
  if (!sendWindowStart) return new Date().toISOString();
  const [h, m] = sendWindowStart.split(":").map(Number);
  const d = new Date();
  d.setUTCHours(h, m ?? 0, 0, 0);
  // Se já passou, agenda para agora mesmo
  if (d < new Date()) return new Date().toISOString();
  return d.toISOString();
};

// ─── Process one rule ─────────────────────────────────────────────────────────

const processRule = async (rule: RuleRow): Promise<void> => {
  const ruleId   = String(rule.id);
  const userId   = String(rule.user_id);
  const ruleType = String(rule.rule_type);
  const tone     = String(rule.message_tone ?? "neutro");
  const maxDaily = rule.max_daily_sends ? Number(rule.max_daily_sends) : null;
  const winStart = (rule.send_window_start as string | null) ?? null;

  // Registra início do run
  const { data: runRow } = await admin
    .from("user_automation_runs")
    .insert({
      user_id:           userId,
      automation_rule_id: ruleId,
      status:            "running",
      started_at:        new Date().toISOString(),
    })
    .select("id")
    .single();

  const runId = (runRow as { id: string } | null)?.id ?? null;
  let totalCandidates = 0;
  let jobsCreated = 0;
  let jobsSkipped = 0;
  let runStatus: string = "success";

  try {
    // ── 1. Verifica assinatura ──────────────────────────────────────────────
    const { data: sub } = await admin
      .from("user_subscriptions")
      .select("status, plan")
      .eq("user_id", userId)
      .maybeSingle();

    if (!sub || !["trialing", "active"].includes(String(sub.status))) {
      runStatus = "error";
      await finalizeRun(runId, runStatus, 0, 0, 0, { reason: "blocked_subscription" });
      await updateRule(ruleId);
      return;
    }

    // ── 2. Verifica plano ───────────────────────────────────────────────────
    if (!AUTOMATION_ALLOWED_PLANS.includes(String(sub.plan))) {
      runStatus = "error";
      await finalizeRun(runId, runStatus, 0, 0, 0, { reason: "blocked_plan", plan: sub.plan });
      await updateRule(ruleId);
      return;
    }

    // ── 3. Busca devedores candidatos ───────────────────────────────────────
    const today = new Date().toISOString().slice(0, 10);
    let debtorQuery = admin
      .from("user_registros_financeiros")
      .select("id, client_name, document_number, due_date, amount, updated_value, phone, drive_file_url, drive_file_name, category, status")
      .eq("user_id", userId)
      .neq("status", "sent")            // não cobrar quem já foi marcado como enviado
      // NUNCA cobrar liquidados (já pagos) nem clientes desabilitados
      .or("category.is.null,category.not.in.(liquidado,desabilitado)")
      .neq("status", "liquidado");      // rede de segurança caso o status marque liquidação

    // A regra segue a CATEGORIA (tipo) do devedor, não só a data. Assim, se o
    // usuário move um cliente para "vencidos", as regras de "a vencer" deixam
    // de cobrá-lo (e vice-versa) — respeitando o tipo atual do cliente.
    if (ruleType === "overdue") {
      // Vencidos: todos os devedores marcados como vencidos
      debtorQuery = debtorQuery.eq("category", "vencidos");
    } else if (ruleType === "due_today") {
      // Vencem hoje: a_vencer com vencimento = hoje
      debtorQuery = debtorQuery.eq("category", "a_vencer").eq("due_date", today);
    } else if (ruleType === "due_in_days") {
      // Vencem em X dias: a_vencer com vencimento = hoje + X
      const daysBefore = Number(rule.days_before_due ?? 1);
      const targetDate = new Date();
      targetDate.setUTCDate(targetDate.getUTCDate() + daysBefore);
      const target = targetDate.toISOString().slice(0, 10);
      debtorQuery = debtorQuery.eq("category", "a_vencer").eq("due_date", target);
    } else {
      runStatus = "error";
      await finalizeRun(runId, runStatus, 0, 0, 0, { reason: "unknown_rule_type", ruleType });
      await updateRule(ruleId);
      return;
    }

    const { data: candidates } = await debtorQuery.limit(MAX_JOBS_PER_RULE);
    totalCandidates = (candidates ?? []).length;

    if (totalCandidates === 0) {
      runStatus = "success";
      await finalizeRun(runId, runStatus, 0, 0, 0, { note: "no_candidates" });
      await updateRule(ruleId);
      return;
    }

    // ── 4. Filtra devedores com job recente para esta regra ─────────────────
    const dedupeWindow = new Date(Date.now() - DEDUP_WINDOW_HOURS * 60 * 60 * 1_000).toISOString();
    const { data: recentJobs } = await admin
      .from("user_dispatch_jobs")
      .select("debtor_id")
      .eq("automation_rule_id", ruleId)
      .gte("created_at", dedupeWindow)
      .not("status", "in", '("failed","skipped")');

    const recentDebtorSet = new Set(
      ((recentJobs ?? []) as Array<{ debtor_id: string }>).map(j => j.debtor_id),
    );

    // ── 5. Aplica max_daily_sends ───────────────────────────────────────────
    const eligible = (candidates ?? [] as DebtorRow[]).filter(
      (d: DebtorRow) =>
        !recentDebtorSet.has(String(d.id)) &&
        // Defesa em profundidade: nunca cobrar liquidados (já pagos) nem desabilitados
        d.category !== "liquidado" &&
        d.category !== "desabilitado" &&
        d.status !== "liquidado",
    );
    const limited = maxDaily ? eligible.slice(0, maxDaily) : eligible;
    jobsSkipped = totalCandidates - limited.length;

    // ── 6. Cria jobs ────────────────────────────────────────────────────────
    const schedFor = scheduledFor(winStart);
    const jobRowsBase = limited.map((d: DebtorRow) => ({
      user_id:            userId,
      automation_rule_id: ruleId,
      debtor_id:          String(d.id),
      status:             "queued",
      scheduled_for:      schedFor,
      attempts:           0,
      max_attempts:       3,
      metadata: {
        client_name:     d.client_name,
        document_number: d.document_number,
        tone,
        rule_type:       ruleType,
        plan:            sub.plan,
      },
    }));
    // Liga cada job à execução (run) para o worker contabilizar "Enviados".
    const jobRows = jobRowsBase.map((r) => ({ ...r, automation_run_id: runId }));

    if (jobRows.length > 0) {
      const { error: insErr } = await admin.from("user_dispatch_jobs").insert(jobRows);
      if (insErr) {
        // Fallback: coluna automation_run_id ainda não existe (migração pendente)
        await admin.from("user_dispatch_jobs").insert(jobRowsBase);
      }
      jobsCreated = jobRows.length;
    }

    runStatus = "success";
  } catch (err) {
    console.error(`[scheduler] rule ${ruleId} error:`, err);
    runStatus = "error";
  } finally {
    await finalizeRun(runId, runStatus, totalCandidates, jobsCreated, jobsSkipped, {});
    await updateRule(ruleId);
  }
};

const finalizeRun = async (
  runId: string | null,
  status: string,
  total: number,
  created: number,
  skipped: number,
  meta: Record<string, unknown>,
): Promise<void> => {
  if (!runId) return;
  await admin
    .from("user_automation_runs")
    .update({
      status,
      total_candidates: total,
      jobs_created:     created,
      jobs_skipped:     skipped,
      metadata:         meta,
      finished_at:      new Date().toISOString(),
    })
    .eq("id", runId);
};

const updateRule = async (ruleId: string): Promise<void> => {
  await admin
    .from("user_automation_rules")
    .update({
      last_run_at: new Date().toISOString(),
      next_run_at: nextRunAt(),
      updated_at:  new Date().toISOString(),
    })
    .eq("id", ruleId);
};

// ─── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // ── Segurança: valida cron secret ──────────────────────────────────────────
  const authHeader = request.headers.get("Authorization") ?? "";
  const providedSecret = authHeader.replace("Bearer ", "").trim();

  if (!CRON_SECRET || providedSecret !== CRON_SECRET) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const now = new Date().toISOString();

    // Busca todas as regras ativas com next_run_at vencido
    const { data: rules, error } = await admin
      .from("user_automation_rules")
      .select("*")
      .eq("enabled", true)
      .or(`next_run_at.is.null,next_run_at.lte.${now}`);

    if (error) throw error;

    const ruleList = (rules ?? []) as RuleRow[];
    let processed = 0;

    for (const rule of ruleList) {
      await processRule(rule);
      processed++;
    }

    return new Response(
      JSON.stringify({ success: true, rulesProcessed: processed, timestamp: now }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[run-automation-scheduler] unhandled:", err);
    return new Response(
      JSON.stringify({ error: "Erro interno no scheduler." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
