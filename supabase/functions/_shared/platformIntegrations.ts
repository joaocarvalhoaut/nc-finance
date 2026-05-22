/**
 * platformIntegrations.ts — load Z-API credentials from platform_integrations.
 *
 * Security contract:
 *   - Credentials are ONLY returned inside Edge Functions (service_role).
 *   - This module MUST NOT be imported by any frontend code.
 *   - The browser never receives token or client_token.
 *
 * Lookup order:
 *   1. platform_integrations table (preferred — managed via whatsapp-gateway API)
 *   2. Deno env vars ZAPI_INSTANCE_ID / ZAPI_TOKEN / ZAPI_CLIENT_TOKEN (bootstrap)
 *
 * If NEITHER source has complete credentials → returns null.
 * Callers MUST check for null and return a clear "zapi_nao_configurada" error.
 *
 * There is NO fallback to company_integrations or any per-user table.
 */

import { createClient } from "npm:@supabase/supabase-js@2.49.8";

type AdminClient = ReturnType<typeof createClient>;

export interface ZApiCredentials {
  instanceId:  string;
  token:       string;
  clientToken: string;
  /** Where the credentials came from — for safe logging only */
  source: "platform_integrations" | "env_vars";
}

export interface PlatformStatus {
  status:                 string;
  connected:              boolean;
  connected_pending_phone: boolean;
  /** Masked phone — safe to return to frontend */
  phone_number_masked:    string | null;
  updated_at:             string | null;
}

// ── Load credentials (service_role only) ─────────────────────────────────────

/**
 * Load Z-API credentials from platform_integrations.
 * Falls back to env vars only if the table row is missing or incomplete.
 * Returns null if not configured in either location.
 */
export async function loadZApiCredentials(
  admin: AdminClient,
): Promise<ZApiCredentials | null> {
  // 1. Try platform_integrations table first
  try {
    const { data, error } = await admin
      .from("platform_integrations")
      .select("instance_id, token, client_token, status")
      .eq("provider", "zapi")
      .maybeSingle();

    if (!error && data) {
      const row = data as Record<string, string | null>;
      if (row.instance_id && row.token && row.client_token) {
        return {
          instanceId:  row.instance_id,
          token:       row.token,
          clientToken: row.client_token,
          source:      "platform_integrations",
        };
      }
    }
  } catch {
    // Table may not exist yet (pre-migration) — fall through to env vars
  }

  // 2. Fall back to env vars (bootstrap / pre-migration)
  const instanceId  = Deno.env.get("ZAPI_INSTANCE_ID")    ?? "";
  const token       = Deno.env.get("ZAPI_TOKEN")           ?? "";
  const clientToken = Deno.env.get("ZAPI_CLIENT_TOKEN")    ?? "";

  if (instanceId && token && clientToken) {
    return { instanceId, token, clientToken, source: "env_vars" };
  }

  return null;
}

// ── Read safe status (no credentials) ────────────────────────────────────────

/**
 * Return only the safe status fields — NEVER token or client_token.
 * This is what the frontend-proxy (whatsapp-gateway) may return to the browser.
 */
export async function loadPlatformStatus(
  admin: AdminClient,
): Promise<PlatformStatus | null> {
  try {
    const { data, error } = await admin
      .from("platform_integrations")
      .select("status, connected, connected_pending_phone, phone_number, updated_at")
      .eq("provider", "zapi")
      .maybeSingle();

    if (error || !data) return null;

    const row = data as Record<string, unknown>;

    // Mask phone before returning
    let phoneMasked: string | null = null;
    const rawPhone = (row.phone_number as string | null) ?? "";
    if (rawPhone) {
      const digits = rawPhone.replace(/\D/g, "");
      if (digits.length >= 6) {
        phoneMasked = digits.slice(0, 4) + "*".repeat(Math.max(0, digits.length - 7)) + digits.slice(-3);
      }
    }

    return {
      status:                  String(row.status ?? "inactive"),
      connected:               Boolean(row.connected),
      connected_pending_phone: Boolean(row.connected_pending_phone),
      phone_number_masked:     phoneMasked,
      updated_at:              (row.updated_at as string | null) ?? null,
    };
  } catch {
    return null;
  }
}

// ── Update status (after connection test) ────────────────────────────────────

export async function updatePlatformStatus(
  admin: AdminClient,
  update: Partial<{
    status:                  string;
    connected:               boolean;
    connected_pending_phone: boolean;
    phone_number:            string | null;
    last_error:              string | null;
  }>,
): Promise<void> {
  await admin
    .from("platform_integrations")
    .update({ ...update, updated_at: new Date().toISOString() })
    .eq("provider", "zapi");
}

// ── Save credentials (admin only — called by whatsapp-gateway) ───────────────

export async function savePlatformCredentials(
  admin: AdminClient,
  credentials: {
    instanceId:  string;
    token:       string;
    clientToken: string;
  },
): Promise<void> {
  await admin
    .from("platform_integrations")
    .upsert(
      {
        provider:     "zapi",
        instance_id:  credentials.instanceId,
        token:        credentials.token,
        client_token: credentials.clientToken,
        status:       "inactive",
        connected:    false,
        updated_at:   new Date().toISOString(),
      },
      { onConflict: "provider" },
    );
}
