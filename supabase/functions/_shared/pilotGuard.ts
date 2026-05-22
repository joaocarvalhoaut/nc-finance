/**
 * pilotGuard.ts — enforce pilot-mode rules before any WhatsApp send.
 *
 * Checks (in order):
 *   1. pilot_config row exists AND pilot_enabled = true
 *   2. Current UTC time is within allowed_send_start…allowed_send_end
 *   3. Current ISO weekday is in allowed_weekdays
 *   4. pilot_daily_sends.sent_count < daily_send_limit
 *
 * If any check fails → returns { ok: false, reason, statusCode }.
 * On pass             → returns { ok: true, config, todayCount }.
 *
 * After a successful send, callers MUST call incrementPilotDailyCount().
 *
 * SECURITY: this module only runs server-side (Edge Functions / service_role).
 * It never exposes pilot_config credentials or raw phone numbers.
 */

import { createClient } from "npm:@supabase/supabase-js@2.49.8";

type AdminClient = ReturnType<typeof createClient>;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PilotConfig {
  pilot_enabled:       boolean;
  daily_send_limit:    number;
  allowed_send_start:  string;   // "HH:MM" UTC
  allowed_send_end:    string;   // "HH:MM" UTC
  allowed_weekdays:    number[]; // 1=Mon … 7=Sun
  whatsapp_number_label?: string | null;
  responsible_name?:      string | null;
  support_channel?:       string | null;
}

export interface PilotGuardPass {
  ok:         true;
  config:     PilotConfig;
  todayCount: number;
  remaining:  number;
}

export interface PilotGuardBlock {
  ok:         false;
  reason:     PilotGuardReason;
  message:    string;
  statusCode: 403 | 429 | 503;
}

export type PilotGuardReason =
  | "pilot_desabilitado"   // user not enrolled in pilot
  | "fora_horario"         // outside allowed time window
  | "dia_nao_permitido"    // weekday not in allowed_weekdays
  | "limite_diario"        // daily limit reached
  | "whatsapp_desconectado" // Z-API not connected (caller must check separately)
  | "config_ausente";      // no pilot_config row found

export type PilotGuardResult = PilotGuardPass | PilotGuardBlock;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Parse "HH:MM" → total minutes since midnight (UTC).
 */
function hhmm(str: string): number {
  const [h = "0", m = "0"] = str.split(":");
  return parseInt(h, 10) * 60 + parseInt(m, 10);
}

/**
 * Current UTC time in minutes since midnight.
 */
function nowMinutes(): number {
  const now = new Date();
  return now.getUTCHours() * 60 + now.getUTCMinutes();
}

/**
 * Current ISO weekday (1=Mon … 7=Sun).
 */
function isoWeekday(): number {
  const day = new Date().getUTCDay(); // 0=Sun … 6=Sat
  return day === 0 ? 7 : day;
}

/**
 * Today's date as "YYYY-MM-DD" (UTC).
 */
function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

// ─── Main guard ───────────────────────────────────────────────────────────────

/**
 * Run all pilot-mode checks for a given user.
 * Returns PilotGuardPass (ok=true) or PilotGuardBlock (ok=false).
 */
