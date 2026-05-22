/**
 * match-drive-files — Edge Function para localizar PDFs/boletos no Google Drive
 * e associá-los a devedores do usuário por similaridade.
 *
 * Fluxo:
 *  1. Valida JWT / auth.uid()
 *  2. Valida assinatura Stripe (trialing | active)
 *  3. Verifica plano: Basic → bloqueado; Pro/Premium → prossegue
 *  4. Valida credenciais Google + GOOGLE_DRIVE_FOLDER_ID
 *  5. Obtém access token Google (Service Account JWT RS256)
 *  6. Lista PDFs na pasta do Drive (com paginação)
 *  7. Lê devedores do usuário
 *  8. Calcula score de match para cada par devedor×arquivo
 *  9. Atualiza colunas drive_* em user_registros_financeiros (score ≥ 0.5)
 * 10. Registra user_drive_match_logs
 * 11. Incrementa drive_lookups em user_usage_counters
 * 12. Retorna resumo sanitizado
 *
 * Segredos (Supabase Secrets — NUNCA no frontend):
 *   GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY, GOOGLE_DRIVE_FOLDER_ID
 */

import { createClient } from "npm:@supabase/supabase-js@2.49.8";
import { corsHeaders } from "../_shared/cors.ts";
import {
  getGoogleAccessToken,
  listFilesInFolder,
  matchDebtorsToFiles,
  type DebtorMatchInput,
} from "../_shared/googleDrive.ts";
import { batchMatchDebtors, getDriveAccessToken } from "../_shared/driveFolderIndex.ts";

// ─── Env ──────────────────────────────────────────────────────────────────────

const SUPABASE_URL       = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_ANON_KEY  = Deno.env.get("SUPABASE_ANON_KEY") || "";
const SERVICE_ROLE_KEY   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const GOOGLE_EMAIL       = Deno.env.get("GOOGLE_CLIENT_EMAIL") || "";
const GOOGLE_PRIVATE_KEY = Deno.env.get("GOOGLE_PRIVATE_KEY") || "";
// Legacy platform-level folder (fallback when user has no per-user folder configured)
const DRIVE_FOLDER_ID    = Deno.env.get("GOOGLE_DRIVE_FOLDER_ID") || "";

// ─── Plan gate ────────────────────────────────────────────────────────────────

