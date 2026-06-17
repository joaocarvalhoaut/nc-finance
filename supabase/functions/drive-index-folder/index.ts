/**
 * drive-index-folder — Edge Function para indexação da pasta Drive por usuário.
 *
 * Operações suportadas:
 *
 *   POST { action: "save", folderUrl }
 *     → Extrai o folderId da URL, valida acesso, salva em user_drive_folders,
 *       indexa todos os PDFs e retorna resumo.
 *
 *   POST { action: "sync" }
 *     → Re-indexa a pasta já configurada do usuário (incremental).
 *
 *   GET (sem body)
 *     → Retorna a config atual da pasta do usuário + estatísticas do index.
 *
 * Segurança:
 *   - service_role: toda escrita em user_drive_folders / user_drive_index
 *   - Nunca retorna file IDs internos do Drive ao frontend
 *   - Nunca retorna access tokens / credenciais Google
 *   - Logs sanitizados
 */

import { createClient } from "npm:@supabase/supabase-js@2.49.8";
import { corsHeaders } from "../_shared/cors.ts";
import { checkSubscription } from "../_shared/subscriptionGuard.ts";
import { getGoogleAccessToken, listFilesInFolderDeep } from "../_shared/googleDrive.ts";
import {
  saveFolderConfig,
  indexFolderForUser,
  batchMatchDebtors,
  getDriveAccessToken,
} from "../_shared/driveFolderIndex.ts";

// ─── Env ──────────────────────────────────────────────────────────────────────

const SUPABASE_URL      = Deno.env.get("SUPABASE_URL")             ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")        ?? "";
const SERVICE_ROLE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const GOOGLE_EMAIL      = Deno.env.get("GOOGLE_CLIENT_EMAIL")      ?? "";
const GOOGLE_PRIVATE_KEY= Deno.env.get("GOOGLE_PRIVATE_KEY")       ?? "";

// ─── Plan gate ────────────────────────────────────────────────────────────────

