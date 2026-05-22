#!/usr/bin/env node
/**
 * diagnose-whatsapp-zapi.js — diagnóstico da integração Z-API global.
 *
 * Lê as credenciais de platform_integrations (via Supabase service role)
 * e testa a conexão com a Z-API, diferenciando 5 estados:
 *
 *   1. CREDENCIAL_AUSENTE     — linha zapi ausente em platform_integrations
 *   2. CREDENCIAL_INCOMPLETA  — linha existe mas faltam instance_id/token/client_token
 *   3. CONEXAO_FALHOU         — credenciais existem mas Z-API retornou erro
 *   4. CONECTADO_SEM_NUMERO   — Z-API conectada, phone_number não retornado
 *   5. CONECTADO_COM_NUMERO   — Z-API conectada com phone_number
 *
 * Uso:
 *   node scripts/diagnose-whatsapp-zapi.js
 *
 * Variáveis de ambiente necessárias (lidas de .env automaticamente):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * SEGURANÇA: token e client_token NUNCA são impressos no output.
 * Apenas o instance_id mascarado e o estado da conexão são exibidos.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

// ─── Load .env if present ─────────────────────────────────────────────────────

const envPath = join(process.cwd(), ".env");
if (existsSync(envPath)) {
  const lines = readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
    if (key && !process.env[key]) {
      process.env[key] = val;
    }
  }
}

// ─── PII helpers (local, no shared module dependency) ────────────────────────

/**
 * Masks most of a string — safe for logging instance IDs or partial secrets.
 * "abc123xyz" → "abc1...xyz"
 */
function maskSecret(s) {
  if (!s || s.length < 6) return "***";
  return s.slice(0, 4) + "..." + s.slice(-3);
}

/**
 * Masks phone number: "5511987654321" → "5511*****321"
 */
function maskPhone(phone) {
  const digits = (phone || "").replace(/\D/g, "");
  if (digits.length < 6) return "***";
  return digits.slice(0, 4) + "*".repeat(Math.max(0, digits.length - 7)) + digits.slice(-3);
}

// ─── Output helpers ───────────────────────────────────────────────────────────

const RESET  = "\x1b[0m";
const BOLD   = "\x1b[1m";
const RED    = "\x1b[31m";
const GREEN  = "\x1b[32m";
const YELLOW = "\x1b[33m";
const CYAN   = "\x1b[36m";
const DIM    = "\x1b[2m";

function header(text) {
  console.log(`\n${BOLD}${CYAN}▶ ${text}${RESET}`);
}

function ok(label, value) {
  console.log(`  ${GREEN}✓${RESET} ${label}${value !== undefined ? `: ${BOLD}${value}${RESET}` : ""}`);
}

function warn(label, value) {
  console.log(`  ${YELLOW}⚠${RESET} ${label}${value !== undefined ? `: ${value}` : ""}`);
}

function fail(label, value) {
  console.log(`  ${RED}✗${RESET} ${label}${value !== undefined ? `: ${value}` : ""}`);
}

function info(label, value) {
  console.log(`  ${DIM}ℹ${RESET} ${label}${value !== undefined ? `: ${value}` : ""}`);
}

function verdict(state, description) {
  const icons = {
    CREDENCIAL_AUSENTE:    `${RED}[CREDENCIAL_AUSENTE]${RESET}`,
    CREDENCIAL_INCOMPLETA: `${YELLOW}[CREDENCIAL_INCOMPLETA]${RESET}`,
    CONEXAO_FALHOU:        `${RED}[CONEXAO_FALHOU]${RESET}`,
    CONECTADO_SEM_NUMERO:  `${YELLOW}[CONECTADO_SEM_NUMERO]${RESET}`,
    CONECTADO_COM_NUMERO:  `${GREEN}[CONECTADO_COM_NUMERO]${RESET}`,
  };
  console.log(`\n${BOLD}Estado final: ${icons[state] || state}${RESET}`);
  console.log(`  ${description}\n`);
}

// ─── Z-API connection test ────────────────────────────────────────────────────

/**
 * Tests connection to Z-API using the provided credentials.
 * Returns { connected, phoneNumber, error }.
 * NEVER logs the token or client_token.
 */