const DRIVE_ALLOWED_PLANS = ["pro", "premium"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const getPeriodKey = (): string => {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
};

const okResponse  = (body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const errResponse = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

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

    // ── 2. Valida assinatura ───────────────────────────────────────────────────
    const { data: subscription } = await admin
      .from("user_subscriptions")
      .select("status, plan")
      .eq("user_id", userId)
      .maybeSingle();

    if (!subscription || !["trialing", "active"].includes(subscription.status)) {
      return errResponse(403, {
        error: "Assinatura necessaria (trialing ou active) para usar o Drive.",
        status: "bloqueado_assinatura",
      });
    }

    // ── 3. Verifica plano ──────────────────────────────────────────────────────
    if (!DRIVE_ALLOWED_PLANS.includes(subscription.plan)) {
      return errResponse(403, {
        error: "Integração com Google Drive disponível apenas nos planos Pro e Premium. Faça upgrade para continuar.",
        status: "bloqueado_plano",
      });
    }

    // ── 4. Resolve folder ID (per-user → fallback to platform env var) ───────────
    let resolvedFolderId = DRIVE_FOLDER_ID;

    // Check per-user folder first (from drive-index-folder setup)
    const { data: userFolder } = await admin
      .from("user_drive_folders")
      .select("folder_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (userFolder) {
      resolvedFolderId = (userFolder as { folder_id: string }).folder_id;
    }

    if (!GOOGLE_EMAIL || !GOOGLE_PRIVATE_KEY) {
      return errResponse(503, {
        error: "Integração Google não configurada na plataforma. Contate o suporte.",
        status: "google_nao_configurado",
      });
    }
    if (!resolvedFolderId) {
      return errResponse(503, {
        error: "Nenhuma pasta do Google Drive configurada. Cole a URL da pasta na seção de cobranças.",
        status: "drive_folder_nao_configurada",
      });
    }

    // ── 5. Obtém access token Google ──────────────────────────────────────────

    // ── Fast path: if user has a drive index, use it (no need to re-list Drive) ─
    // batchMatchDebtors reads user_drive_index (pre-indexed) which is much faster.
    const { data: indexCount } = await admin
      .from("user_drive_index")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);

    if ((indexCount as unknown as number ?? 0) > 0) {
      // Use the cached index for fast matching
      const matchResult = await batchMatchDebtors(admin, userId, { onlyUnmatched: false });
      const now2 = new Date().toISOString();

      // Count debtors with drive_file_id after matching
      const { data: matchedRows } = await admin
        .from("user_registros_financeiros")
        .select("id, drive_file_id, drive_file_name, drive_file_url, drive_match_score")
        .eq("user_id", userId)
        .not("drive_file_id", "is", null);

      const matchedCount2 = matchedRows?.length ?? 0;
      const totalDebtors  = matchResult.total;

      // Log this match run
      await admin.from("user_drive_match_logs").insert({
        user_id: userId, folder_id: resolvedFolderId,
        files_found: (indexCount as unknown as number ?? 0),
        debtors_matched: matchedCount2,
        debtors_total: totalDebtors,
        status: "success", metadata: { source: "index_cache", plan: subscription.plan },
      });

      return okResponse({
        success: true, status: "success",
        filesFound: (indexCount as unknown as number ?? 0),
        debtorsTotal: totalDebtors,
        debtorsMatched: matchedCount2,
        error: null, logId: null, matchedAt: now2,
        matches: (matchedRows ?? []).map((r: Record<string, unknown>) => ({
          debtorId: r.id, fileId: r.drive_file_id, fileName: r.drive_file_name,
          fileUrl: r.drive_file_url, score: r.drive_match_score,
        })),
      });
    }

    // ── Slow path: no index — fall back to legacy filename-only matching ──────
    let accessToken: string;
    try {
      accessToken = await getGoogleAccessToken(
        GOOGLE_EMAIL,
        GOOGLE_PRIVATE_KEY,
        "https://www.googleapis.com/auth/drive.readonly",
      );
    } catch (e) {
      return errResponse(502, {
        error: e instanceof Error ? e.message : "Falha na autenticacao Google.",
        status: "google_auth_erro",
      });
    }

    // ── 6. Lista PDFs na pasta ─────────────────────────────────────────────────
    let driveFiles: Awaited<ReturnType<typeof listFilesInFolder>>;
    try {
      driveFiles = await listFilesInFolder(resolvedFolderId, accessToken);
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : "Erro ao listar arquivos do Drive.";
      await admin.from("user_drive_match_logs").insert({
        user_id: userId,
        folder_id: resolvedFolderId,
        files_found: 0,
        debtors_matched: 0,
        debtors_total: 0,
        status: "error",
        error_message: errMsg.slice(0, 500),
        metadata: { plan: subscription.plan },
      });
      return errResponse(422, { error: errMsg, status: "drive_leitura_erro" });
    }

    // ── 7. Lê devedores do usuário ────────────────────────────────────────────
    const { data: rawDebtors } = await admin
      .from("user_registros_financeiros")
      .select("id, document_number, client_name, phone")
      .eq("user_id", userId);

    const debtors: DebtorMatchInput[] = ((rawDebtors ?? []) as Array<Record<string, string>>).map((r) => ({
      id:             r.id,
      documentNumber: (r.document_number ?? "").replace(/[^a-z0-9]/gi, ""),
      clientName:     r.client_name ?? "",
      phone:          r.phone ?? "",
    }));

    // ── 8. Calcula matches ────────────────────────────────────────────────────
    const matches = matchDebtorsToFiles(debtors, driveFiles);

    // ── 9. Atualiza colunas drive_* ────────────────────────────────────────────
    let matchedCount = 0;
    const now = new Date().toISOString();

    for (const m of matches) {
      if (m.fileId) {
        matchedCount++;
        await admin
          .from("user_registros_financeiros")
          .update({
            drive_file_id:       m.fileId,
            drive_file_name:     m.fileName,
            drive_file_url:      m.fileUrl,
            drive_match_score:   m.score,
            drive_last_match_at: now,
            updated_at:          now,
          })
          .eq("id", m.debtorId)
          .eq("user_id", userId);
      } else {
        // Limpa match anterior caso não haja correspondência
        await admin
          .from("user_registros_financeiros")
          .update({
            drive_file_id:       null,
            drive_file_name:     null,
            drive_file_url:      null,
            drive_match_score:   null,
            drive_last_match_at: now,
            updated_at:          now,
          })
          .eq("id", m.debtorId)
          .eq("user_id", userId);
      }
    }

    // ── 10. Registra log ──────────────────────────────────────────────────────
    const { data: logEntry } = await admin
      .from("user_drive_match_logs")
      .insert({
        user_id: userId,
        folder_id: resolvedFolderId,
        files_found: driveFiles.length,
        debtors_matched: matchedCount,
        debtors_total: debtors.length,
        status: "success",
        error_message: null,
        metadata: { plan: subscription.plan, filesFound: driveFiles.length },
      })
      .select("id")
      .single();

    // ── 11. Incrementa drive_lookups ──────────────────────────────────────────
    const period = getPeriodKey();
    const { data: usageRow } = await admin
      .from("user_usage_counters")
      .select("charges_sent, sheets_imports, drive_lookups")
      .eq("user_id", userId)
      .eq("period", period)
      .maybeSingle();

    await admin.from("user_usage_counters").upsert(
      {
        user_id:        userId,
        period,
        charges_sent:   Number(usageRow?.charges_sent   ?? 0),
        sheets_imports: Number(usageRow?.sheets_imports ?? 0),
        drive_lookups:  Number(usageRow?.drive_lookups  ?? 0) + 1,
        updated_at:     now,
      },
      { onConflict: "user_id,period" },
    );

    // ── 12. Retorna resumo ────────────────────────────────────────────────────
    return okResponse({
      success:         true,
      status:          "success",
      filesFound:      driveFiles.length,
      debtorsTotal:    debtors.length,
      debtorsMatched:  matchedCount,
      error:           null,
      logId:           (logEntry as { id: string } | null)?.id ?? null,
      matchedAt:       now,
      // Lista dos matches para o frontend atualizar state local
      matches: matches.map((m) => ({
        debtorId:  m.debtorId,
        fileId:    m.fileId,
        fileName:  m.fileName,
        fileUrl:   m.fileUrl,
        score:     m.score,
      })),
    });

  } catch (err) {
    console.error("[match-drive-files] unhandled:", err);
    return errResponse(500, {
      error: "Erro interno. Tente novamente ou contate o suporte.",
      status: "erro_interno",
    });
  }
});
