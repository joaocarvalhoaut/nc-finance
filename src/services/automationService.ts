/**
 * automationService — CRUD de regras de automação e leitura de histórico.
 * Frontend-safe: sem credenciais. RLS garante isolamento por user_id.
 */

import { getSupabaseClient } from "./supabaseClient";

// ─── Types ────────────────────────────────────────────────────────────────────

export type RuleType = "overdue" | "due_today" | "due_in_days";
export type MessageTone = "amigavel" | "neutro" | "firme" | "juridico";

export interface AutomationRule {
  id: string;
  userId?: string;
  name: string;
  enabled: boolean;
  ruleType: RuleType;
  daysBefore: number | null;
  messageTone: MessageTone;
  customMessage: string | null;
  sendWindowStart: string | null;   // "HH:MM"
  sendWindowEnd:   string | null;   // "HH:MM"
  maxDailySends:   number | null;
  lastRunAt:       string | null;
  nextRunAt:       string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface AutomationRuleCreate {
  name: string;
  ruleType: RuleType;
  daysBefore?: number | null;
  messageTone?: MessageTone;
  customMessage?: string | null;
  sendWindowStart?: string | null;
  sendWindowEnd?:   string | null;
  maxDailySends?:   number | null;
}

export interface AutomationRun {
  id: string;
  automationRuleId: string | null;
  status: string;
  totalCandidates: number;
  jobsCreated: number;
  jobsSkipped: number;
  sent: number;
  failed: number;
  metadata: Record<string, unknown>;
  startedAt: string;
  finishedAt: string | null;
}

export interface DispatchJob {
  id: string;
  automationRuleId: string | null;
  debtorId: string;
  status: string;
  scheduledFor: string;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  providerMessageId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

// ─── Mappers ──────────────────────────────────────────────────────────────────

type RuleRow = Record<string, unknown>;

const mapRule = (r: RuleRow): AutomationRule => ({
  id:              String(r.id),
  userId:          r.user_id ? String(r.user_id) : undefined,
  name:            String(r.name ?? ""),
  enabled:         Boolean(r.enabled),
  ruleType:        String(r.rule_type ?? "overdue") as RuleType,
  daysBefore:      r.days_before_due != null ? Number(r.days_before_due) : null,
  messageTone:     String(r.message_tone ?? "neutro") as MessageTone,
  customMessage:   (r.custom_message as string | null) ?? null,
  sendWindowStart: (r.send_window_start as string | null)?.slice(0, 5) ?? null,
  sendWindowEnd:   (r.send_window_end   as string | null)?.slice(0, 5) ?? null,
  maxDailySends:   r.max_daily_sends != null ? Number(r.max_daily_sends) : null,
  lastRunAt:       (r.last_run_at  as string | null) ?? null,
  nextRunAt:       (r.next_run_at  as string | null) ?? null,
  createdAt:       r.created_at ? String(r.created_at) : undefined,
  updatedAt:       r.updated_at ? String(r.updated_at) : undefined,
});

type RunRow = Record<string, unknown>;
const mapRun = (r: RunRow): AutomationRun => ({
  id:               String(r.id),
  automationRuleId: r.automation_rule_id ? String(r.automation_rule_id) : null,
  status:           String(r.status ?? ""),
  totalCandidates:  Number(r.total_candidates  ?? 0),
  jobsCreated:      Number(r.jobs_created      ?? 0),
  jobsSkipped:      Number(r.jobs_skipped      ?? 0),
  sent:             Number(r.sent              ?? 0),
  failed:           Number(r.failed            ?? 0),
  metadata:         (r.metadata as Record<string, unknown>) ?? {},
  startedAt:        String(r.started_at  ?? ""),
  finishedAt:       (r.finished_at as string | null) ?? null,
});

type JobRow = Record<string, unknown>;
const mapJob = (j: JobRow): DispatchJob => ({
  id:                String(j.id),
  automationRuleId:  j.automation_rule_id ? String(j.automation_rule_id) : null,
  debtorId:          String(j.debtor_id ?? ""),
  status:            String(j.status ?? ""),
  scheduledFor:      String(j.scheduled_for ?? ""),
  attempts:          Number(j.attempts ?? 0),
  maxAttempts:       Number(j.max_attempts ?? 3),
  lastError:         (j.last_error as string | null) ?? null,
  providerMessageId: (j.provider_message_id as string | null) ?? null,
  metadata:          (j.metadata as Record<string, unknown>) ?? {},
  createdAt:         String(j.created_at ?? ""),
  updatedAt:         String(j.updated_at ?? ""),
});

// ─── Service ──────────────────────────────────────────────────────────────────

export const automationService = {
  // ── Rules ──────────────────────────────────────────────────────────────────

  async listRules(): Promise<AutomationRule[]> {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("user_automation_rules")
      .select("*")
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map(r => mapRule(r as RuleRow));
  },

  async createRule(payload: AutomationRuleCreate): Promise<AutomationRule> {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("user_automation_rules")
      .insert({
        name:              payload.name,
        rule_type:         payload.ruleType,
        days_before_due:   payload.daysBefore    ?? null,
        message_tone:      payload.messageTone   ?? "neutro",
        custom_message:    payload.customMessage ?? null,
        send_window_start: payload.sendWindowStart ?? null,
        send_window_end:   payload.sendWindowEnd   ?? null,
        max_daily_sends:   payload.maxDailySends   ?? null,
        enabled:           true,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return mapRule(data as RuleRow);
  },

  async toggleRule(id: string, enabled: boolean): Promise<void> {
    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from("user_automation_rules")
      .update({ enabled, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw new Error(error.message);
  },

  async deleteRule(id: string): Promise<void> {
    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from("user_automation_rules")
      .delete()
      .eq("id", id);
    if (error) throw new Error(error.message);
  },

  async updateRule(
    id: string,
    patch: Partial<AutomationRuleCreate & { enabled: boolean }>,
  ): Promise<void> {
    const supabase = getSupabaseClient();
    const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.name             !== undefined) row.name              = patch.name;
    if (patch.ruleType         !== undefined) row.rule_type         = patch.ruleType;
    if (patch.daysBefore       !== undefined) row.days_before_due   = patch.daysBefore;
    if (patch.messageTone      !== undefined) row.message_tone      = patch.messageTone;
    if (patch.customMessage    !== undefined) row.custom_message    = patch.customMessage;
    if (patch.sendWindowStart  !== undefined) row.send_window_start = patch.sendWindowStart;
    if (patch.sendWindowEnd    !== undefined) row.send_window_end   = patch.sendWindowEnd;
    if (patch.maxDailySends    !== undefined) row.max_daily_sends   = patch.maxDailySends;
    if (patch.enabled          !== undefined) row.enabled           = patch.enabled;
    const { error } = await supabase.from("user_automation_rules").update(row).eq("id", id);
    if (error) throw new Error(error.message);
  },

  // ── Runs ───────────────────────────────────────────────────────────────────

  async listRuns(limit = 20): Promise<AutomationRun[]> {
    const supabase = getSupabaseClient();
    const { data } = await supabase
      .from("user_automation_runs")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(limit);
    return (data ?? []).map(r => mapRun(r as RunRow));
  },

  // ── Jobs ───────────────────────────────────────────────────────────────────

  async listJobs(limit = 30, ruleId?: string): Promise<DispatchJob[]> {
    const supabase = getSupabaseClient();
    let q = supabase
      .from("user_dispatch_jobs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (ruleId) q = q.eq("automation_rule_id", ruleId);
    const { data } = await q;
    return (data ?? []).map(j => mapJob(j as JobRow));
  },
};

// ─── Labels ───────────────────────────────────────────────────────────────────

export const RULE_TYPE_LABELS: Record<RuleType, string> = {
  overdue:     "Vencidos",
  due_today:   "Vencem hoje",
  due_in_days: "Vencem em X dias",
};

export const JOB_STATUS_COLORS: Record<string, string> = {
  queued:               "text-zinc-400",
  processing:           "text-amber-400",
  success:              "text-emerald-400",
  failed:               "text-rose-400",
  retrying:             "text-amber-300",
  skipped:              "text-zinc-500",
  duplicated:           "text-zinc-400",
  blocked_limit:        "text-orange-400",
  blocked_subscription: "text-rose-300",
};
