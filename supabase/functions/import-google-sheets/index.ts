/**
 * import-google-sheets — Edge Function segura para importação real via Google Sheets API.
 *
 * Fluxo:
 *  1. Valida JWT / auth.uid()
 *  2. Valida payload
 *  3. Valida credenciais Google (backend-only)
 *  4. Valida assinatura Stripe (trialing | active)
 *  5. Lê planilha com Service Account
 *  6. Normaliza linhas
 *  7. Upsert em user_registros_financeiros (título único = documento + cliente + vencimento,
 *     ver _shared/tituloUnico.ts; sem documento: telefone + nome)
 *  8. Salva/atualiza user_google_sheets_config
 *  9. Registra user_import_logs
 * 10. Incrementa sheets_imports em user_usage_counters
 * 11. Retorna resumo sanitizado
 *
 * Segredos (Supabase Secrets — NUNCA no frontend):
 *   GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY
 */

import { createClient } from "npm:@supabase/supabase-js@2.49.8";
import { corsHeaders } from "../_shared/cors.ts";
import { ACCESS_COLUMNS, canUseSubscription } from "../_shared/billingStatus.ts";
import {
  extractSpreadsheetId,
  getGoogleAccessToken,
  readSpreadsheet,
  type SheetRow,
} from "../_shared/googleSheets.ts";
import { chaveDoTitulo } from "../_shared/tituloUnico.ts";

// ─── Env ──────────────────────────────────────────────────────────────────────

const SUPABASE_URL      = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const SERVICE_ROLE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const GOOGLE_EMAIL      = Deno.env.get("GOOGLE_CLIENT_EMAIL") || "";
const GOOGLE_PRIVATE_KEY = Deno.env.get("GOOGLE_PRIVATE_KEY") || "";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const getPeriodKey = (): string => {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
};