export async function checkPilotGuard(
  admin: AdminClient,
  userId: string,
): Promise<PilotGuardResult> {
  // ── 1. Load pilot_config ────────────────────────────────────────────────────

  const { data: cfg, error: cfgErr } = await admin
    .from("pilot_config")
    .select(
      "pilot_enabled, daily_send_limit, allowed_send_start, allowed_send_end, " +
      "allowed_weekdays, whatsapp_number_label, responsible_name, support_channel",
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (cfgErr || !cfg) {
    return {
      ok:         false,
      reason:     "config_ausente",
      message:    "Tenant não inscrito no piloto. Solicite a habilitação ao suporte.",
      statusCode: 403,
    };
  }

  const config = cfg as unknown as PilotConfig;

  // ── 2. pilot_enabled ────────────────────────────────────────────────────────

  if (!config.pilot_enabled) {
    return {
      ok:         false,
      reason:     "pilot_desabilitado",
      message:    "Modo piloto desabilitado para este tenant. Solicite a habilitação ao suporte.",
      statusCode: 403,
    };
  }

  // ── 3. Weekday check ────────────────────────────────────────────────────────

  const weekday = isoWeekday();
  const allowed = Array.isArray(config.allowed_weekdays) ? config.allowed_weekdays : [1,2,3,4,5];
  if (!allowed.includes(weekday)) {
    return {
      ok:         false,
      reason:     "dia_nao_permitido",
      message:    `Envio via piloto permitido apenas nos dias: ${allowed.join(", ")} (1=Seg … 7=Dom). Hoje é dia ${weekday}.`,
      statusCode: 403,
    };
  }

  // ── 4. Time window check ────────────────────────────────────────────────────

  const now   = nowMinutes();
  const start = hhmm(config.allowed_send_start ?? "08:00");
  const end   = hhmm(config.allowed_send_end   ?? "18:00");

  if (now < start || now >= end) {
    return {
      ok:         false,
      reason:     "fora_horario",
      message:    `Envio via piloto permitido entre ${config.allowed_send_start} e ${config.allowed_send_end} UTC. Tente novamente dentro do horário.`,
      statusCode: 403,
    };
  }

  // ── 5. Daily limit ──────────────────────────────────────────────────────────

  const today = todayUtc();
  const { data: counter } = await admin
    .from("pilot_daily_sends")
    .select("sent_count")
    .eq("user_id", userId)
    .eq("send_date", today)
    .maybeSingle();

  const todayCount = counter ? (counter as { sent_count: number }).sent_count : 0;
  const remaining  = Math.max(0, config.daily_send_limit - todayCount);

  if (remaining === 0) {
    return {
      ok:         false,
      reason:     "limite_diario",
      message:    `Limite diário de ${config.daily_send_limit} envios atingido. Retome amanhã ou aumente o limite com o suporte.`,
      statusCode: 429,
    };
  }

  return { ok: true, config, todayCount, remaining };
}

// ─── Counter increment ────────────────────────────────────────────────────────

/**
 * Atomically increment pilot_daily_sends.sent_count for today.
 * Uses a server-side RPC (INSERT … ON CONFLICT DO UPDATE) to avoid
 * the read-then-write race condition under concurrent sends.
 *
 * Must be called only after a confirmed successful send.
 */
export async function incrementPilotDailyCount(
  admin: AdminClient,
  userId: string,
  delta = 1,
): Promise<void> {
  const { error } = await admin.rpc("increment_pilot_daily_count", {
    p_user_id: userId,
    p_delta:   delta,
  });

  if (error) {
    // Non-fatal: log and continue — a missed counter is better than a failed send
    console.error("[pilotGuard] increment_pilot_daily_count RPC error:", error.message);
  }
}

/**
 * Atomic check-and-increment: verifies the daily limit AND increments in one
 * round-trip. Use this instead of checkPilotGuard + incrementPilotDailyCount
 * when you want a single DB call for the limit check + counter update.
 *
 * Returns { allowed, todayCount, remaining } — if allowed=false the counter
 * was NOT incremented.
 */
export async function checkAndIncrementPilotCount(
  admin: AdminClient,
  userId: string,
  dailyLimit: number,
  delta = 1,
): Promise<{ allowed: boolean; todayCount: number; remaining: number }> {
  const { data, error } = await admin.rpc("check_and_increment_pilot_count", {
    p_user_id:     userId,
    p_daily_limit: dailyLimit,
    p_delta:       delta,
  });

  if (error || !data || !Array.isArray(data) || data.length === 0) {
    console.error("[pilotGuard] check_and_increment_pilot_count RPC error:", error?.message ?? "no data");
    // Fail open — allow but log; caller still enforces limit via checkPilotGuard
    return { allowed: true, todayCount: 0, remaining: dailyLimit };
  }

  const row = data[0] as { allowed: boolean; today_count: number; remaining: number };
  return {
    allowed:    row.allowed,
    todayCount: row.today_count,
    remaining:  row.remaining,
  };
}
