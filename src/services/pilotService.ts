/**
 * pilotService — read pilot config and metrics for the authenticated user.
 *
 * Security rules:
 *   - Only reads own data (RLS enforced server-side).
 *   - Does NOT read/write platform_integrations or any credential table.
 *   - Phone numbers are stored masked in pilot_fallback_notes — this service
 *     never receives or exposes raw phone numbers.
 */

import { getSupabaseClient } from "./supabaseClient";
import type {
  PilotConfig,
  PilotDailySends,
  PilotFallbackNote,
  PilotMetrics,
  PilotLastError,
} from "../types";

type Row = Record<string, unknown>;

const str = (v: unknown): string => (v != null ? String(v) : "");
const num = (v: unknown): number => (v != null ? Number(v) : 0);

// ─── Pilot config ──────────────────────────────────────────────────────────────

export const pilotService = {

  /**
   * Load pilot_config for the current user.
   * Returns null if no row (user not enrolled in pilot).
   */
  async getConfig(): Promise<PilotConfig | null> {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("pilot_config")
      .select(
        "id, user_id, pilot_enabled, daily_send_limit, allowed_send_start, " +
        "allowed_send_end, allowed_weekdays, whatsapp_number_label, " +
        "responsible_name, support_channel, notes, created_at, updated_at",
      )
      .maybeSingle();

    if (error || !data) return null;
    return mapConfig(data as unknown as Row);
  },

  /**
   * Update human-readable labels/notes (operator-editable fields only).
   * pilot_enabled and limits can only be changed via service_role.
   */
  async updateLabels(params: {
    whatsappNumberLabel?: string;
    responsibleName?:     string;
    supportChannel?:      string;
    notes?:               string;
  }): Promise<void> {
    const supabase = getSupabaseClient();
    await supabase
      .from("pilot_config")
      .update({
        whatsapp_number_label: params.whatsappNumberLabel ?? null,
        responsible_name:      params.responsibleName    ?? null,
        support_channel:       params.supportChannel     ?? null,
        notes:                 params.notes              ?? null,
      });
  },

  // ── Daily sends counter ───────────────────────────────────────────────────────

  async getTodayCounter(): Promise<PilotDailySends | null> {
    const supabase = getSupabaseClient();
    const today = new Date().toISOString().slice(0, 10);
    const { data } = await supabase
      .from("pilot_daily_sends")
      .select("user_id, send_date, sent_count")
      .eq("send_date", today)
      .maybeSingle();
    if (!data) return null;
    const r = data as Row;
    return {
      userId:    str(r.user_id),
      sendDate:  str(r.send_date),
      sentCount: num(r.sent_count),
    };
  },

  // ── Pilot metrics (dashboard) ─────────────────────────────────────────────────

  async getMetrics(dailyLimit: number): Promise<PilotMetrics> {
    const supabase = getSupabaseClient();
    const today = new Date().toISOString().slice(0, 10);

    const [counterRes, logsRes, fallbackRes] = await Promise.allSettled([
      // Today's sent counter
      supabase
        .from("pilot_daily_sends")
        .select("sent_count")
        .eq("send_date", today)
        .maybeSingle(),

      // Today's billing logs for delivery/fail/dup stats
      supabase
        .from("user_logs_cobranca")
        .select("id, client_name, status, created_at, updated_at")
        .gte("created_at", `${today}T00:00:00Z`)
        .order("created_at", { ascending: false })
        .limit(200),

      // Recent failed logs (for "last errors" widget)
      supabase
        .from("user_logs_cobranca")
        .select("id, client_name, status, created_at")
        .in("status", ["erro", "telefone_invalido", "duplicado", "fora_horario", "limite_diario", "pilot_desabilitado"])
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    const todayCount = counterRes.status === "fulfilled"
      ? num((counterRes.value.data as Row | null)?.sent_count)
      : 0;

    const logs: Row[] = logsRes.status === "fulfilled"
      ? ((logsRes.value.data ?? []) as unknown as Row[])
      : [];

    const totalDeliveredToday  = logs.filter(l => l.status === "entregue" || l.status === "lido").length;
    const totalFailedToday     = logs.filter(l => l.status === "erro").length;
    const totalDuplicateBlocked= logs.filter(l => l.status === "duplicado").length;
    const totalInvalidPhone    = logs.filter(l => l.status === "telefone_invalido").length;

    // Avg delivery time (created_at → updated_at for entregue/lido rows)
    const deliveredWithTime = logs.filter(
      l => (l.status === "entregue" || l.status === "lido") &&
           l.created_at && l.updated_at &&
           l.created_at !== l.updated_at,
    );
    let avgDeliveryMinutes: number | null = null;
    if (deliveredWithTime.length > 0) {
      const totalMs = deliveredWithTime.reduce((acc, l) => {
        const ms = new Date(str(l.updated_at)).getTime() - new Date(str(l.created_at)).getTime();
        return acc + (ms > 0 ? ms : 0);
      }, 0);
      avgDeliveryMinutes = Math.round(totalMs / deliveredWithTime.length / 60_000);
    }

    const lastErrors: PilotLastError[] = (
      fallbackRes.status === "fulfilled"
        ? ((fallbackRes.value.data ?? []) as unknown as Row[])
        : []
    ).map(r => ({
      id:         str(r.id),
      clientName: str(r.client_name),
      status:     str(r.status),
      createdAt:  str(r.created_at),
    }));

    return {
      totalSentToday:        todayCount,
      dailyLimit,
      remainingToday:        Math.max(0, dailyLimit - todayCount),
      totalDeliveredToday,
      totalFailedToday,
      totalDuplicateBlocked,
      totalInvalidPhone,
      avgDeliveryMinutes,
      lastErrors,
      loadedAt: new Date().toISOString(),
    };
  },

  // ── Fallback notes ────────────────────────────────────────────────────────────

  /**
   * Record a manual resolution for a failed send.
   * phone is masked before storage — raw phone MUST NOT be passed here.
   */
  async createFallbackNote(params: {
    logId?:          string;
    clientName:      string;
    documentNumber?: string;
    phoneMasked?:    string;  // already masked — never raw
    resolution:      PilotFallbackNote["resolution"];
    observation?:    string;
  }): Promise<PilotFallbackNote | null> {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("pilot_fallback_notes")
      .insert({
        log_id:          params.logId          || null,
        client_name:     params.clientName.slice(0, 255),
        document_number: (params.documentNumber ?? "").slice(0, 100),
        phone_masked:    (params.phoneMasked    ?? "").slice(0, 30),
        resolution:      params.resolution,
        observation:     (params.observation   ?? "").slice(0, 1000),
      })
      .select(
        "id, user_id, log_id, client_name, document_number, phone_masked, " +
        "resolution, observation, resolved_at, created_at",
      )
      .single();

    if (error || !data) return null;
    return mapFallback(data as unknown as Row);
  },

  async listFallbackNotes(limit = 20): Promise<PilotFallbackNote[]> {
    const supabase = getSupabaseClient();
    const { data } = await supabase
      .from("pilot_fallback_notes")
      .select(
        "id, user_id, log_id, client_name, document_number, phone_masked, " +
        "resolution, observation, resolved_at, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(limit);

    return ((data ?? []) as unknown as Row[]).map(mapFallback);
  },
};

// ─── Row mappers ──────────────────────────────────────────────────────────────

function mapConfig(r: Row): PilotConfig {
  return {
    id:                  str(r.id),
    userId:              str(r.user_id),
    pilotEnabled:        Boolean(r.pilot_enabled),
    dailySendLimit:      num(r.daily_send_limit),
    allowedSendStart:    str(r.allowed_send_start) || "08:00",
    allowedSendEnd:      str(r.allowed_send_end)   || "18:00",
    allowedWeekdays:     Array.isArray(r.allowed_weekdays) ? (r.allowed_weekdays as number[]) : [1,2,3,4,5],
    whatsappNumberLabel: (r.whatsapp_number_label as string | null) ?? null,
    responsibleName:     (r.responsible_name as string | null)     ?? null,
    supportChannel:      (r.support_channel as string | null)      ?? null,
    notes:               (r.notes as string | null)                ?? null,
    createdAt:           str(r.created_at) || undefined,
    updatedAt:           str(r.updated_at) || undefined,
  };
}

function mapFallback(r: Row): PilotFallbackNote {
  return {
    id:             str(r.id),
    userId:         str(r.user_id),
    logId:          (r.log_id as string | null) ?? null,
    clientName:     str(r.client_name),
    documentNumber: (r.document_number as string | null) ?? null,
    phoneMasked:    (r.phone_masked as string | null)    ?? null,
    resolution:     str(r.resolution) as PilotFallbackNote["resolution"],
    observation:    (r.observation as string | null)     ?? null,
    resolvedAt:     str(r.resolved_at),
    createdAt:      str(r.created_at),
  };
}