const okResponse  = (body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const errResponse = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

// ─── Upsert single row ────────────────────────────────────────────────────────

const upsertRow = async (
  // deno-lint-ignore no-explicit-any
  admin: ReturnType<typeof createClient<any, any, any>>,
  userId: string,
  row: SheetRow,
): Promise<"inserted" | "updated" | "skipped"> => {
  try {
    const base = {
      user_id:          userId,
      client_name:      row.clientName.slice(0, 255),
      supplier_name:    row.supplier.slice(0, 255) || "NC Finance",
      document_number:  row.documentNumber.slice(0, 100),
      due_date:         row.dueDate,
      amount:           row.amount,
      phone:            row.phone || null,
      category:         row.category,
      notes:            row.notes.slice(0, 1000) || null,
      status:           "pending",
      import_source:    "google_sheets",
      updated_at:       new Date().toISOString(),
    };

    let existing: { id: string } | null = null;

    // Mesmo título = mesmo documento + cliente + vencimento, pela regra de
    // _shared/tituloUnico.ts ("DP 1439/005" = "1439/005"; nome sem caixa/acento).
    // Achou: atualiza o que já existe, mantendo o nome e o documento gravados.
    const chave = chaveDoTitulo(row.documentNumber, row.clientName, row.dueDate);
    if (chave) {
      const { data } = await admin
        .from("user_registros_financeiros")
        .select("id, document_number, client_name, due_date, archived_at")
        .eq("user_id", userId)
        .eq("due_date", row.dueDate);
      const iguais = ((data ?? []) as {
        id: string; document_number: string | null; client_name: string | null; due_date: string | null; archived_at: string | null;
      }[]).filter((r) => chaveDoTitulo(r.document_number, r.client_name, r.due_date) === chave);
      // Havendo cópia antiga arquivada, fica a que está na carteira.
      const alvo = iguais.find((r) => !r.archived_at) ?? iguais[0];
      if (alvo) {
        existing = { id: alvo.id };
        base.client_name = alvo.client_name ?? base.client_name;
        base.document_number = alvo.document_number ?? base.document_number;
      }
    }

    // Sem documento: casa pelo telefone + nome (com documento, a chave acima decide).
    if (!existing && !chave && row.phone && row.clientName) {
      const { data } = await admin
        .from("user_registros_financeiros")
        .select("id")
        .eq("user_id", userId)
        .eq("phone", row.phone)
        .ilike("client_name", row.clientName)
        .maybeSingle();
      existing = data as { id: string } | null;
    }

    if (existing) {
      // Reimportar traz o título de volta para a carteira (igual à importação por arquivo).
      const { error } = await admin
        .from("user_registros_financeiros")
        .update({ ...base, archived_at: null })
        .eq("id", existing.id)
        .eq("user_id", userId);
      if (error) return "skipped";
      return "updated";
    } else {
      const { error } = await admin
        .from("user_registros_financeiros")
        .insert({ ...base, created_at: new Date().toISOString() });
      if (error) return "skipped";
      return "inserted";
    }
  } catch {
    return "skipped";
  }
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
      return errResponse(401, { error: "Sessao invalida.", status: "sessao_invalida" });
    }
    const userId = user.id;

    // ── 2. Parse payload ───────────────────────────────────────────────────────
    let body: { spreadsheetUrl?: string; sheetName?: string };
    try {
      body = await request.json();
    } catch {
      return errResponse(400, { error: "Payload invalido.", status: "payload_invalido" });
    }

    if (!body.spreadsheetUrl?.trim()) {
      return errResponse(400, { error: "Campo obrigatorio: spreadsheetUrl.", status: "payload_invalido" });
    }

    // ── 3. Valida credenciais Google ───────────────────────────────────────────
    if (!GOOGLE_EMAIL || !GOOGLE_PRIVATE_KEY) {
      return errResponse(503, {
        error: "Integracao Google Sheets nao configurada na plataforma. Contate o suporte.",
        status: "google_nao_configurado",
      });
    }

    // ── 4. Valida assinatura Stripe ────────────────────────────────────────────
    const { data: subscription } = await admin
      .from("user_subscriptions")
      .select(ACCESS_COLUMNS)
      .eq("user_id", userId)
      .maybeSingle();

    if (!subscription || !canUseSubscription(subscription)) {
      return errResponse(403, {
        error: "Assinatura necessaria (trialing ou active) para importar planilhas.",
        status: "bloqueado_assinatura",
      });
    }

    // ── 5. Extrai spreadsheet ID ───────────────────────────────────────────────
    let spreadsheetId: string;
    try {
      spreadsheetId = extractSpreadsheetId(body.spreadsheetUrl);
    } catch (e) {
      return errResponse(400, {
        error: e instanceof Error ? e.message : "URL de planilha invalida.",
        status: "url_invalida",
      });
    }

    // ── 6. Obtém access token Google ──────────────────────────────────────────
    let accessToken: string;
    try {
      accessToken = await getGoogleAccessToken(GOOGLE_EMAIL, GOOGLE_PRIVATE_KEY);
    } catch (e) {
      return errResponse(502, {
        error: e instanceof Error ? e.message : "Falha na autenticacao Google.",
        status: "google_auth_erro",
      });
    }

    // ── 7. Lê planilha ─────────────────────────────────────────────────────────
    let readResult: Awaited<ReturnType<typeof readSpreadsheet>>;
    try {
      readResult = await readSpreadsheet({
        spreadsheetId,
        sheetName: body.sheetName?.trim() || undefined,
        accessToken,
      });
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : "Erro ao ler planilha.";

      // Salva config com erro
      await admin.from("user_google_sheets_config").upsert(
        {
          user_id: userId,
          spreadsheet_id: spreadsheetId,
          spreadsheet_url: body.spreadsheetUrl,
          sheet_name: body.sheetName || null,
          last_sync_at: new Date().toISOString(),
          last_sync_status: "error",
          last_sync_error: errMsg.slice(0, 500),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );

      await admin.from("user_import_logs").insert({
        user_id: userId,
        provider: "google_sheets",
        status: "error",
        rows_total: 0,
        rows_imported: 0,
        rows_skipped: 0,
        error_message: errMsg.slice(0, 500),
        metadata: { spreadsheetId },
      });

      return errResponse(422, { error: errMsg, status: "leitura_erro" });
    }

    // ── 8. Upsert registros ────────────────────────────────────────────────────
    let imported = 0;
    let skippedDb = 0;
    const vistos = new Set<string>();

    for (const row of readResult.rows) {
      // Linha repetida na própria planilha (mesmo título): fica a primeira.
      const chave = chaveDoTitulo(row.documentNumber, row.clientName, row.dueDate);
      if (chave) {
        if (vistos.has(chave)) { skippedDb++; continue; }
        vistos.add(chave);
      }
      const op = await upsertRow(admin, userId, row);
      if (op === "inserted" || op === "updated") {
        imported++;
      } else {
        skippedDb++;
      }
    }

    const totalSkipped = readResult.skipped + skippedDb;

    // ── 9. Salva/atualiza config ──────────────────────────────────────────────
    await admin.from("user_google_sheets_config").upsert(
      {
        user_id: userId,
        spreadsheet_id: spreadsheetId,
        spreadsheet_url: body.spreadsheetUrl,
        sheet_name: body.sheetName || null,
        last_sync_at: new Date().toISOString(),
        last_sync_status: "success",
        last_sync_error: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

    // ── 10. Salva log de importação ────────────────────────────────────────────
    const { data: logEntry } = await admin
      .from("user_import_logs")
      .insert({
        user_id: userId,
        provider: "google_sheets",
        status: "success",
        rows_total: readResult.totalRaw,
        rows_imported: imported,
        rows_skipped: totalSkipped,
        error_message: null,
        metadata: {
          spreadsheetId,
          sheetName: body.sheetName || null,
          plan: subscription.plan,
        },
      })
      .select("id")
      .single();

    // ── 11. Incrementa sheets_imports ─────────────────────────────────────────
    const period = getPeriodKey();
    const { data: usageRow } = await admin
      .from("user_usage_counters")
      .select("sheets_imports, charges_sent, drive_lookups")
      .eq("user_id", userId)
      .eq("period", period)
      .maybeSingle();

    await admin.from("user_usage_counters").upsert(
      {
        user_id: userId,
        period,
        charges_sent:  Number(usageRow?.charges_sent  ?? 0),
        sheets_imports: Number(usageRow?.sheets_imports ?? 0) + 1,
        drive_lookups: Number(usageRow?.drive_lookups  ?? 0),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,period" },
    );

    // ── 12. Resposta sanitizada ────────────────────────────────────────────────
    return okResponse({
      success: true,
      status: "success",
      rowsTotal:    readResult.totalRaw,
      rowsImported: imported,
      rowsSkipped:  totalSkipped,
      error: null,
      logId: (logEntry as { id: string } | null)?.id ?? null,
      spreadsheetId,
      lastSyncAt: new Date().toISOString(),
    });

  } catch (err) {
    console.error("[import-google-sheets] unhandled:", err);
    return errResponse(500, {
      error: "Erro interno. Tente novamente ou contate o suporte.",
      status: "erro_interno",
    });
  }
});
