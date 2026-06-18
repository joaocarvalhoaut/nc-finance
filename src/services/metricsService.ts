/**
 * metricsService — agrega dados operacionais do dashboard por user_id.
 * Lê tabelas reais via cliente autenticado (RLS garante isolamento).
 * Nenhuma credencial é exposta — usa apenas VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.
 */

import { getSupabaseClient } from "./supabaseClient";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ImportLogEntry {
  id: string;
  provider: string;
  status: string;
  rowsTotal: number;
  rowsImported: number;
  rowsSkipped: number;
  errorMessage: string | null;
  createdAt: string;
}

export interface DriveMatchEntry {
  id: string;
  filesFound: number;
  debtorsMatched: number;
  debtorsTotal: number;
  status: string;
  errorMessage: string | null;
  createdAt: string;
}

export interface AutomationRunEntry {
  id: string;
  status: string;
  totalCandidates: number;
  jobsCreated: number;
  jobsSkipped: number;
  sent: number;
  failed: number;
  startedAt: string;
  finishedAt: string | null;
}

export interface BillingErrorEntry {
  id: string;
  clientName: string;
  documentNumber: string;
  phone: string;
  status: string;
  createdAt: string;
}

export interface UsageSnapshot {
  chargesUsed: number;
  sheetsImports: number;
  driveLookups: number;
  planLimit: number;
  remaining: number;
  period: string;
}

export interface OperationalMetrics {
  recentImports: ImportLogEntry[];
  recentDriveMatches: DriveMatchEntry[];
  recentAutomationRuns: AutomationRunEntry[];
  recentErrors: BillingErrorEntry[];
  usageThisMonth: UsageSnapshot | null;
  successRateThisMonth: number;   // 0-100
  totalSentThisMonth: number;
  totalFailedThisMonth: number;
  activeJobsInQueue: number;
  loadedAt: string;
}

type Row = Record<string, unknown>;

// ─── Helpers ─────────────────────────────────────────────────────────────────

const str   = (v: unknown) => (v != null ? String(v) : "");
const num   = (v: unknown) => (v != null ? Number(v) : 0);