async function testZApiConnection(instanceId, token, clientToken) {
  const base = `https://api.z-api.io/instances/${encodeURIComponent(instanceId)}/token/${encodeURIComponent(token)}`;

  async function zapiGet(path) {
    try {
      const res = await fetch(`${base}${path}`, {
        headers: { "Client-Token": clientToken, "Content-Type": "application/json" },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch { return null; }
  }

  // 1. Status check
  const json = await zapiGet("/status");
  if (!json) {
    return { connected: false, phoneNumber: null, error: "Timeout ou erro de rede ao contatar a Z-API." };
  }

  const connected = Boolean(json.connected ?? json.status === "CONNECTED");
  const zapiError = json.error ?? json.message ?? null;

  // 2. Phone from status response
  let phoneNumber = json.phone ?? json.phoneNumber ?? json.number ?? json.smartphonePhone ?? null;
  phoneNumber = phoneNumber ? String(phoneNumber) : null;

  // 3. If connected but no phone, try secondary endpoints
  if (connected && !phoneNumber) {
    for (const path of ["/phone", "/connected", "/device"]) {
      const data = await zapiGet(path);
      if (!data) continue;
      const p = data.phone ?? data.phoneNumber ?? data.connectedPhone ?? data.number ?? data.wid ?? data.value;
      if (p && typeof p === "string" && /\d{8,}/.test(p)) {
        phoneNumber = p;
        break;
      }
    }
  }

  return { connected, phoneNumber, error: connected ? null : (zapiError || "Z-API não conectada.") };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${BOLD}╔══════════════════════════════════════════════════╗`);
  console.log(`║   Diagnóstico WhatsApp / Z-API Global             ║`);
  console.log(`╚══════════════════════════════════════════════════╝${RESET}`);

  // ── 1. Validate env vars ───────────────────────────────────────────────────

  header("1. Variáveis de ambiente");

  const supabaseUrl    = process.env.SUPABASE_URL            || "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

  if (!supabaseUrl) {
    fail("SUPABASE_URL", "não definida");
    verdict("CREDENCIAL_AUSENTE", "Variável SUPABASE_URL ausente — impossível consultar platform_integrations.");
    process.exit(1);
  }
  if (!serviceRoleKey) {
    fail("SUPABASE_SERVICE_ROLE_KEY", "não definida");
    verdict("CREDENCIAL_AUSENTE", "Variável SUPABASE_SERVICE_ROLE_KEY ausente — impossível consultar platform_integrations.");
    process.exit(1);
  }

  ok("SUPABASE_URL", supabaseUrl.replace(/\/+$/, ""));
  ok("SUPABASE_SERVICE_ROLE_KEY", maskSecret(serviceRoleKey));

  // ── 2. Connect to Supabase ────────────────────────────────────────────────

  header("2. Conexão Supabase");

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  // ── 3. Query platform_integrations ───────────────────────────────────────

  header("3. platform_integrations (provider = 'zapi')");

  const { data: row, error: dbErr } = await admin
    .from("platform_integrations")
    .select("instance_id, token, client_token, status, connected, connected_pending_phone, phone_number, updated_at")
    .eq("provider", "zapi")
    .maybeSingle();

  if (dbErr) {
    fail("Erro ao consultar platform_integrations", dbErr.message);
    info("Dica", "Verifique se a migration 20260521040000_platform_integrations.sql foi aplicada.");
    verdict("CREDENCIAL_AUSENTE", "Falha ao acessar platform_integrations. Verifique a migration e a service role key.");
    process.exit(1);
  }

  if (!row) {
    fail("Linha 'zapi' não encontrada em platform_integrations");
    info("Dica", "Execute a migration ou insira manualmente: INSERT INTO platform_integrations (provider) VALUES ('zapi')");
    verdict("CREDENCIAL_AUSENTE", "Nenhuma linha com provider='zapi' em platform_integrations.");
    process.exit(1);
  }

  ok("Linha 'zapi' encontrada");
  info("status em DB", String(row.status ?? "—"));
  info("connected em DB", String(row.connected ?? false));
  info("updated_at", row.updated_at ? new Date(row.updated_at).toLocaleString("pt-BR") : "—");

  // ── 4. Check credential completeness ─────────────────────────────────────

  header("4. Completude das credenciais");

  const hasInstanceId  = Boolean(row.instance_id  && String(row.instance_id).trim());
  const hasToken       = Boolean(row.token        && String(row.token).trim());
  const hasClientToken = Boolean(row.client_token && String(row.client_token).trim());

  if (hasInstanceId) {
    ok("instance_id", maskSecret(row.instance_id));
  } else {
    fail("instance_id", "ausente ou vazio");
  }

  if (hasToken) {
    ok("token", maskSecret(row.token));
  } else {
    fail("token", "ausente ou vazio");
  }

  if (hasClientToken) {
    ok("client_token", maskSecret(row.client_token));
  } else {
    fail("client_token", "ausente ou vazio");
  }

  if (!hasInstanceId || !hasToken || !hasClientToken) {
    const missing = [
      !hasInstanceId  ? "instance_id"  : null,
      !hasToken       ? "token"        : null,
      !hasClientToken ? "client_token" : null,
    ].filter(Boolean).join(", ");

    verdict("CREDENCIAL_INCOMPLETA", `Credencial incompleta — campos faltando: ${missing}. Configure via painel de integrações.`);
    process.exit(1);
  }

  // ── 5. Test Z-API connection ──────────────────────────────────────────────

  header("5. Teste de conexão Z-API");
  console.log(`  ${DIM}(credenciais nunca exibidas — somente resultado da conexão)${RESET}`);

  let zapiResult;
  try {
    zapiResult = await testZApiConnection(
      String(row.instance_id),
      String(row.token),
      String(row.client_token),
    );
  } catch (err) {
    fail("Exceção ao chamar Z-API", err.message);
    verdict("CONEXAO_FALHOU", `Exceção inesperada ao testar Z-API: ${err.message}`);
    process.exit(1);
  }

  if (!zapiResult.connected) {
    fail("Z-API não conectada", zapiResult.error ?? "sem detalhe");
    verdict("CONEXAO_FALHOU", `Credenciais configuradas, mas Z-API reporta desconexão: ${zapiResult.error ?? "sem detalhe"}.`);
    process.exit(1);
  }

  ok("Z-API conectada");

  // ── 6. Phone number check ─────────────────────────────────────────────────

  header("6. Número de telefone associado");

  if (!zapiResult.phoneNumber) {
    warn("phone_number", "não retornado pela Z-API");
    info("Possível causa", "Instância conectada mas nenhum número pareado (aguardando QR?)");

    // Update DB status even though phone is absent
    await admin
      .from("platform_integrations")
      .update({
        status:                  "active",
        connected:               true,
        connected_pending_phone: true,
        phone_number:            null,
        last_error:              null,
        updated_at:              new Date().toISOString(),
      })
      .eq("provider", "zapi");
    ok("platform_integrations atualizada", "connected=true, connected_pending_phone=true");

    verdict("CONECTADO_SEM_NUMERO", "Z-API conectada, mas nenhum número telefônico retornado. Escaneie o QR Code para parear.");
    process.exit(0);
  }

  ok("phone_number", maskPhone(zapiResult.phoneNumber));

  // ── 7. Update platform_integrations ──────────────────────────────────────

  header("7. Atualizando platform_integrations");

  const { error: updateErr } = await admin
    .from("platform_integrations")
    .update({
      status:                  "active",
      connected:               true,
      connected_pending_phone: false,
      phone_number:            zapiResult.phoneNumber,
      last_error:              null,
      updated_at:              new Date().toISOString(),
    })
    .eq("provider", "zapi");

  if (updateErr) {
    warn("Falha ao atualizar platform_integrations", updateErr.message);
  } else {
    ok("platform_integrations atualizada", "connected=true, phone_number salvo");
  }

  verdict("CONECTADO_COM_NUMERO", `Z-API configurada e conectada. Número: ${maskPhone(zapiResult.phoneNumber)}.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(`\n${RED}Erro fatal:${RESET}`, err.message || err);
  process.exit(1);
});