const DRIVE_ALLOWED_PLANS = ["pro", "premium"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ok  = (body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const err = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

/**
 * Extract the Drive folder ID from various URL formats:
 *   https://drive.google.com/drive/folders/{id}
 *   https://drive.google.com/drive/u/0/folders/{id}
 *   https://drive.google.com/open?id={id}
 *   plain folder ID (26-char alphanumeric)
 */
function extractFolderIdFromUrl(input: string): string | null {
  const s = input.trim();
  // Already a plain ID (no slashes/dots in expected Drive ID format)
  if (/^[A-Za-z0-9_-]{25,45}$/.test(s)) return s;

  const patterns = [
    /\/folders\/([A-Za-z0-9_-]{25,45})/,
    /[?&]id=([A-Za-z0-9_-]{25,45})/,
    /\/d\/([A-Za-z0-9_-]{25,45})/,
  ];

  for (const p of patterns) {
    const m = s.match(p);
    if (m) return m[1];
  }
  return null;
}

/**
 * Resolve the folder name from Drive API.
 * Returns null if not accessible.
 */
async function resolveFolderName(folderId: string, accessToken: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${folderId}?fields=name`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(8_000),
      },
    );
    if (!res.ok) return null;
    const data = await res.json() as { name?: string };
    return data.name ?? null;
  } catch {
    return null;
  }
}

// ─── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ── Auth ─────────────────────────────────────────────────────────────────
    const authHeader = request.headers.get("Authorization");
    if (!authHeader) return err(401, { error: "Nao autenticado.", status: "nao_autenticado" });

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) return err(401, { error: "Sessao invalida.", status: "nao_autenticado" });
    const userId = user.id;

    // ── Subscription ─────────────────────────────────────────────────────────
    const subResult = await checkSubscription(admin, userId);
    if (!subResult.ok) {
      return err(subResult.guard.statusCode, { error: subResult.guard.error, status: subResult.guard.kind });
    }
    if (!DRIVE_ALLOWED_PLANS.includes(subResult.subscription.plan)) {
      return err(403, {
        error: "Integração com Google Drive disponível apenas nos planos Pro e Premium.",
        status: "bloqueado_plano",
      });
    }

    // ── Google credentials ────────────────────────────────────────────────────
    if (!GOOGLE_EMAIL || !GOOGLE_PRIVATE_KEY) {
      return err(503, {
        error: "Integração Google não configurada. Contate o suporte.",
        status: "google_nao_configurado",
      });
    }

    // ── GET: return current folder config ─────────────────────────────────────
    if (request.method === "GET") {
      const { data: folderRow } = await admin
        .from("user_drive_folders")
        .select("folder_id, folder_name, is_accessible, file_count, last_indexed_at, last_index_error")
        .eq("user_id", userId)
        .maybeSingle();

      if (!folderRow) {
        return ok({ configured: false, folderName: null, fileCount: 0, lastIndexedAt: null });
      }

      const row = folderRow as Record<string, unknown>;

      // Count unmatched debtors
      const { count: unmatchedCount } = await admin
        .from("user_registros_financeiros")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .is("drive_file_id", null);

      return ok({
        configured:     true,
        folderName:     row.folder_name ?? null,
        isAccessible:   row.is_accessible,
        fileCount:      Number(row.file_count  ?? 0),
        lastIndexedAt:  row.last_indexed_at   ?? null,
        lastIndexError: row.last_index_error  ?? null,
        unmatchedDebtors: unmatchedCount ?? 0,
      });
    }

    // ── POST: parse body ──────────────────────────────────────────────────────
    let body: { action?: string; folderUrl?: string } = {};
    try { body = await request.json(); } catch { /* empty body = GET-like */ }

    const action = body.action ?? "status";

    // ── GET status (POST with action:"status" or no action) ───────────────────
    if (action === "status") {
      const { data: folderRow } = await admin
        .from("user_drive_folders")
        .select("folder_name, is_accessible, file_count, last_indexed_at")
        .eq("user_id", userId)
        .maybeSingle();

      return ok({
        configured:    !!folderRow,
        folderName:    (folderRow as Record<string, unknown> | null)?.folder_name ?? null,
        fileCount:     Number((folderRow as Record<string, unknown> | null)?.file_count ?? 0),
        lastIndexedAt: (folderRow as Record<string, unknown> | null)?.last_indexed_at ?? null,
      });
    }

    // ── SAVE: set a new folder URL ────────────────────────────────────────────
    if (action === "save") {
      if (!body.folderUrl?.trim()) {
        return err(400, { error: "Campo obrigatório: folderUrl.", status: "payload_invalido" });
      }

      const folderId = extractFolderIdFromUrl(body.folderUrl);
      if (!folderId) {
        return err(400, {
          error: "URL inválida. Cole o link da pasta do Google Drive (ex: drive.google.com/drive/folders/...).",
          status: "url_invalida",
        });
      }

      // Get access token
      let accessToken: string;
      try {
        accessToken = await getGoogleAccessToken(
          GOOGLE_EMAIL, GOOGLE_PRIVATE_KEY,
          "https://www.googleapis.com/auth/drive.readonly",
        );
      } catch {
        return err(502, { error: "Falha na autenticação com o Google. Contate o suporte.", status: "google_auth_erro" });
      }

      // Validate access by attempting to list files
      let isAccessible = false;
      let fileCount = 0;
      let folderName: string | null = null;
      let listError: string | null = null;

      try {
        folderName = await resolveFolderName(folderId, accessToken);
        const files = await listFilesInFolderDeep(folderId, accessToken);
        isAccessible = true;
        fileCount = files.length;
      } catch (e) {
        listError = e instanceof Error ? e.message : "Sem acesso à pasta.";
        isAccessible = false;
      }

      // Save config regardless (user may fix permissions later and resync)
      await saveFolderConfig(admin, userId, body.folderUrl, folderId, folderName, isAccessible);

      if (!isAccessible) {
        return err(422, {
          error: `Pasta inacessível: ${listError}. Compartilhe a pasta com o e-mail da conta do sistema.`,
          status: "drive_sem_acesso",
          folderId,        // safe to return — user just pasted this
          serviceAccountHint: GOOGLE_EMAIL,  // the email to share with
        });
      }

      // Trigger background indexing (do not await — returns fast)
      void (async () => {
        try {
          await indexFolderForUser(admin, userId, folderId, accessToken);
          await batchMatchDebtors(admin, userId, { onlyUnmatched: true });
        } catch (e) {
          console.error("[drive-index-folder] background index error:", e instanceof Error ? e.message : String(e));
          await admin
            .from("user_drive_folders")
            .update({ last_index_error: String(e instanceof Error ? e.message : e).slice(0, 500), updated_at: new Date().toISOString() })
            .eq("user_id", userId);
        }
      })();

      return ok({
        success:     true,
        status:      "indexing",
        message:     `Pasta "${folderName ?? folderId}" salva. Indexando ${fileCount} boleto(s) em segundo plano…`,
        folderId,
        folderName,
        fileCount,
      });
    }

    // ── SYNC: re-index existing folder ────────────────────────────────────────
    if (action === "sync") {
      const { data: folderRow } = await admin
        .from("user_drive_folders")
        .select("folder_id")
        .eq("user_id", userId)
        .maybeSingle();

      if (!folderRow) {
        return err(404, { error: "Nenhuma pasta configurada. Salve uma pasta primeiro.", status: "pasta_nao_configurada" });
      }

      const folderId = (folderRow as { folder_id: string }).folder_id;

      let accessToken: string;
      try {
        const tok = await getDriveAccessToken();
        if (!tok) throw new Error("credenciais ausentes");
        accessToken = tok;
      } catch {
        return err(502, { error: "Falha na autenticação com o Google.", status: "google_auth_erro" });
      }

      // Sync = SOMENTE indexação (varredura + extração). O casamento é feito
      // separadamente pelo botão "Buscar boletos" (match-drive-files), evitando
      // estourar o tempo da função em pastas com milhares de PDFs.
      let indexResult;
      try {
        indexResult = await indexFolderForUser(admin, userId, folderId, accessToken);
      } catch (e) {
        return err(500, {
          error: e instanceof Error ? e.message : "Erro na sincronização.",
          status: "sync_erro",
        });
      }

      return ok({
        success:      true,
        status:       "synced",
        filesFound:   indexResult.filesFound,
        filesIndexed: indexResult.filesIndexed,
        filesSkipped: indexResult.filesSkipped,
        durationMs:   indexResult.durationMs,
        debtorsMatched: 0,
        debtorsTotal:   0,
      });
    }

    return err(400, { error: `Ação desconhecida: ${action}`, status: "acao_invalida" });

  } catch (e) {
    console.error("[drive-index-folder] unhandled:", e instanceof Error ? e.message : String(e));
    return err(500, { error: "Erro interno. Tente novamente.", status: "erro_interno" });
  }
});