const currentPeriod = (): string => {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

// ─── Service ─────────────────────────────────────────────────────────────────

export const metricsService = {
  async load(planLimit: number): Promise<OperationalMetrics> {
    const supabase = getSupabaseClient();
    const period = currentPeriod();

    const [importsRes, driveRes, runsRes, errorsRes, usageRes, logsTotalRes, logsSuccessRes, logsFailedRes, jobsRes] =
      await Promise.allSettled([
        // Recent import logs (last 8)
        supabase
          .from("user_import_logs")
          .select("id, provider, status, rows_total, rows_imported, rows_skipped, error_message, created_at")
          .order("created_at", { ascending: false })
          .limit(8),

        // Recent drive match logs (last 5)
        supabase
          .from("user_drive_match_logs")
          .select("id, files_found, debtors_matched, debtors_total, status, error_message, created_at")
          .order("created_at", { ascending: false })
          .limit(5),

        // Recent automation runs (last 8)
        supabase
          .from("user_automation_runs")
          .select("id, status, total_candidates, jobs_created, jobs_skipped, sent, failed, started_at, finished_at")
          .order("started_at", { ascending: false })
          .limit(8),

        // Recent billing errors (last 5 failed/invalid)
        supabase
          .from("user_logs_cobranca")
          .select("id, client_name, document_number, phone, status, created_at")
          .in("status", ["erro", "telefone_invalido", "duplicado"])
          .order("created_at", { ascending: false })
          .limit(5),

        // Usage counters this month
        supabase
          .from("user_usage_counters")
          .select("charges_sent, sheets_imports, drive_lookups, period")
          .eq("period", period)
          .maybeSingle(),

        // Billing logs this month — contagens exatas (head count, sem cap de linhas)
        supabase
          .from("user_logs_cobranca")
          .select("id", { count: "exact", head: true })
          .gte("created_at", `${period}-01T00:00:00Z`),
        supabase
          .from("user_logs_cobranca")
          .select("id", { count: "exact", head: true })
          .eq("status", "sucesso")
          .gte("created_at", `${period}-01T00:00:00Z`),
        supabase
          .from("user_logs_cobranca")
          .select("id", { count: "exact", head: true })
          .eq("status", "erro")
          .gte("created_at", `${period}-01T00:00:00Z`),

        // Active jobs in queue
        supabase
          .from("user_dispatch_jobs")
          .select("id", { count: "exact", head: true })
          .in("status", ["queued", "retrying", "processing"]),
      ]);

    // ── Map imports ──
    const recentImports: ImportLogEntry[] = (
      importsRes.status === "fulfilled" ? (importsRes.value.data ?? []) : []
    ).map((r: Row) => ({
      id:           str(r.id),
      provider:     str(r.provider) || "google_sheets",
      status:       str(r.status),
      rowsTotal:    num(r.rows_total),
      rowsImported: num(r.rows_imported),
      rowsSkipped:  num(r.rows_skipped),
      errorMessage: (r.error_message as string | null) ?? null,
      createdAt:    str(r.created_at),
    }));

    // ── Map drive matches ──
    const recentDriveMatches: DriveMatchEntry[] = (
      driveRes.status === "fulfilled" ? (driveRes.value.data ?? []) : []
    ).map((r: Row) => ({
      id:              str(r.id),
      filesFound:      num(r.files_found),
      debtorsMatched:  num(r.debtors_matched),
      debtorsTotal:    num(r.debtors_total),
      status:          str(r.status),
      errorMessage:    (r.error_message as string | null) ?? null,
      createdAt:       str(r.created_at),
    }));

    // ── Map automation runs ──
    const recentAutomationRuns: AutomationRunEntry[] = (
      runsRes.status === "fulfilled" ? (runsRes.value.data ?? []) : []
    ).map((r: Row) => ({
      id:              str(r.id),
      status:          str(r.status),
      totalCandidates: num(r.total_candidates),
      jobsCreated:     num(r.jobs_created),
      jobsSkipped:     num(r.jobs_skipped),
      sent:            num(r.sent),
      failed:          num(r.failed),
      startedAt:       str(r.started_at),
      finishedAt:      (r.finished_at as string | null) ?? null,
    }));

    // ── Map billing errors ──
    const recentErrors: BillingErrorEntry[] = (
      errorsRes.status === "fulfilled" ? (errorsRes.value.data ?? []) : []
    ).map((r: Row) => ({
      id:             str(r.id),
      clientName:     str(r.client_name),
      documentNumber: str(r.document_number),
      phone:          str(r.phone),
      status:         str(r.status),
      createdAt:      str(r.created_at),
    }));

    // ── Usage snapshot ──
    const usageRow = usageRes.status === "fulfilled" ? (usageRes.value.data as Row | null) : null;
    const chargesUsed = num(usageRow?.charges_sent);
    const usageThisMonth: UsageSnapshot = {
      chargesUsed,
      sheetsImports: num(usageRow?.sheets_imports),
      driveLookups:  num(usageRow?.drive_lookups),
      planLimit,
      remaining:     Math.max(0, planLimit - chargesUsed),
      period,
    };

    // ── Success rate (contagens exatas, sem cap de 500 linhas) ──
    const totalSentThisMonth   = logsSuccessRes.status === "fulfilled" ? (logsSuccessRes.value.count ?? 0) : 0;
    const totalFailedThisMonth = logsFailedRes.status  === "fulfilled" ? (logsFailedRes.value.count  ?? 0) : 0;
    const totalLogs = logsTotalRes.status === "fulfilled" ? (logsTotalRes.value.count ?? 0) : 0;
    const successRateThisMonth =
      totalLogs > 0 ? Math.round((totalSentThisMonth / totalLogs) * 100) : 0;

    // ── Active jobs ──
    const activeJobsInQueue =
      jobsRes.status === "fulfilled"
        ? (jobsRes.value.count ?? 0)
        : 0;

    return {
      recentImports,
      recentDriveMatches,
      recentAutomationRuns,
      recentErrors,
      usageThisMonth,
      successRateThisMonth,
      totalSentThisMonth,
      totalFailedThisMonth,
      activeJobsInQueue,
      loadedAt: new Date().toISOString(),
    };
  },
};
