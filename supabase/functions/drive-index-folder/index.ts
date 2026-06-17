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
  extractPendingContent,
  batchMatchDebtors,
  getDriveAccessToken,
} from "../_shared/driveFolderIndex.ts";

// ─── Env ──────────────────────────────────────────────────────────────────────

const SUPABASE_URL      = Deno.env.get("SUPABASE_URL")             ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")        ?? "";
const SERVICE_ROLE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const GOOGLE_EMAIL      = Deno.env.get("GOOGLE_CLIENT_EMAIL")      ?? "";
const GOOGLE_PRIVATE_KEY= Deno.env.get("GOOGLE_PRIVATE_KEY")       ?? "";
// Segredo usado pela função para se re-invocar em background (auto-encadeamento)
const CRON_SECRET       = Deno.env.get("AUTOMATION_CRON_SECRET")   ?? "";
const SELF_URL          = `${SUPABASE_URL}/functions/v1/drive-index-folder`;

// ─── Plan gate ────────────────────────────────────────────────────────────────

const DRIVE_ALLOWED_PLANS = ["pro", "premium"];

/**
 * Agenda a próxima execução do indexador em segundo plano, sem bloquear a
 * resposta atual. Usa EdgeRuntime.waitUntil (forma suportada de estender o
 * trabalho além do retorno) para garantir que o fetch de continuação dispare.
 * Cada continuação roda numa nova instância → processamento em lotes até
 * zerar o conteúdo pendente, independente da aba do usuário.
 */
function scheduleBackgroundContinue(userId: string, folderId: string): void {
  if (!CRON_SECRET) {
    console.warn("[drive-index-folder] AUTOMATION_CRON_SECRET ausente — auto-continuação desabilitada");
    return;
  }
  const kick = (async () => {
    try {
      await fetch(SELF_URL, {
        method: "POST",
        headers: { "Authorization": `Bearer ${CRON_SECRET}`, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "continue", userId, folderId }),
      });
    } catch (e) {
      console.error("[drive-index-folder] continue kick failed:", e instanceof Error ? e.message : String(e));
    }
  })();
  const rt = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (rt?.waitUntil) rt.waitUntil(kick); else void kick;
}

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

    // ── Background self-continuation (auth por cron-secret, sem JWT de usuário) ─
    if (request.method === "POST" && CRON_SECRET && authHeader === `Bearer ${CRON_SECRET}`) {
      const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
      let cbody: { action?: string; userId?: string; folderId?: string } = {};
      try { cbody = await request.json(); } catch { /* corpo vazio */ }

      if (cbody.action === "continue" && cbody.userId && cbody.folderId) {
        const token = await getDriveAccessToken();
        if (!token) return ok({ success: false, status: "google_nao_configurado" });
        try {
          // Só extrai conteúdo dos pendentes (lê do índice) — NÃO re-varre o Drive
          const r = await extractPendingContent(admin, cbody.userId, cbody.folderId, token);
          if (r.remaining > 0) {
            scheduleBackgroundContinue(cbody.userId, cbody.folderId);
          } else {
            // Conteúdo completo — casa devedores ainda sem boleto
            await batchMatchDebtors(admin, cbody.userId, { onlyUnmatched: true });
          }
          return ok({ success: true, status: r.remaining > 0 ? "indexing" : "done", contentPending: r.remaining });
        } catch (e) {
          // Em caso de erro, encerra o encadeamento (reindex manual retoma)
          console.error("[drive-index-folder] continue error:", e instanceof Error ? e.message : String(e));
          return err(500, { error: "Erro na continuação.", status: "sync_erro" });
        }
      }
      return err(400, { error: "Requisição de continuação inválida.", status: "payload_invalido" });
    }

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

      // Progresso da indexação de conteúdo: quantos PDFs já tiveram o conteúdo lido
      const fileCount = Number(row.file_count ?? 0);
      const { count: contentDone } = await admin
        .from("user_drive_index")
        .select("file_id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("metadata_extraction_attempted", true);

      const contentIndexed = contentDone ?? 0;
      const indexing = fileCount > 0 && contentIndexed < fileCount;

      return ok({
        configured:     true,
        folderName:     row.folder_name ?? null,
        isAccessible:   row.is_accessible,
        fileCount,
        contentIndexed,                 // PDFs com conteúdo já extraído
        indexing,                       // true enquanto a indexação de conteúdo roda
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

      // Indexa o 1º lote de forma síncrona e encadeia o restante em background.
      let firstBatch;
      try {
        firstBatch = await indexFolderForUser(admin, userId, folderId, accessToken);
      } catch (e) {
        await admin
          .from("user_drive_folders")
          .update({ last_index_error: String(e instanceof Error ? e.message : e).slice(0, 500), updated_at: new Date().toISOString() })
          .eq("user_id", userId);
        return err(500, { error: "Falha ao indexar a pasta.", status: "sync_erro" });
      }

      if (firstBatch.contentPending > 0) {
        scheduleBackgroundContinue(userId, folderId);
      } else {
        await batchMatchDebtors(admin, userId, { onlyUnmatched: true });
      }

      return ok({
        success:        true,
        status:         firstBatch.contentPending > 0 ? "indexing" : "done",
        message:        firstBatch.contentPending > 0
          ? `Pasta "${folderName ?? folderId}" conectada. Indexando ${fileCount} boleto(s) em segundo plano…`
          : `Pasta "${folderName ?? folderId}" conectada e indexada (${fileCount} boleto(s)).`,
        folderId,
        folderName,
        fileCount,
        contentPending: firstBatch.contentPending,
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

      // Encadeia o restante em background; quando o conteúdo zera, casa devedores.
      let debtorsMatched = 0;
      if (indexResult.contentPending > 0) {
        scheduleBackgroundContinue(userId, folderId);
      } else {
        const m = await batchMatchDebtors(admin, userId, { onlyUnmatched: true });
        debtorsMatched = m.matched;
      }

      return ok({
        success:      true,
        status:       indexResult.contentPending > 0 ? "indexing" : "synced",
        filesFound:   indexResult.filesFound,
        filesIndexed: indexResult.filesIndexed,
        filesSkipped: indexResult.filesSkipped,
        durationMs:   indexResult.durationMs,
        contentPending: indexResult.contentPending,
        debtorsMatched,
        debtorsTotal:   0,
      });
    }

    return err(400, { error: `Ação desconhecida: ${action}`, status: "acao_invalida" });

  } catch (e) {
    console.error("[drive-index-folder] unhandled:", e instanceof Error ? e.message : String(e));
    return err(500, { error: "Erro interno. Tente novamente.", status: "erro_interno" });
  }
});
