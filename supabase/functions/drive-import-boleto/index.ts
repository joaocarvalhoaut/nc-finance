/**
 * drive-import-boleto — importa para o sistema um boleto já localizado no Google
 * Drive (estado "sugerido") e o copia para o Storage `charge-pdfs`.
 *
 * Pré-condição: o devedor já passou pelo match-drive-files, logo
 * `drive_file_id` contém o ID do arquivo no Drive (não "uploaded").
 *
 * Fluxo:
 *  1. Valida JWT / auth.uid()
 *  2. Valida assinatura (trialing | active) + plano (pro | premium)
 *  3. Lê o registro do devedor (server-side) e pega drive_file_id
 *  4. getDriveAccessToken() + downloadDriveFile() (Service Account)
 *  5. Faz upload dos bytes para charge-pdfs/${userId}/${debtorId}/boleto.<ext>
 *  6. Atualiza a linha: drive_file_id='uploaded', drive_file_url=<URL pública>
 *  7. Retorna { success, fileName, fileUrl }
 *
 * Ao ficar "uploaded", o envio (send-whatsapp-batch) passa a anexar o link
 * público do boleto na mensagem — exatamente como no upload manual.
 *
 * Segredos: GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY (Service Account).
 */

import { createClient } from "npm:@supabase/supabase-js@2.49.8";
import { corsHeaders } from "../_shared/cors.ts";
import { getDriveAccessToken, downloadDriveFile } from "../_shared/driveFolderIndex.ts";

// ─── Env ──────────────────────────────────────────────────────────────────────

const SUPABASE_URL      = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const SERVICE_ROLE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const DRIVE_ALLOWED_PLANS = ["pro", "premium"];
const STORAGE_BUCKET = "charge-pdfs";
const MAX_BOLETO_BYTES = 10 * 1024 * 1024; // 10 MB

// ─── Helpers ──────────────────────────────────────────────────────────────────

const okResponse = (body: Record<string, unknown>) =>
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
      return errResponse(401, { success: false, error: "Nao autenticado.", status: "nao_autenticado" });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) {
      return errResponse(401, { success: false, error: "Sessao invalida.", status: "nao_autenticado" });
    }
    const userId = user.id;

    // ── 2. Valida assinatura + plano ───────────────────────────────────────────
    const { data: subscription } = await admin
      .from("user_subscriptions")
      .select("status, plan")
      .eq("user_id", userId)
      .maybeSingle();

    if (!subscription || !["trialing", "active"].includes(subscription.status)) {
      return errResponse(403, { success: false, error: "Assinatura necessaria para usar o Drive.", status: "bloqueado_assinatura" });
    }
    if (!DRIVE_ALLOWED_PLANS.includes(subscription.plan)) {
      return errResponse(403, { success: false, error: "Integração com Google Drive disponível nos planos Pro e Premium.", status: "bloqueado_plano" });
    }

    // ── 3. Lê o registro do devedor ────────────────────────────────────────────
    const body = await request.json().catch(() => ({})) as { debtorId?: string };
    const debtorId = String(body.debtorId ?? "").trim();
    if (!debtorId) {
      return errResponse(400, { success: false, error: "debtorId obrigatório.", status: "erro_interno" });
    }

    const { data: row, error: rowErr } = await admin
      .from("user_registros_financeiros")
      .select("id, drive_file_id, drive_file_name")
      .eq("id", debtorId)
      .eq("user_id", userId)
      .maybeSingle();

    if (rowErr || !row) {
      return errResponse(404, { success: false, error: "Devedor não encontrado.", status: "erro_interno" });
    }

    const driveFileId = (row as { drive_file_id: string | null }).drive_file_id;
    const driveFileName = (row as { drive_file_name: string | null }).drive_file_name ?? "boleto.pdf";

    if (!driveFileId) {
      return errResponse(400, { success: false, error: "Nenhum boleto sugerido para este devedor.", status: "erro_interno" });
    }
    if (driveFileId === "uploaded") {
      return errResponse(409, { success: false, error: "Boleto já importado.", status: "erro_interno" });
    }

    // ── 4. Baixa o PDF do Drive ────────────────────────────────────────────────
    const accessToken = await getDriveAccessToken();
    if (!accessToken) {
      return errResponse(503, { success: false, error: "Integração Google não configurada.", status: "google_nao_configurado" });
    }

    const bytes = await downloadDriveFile(driveFileId, accessToken, MAX_BOLETO_BYTES);
    if (!bytes || bytes.length === 0) {
      return errResponse(502, { success: false, error: "Falha ao baixar o boleto do Drive.", status: "drive_leitura_erro" });
    }

    // ── 5. Upload para o Storage (mesmo path que o sender espera) ───────────────
    const ext = (driveFileName.split(".").pop() || "pdf").toLowerCase();
    const path = `${userId}/${debtorId}/boleto.${ext}`;

    const { error: uploadErr } = await admin.storage
      .from(STORAGE_BUCKET)
      .upload(path, bytes, { upsert: true, contentType: "application/pdf" });

    if (uploadErr) {
      return errResponse(500, { success: false, error: `Falha ao salvar o boleto: ${uploadErr.message}`, status: "erro_interno" });
    }

    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${path}`;

    // ── 6. Marca como importado ("uploaded") ───────────────────────────────────
    const { error: updErr } = await admin
      .from("user_registros_financeiros")
      .update({
        drive_file_id:   "uploaded",
        drive_file_name: driveFileName,
        drive_file_url:  publicUrl,
        updated_at:      new Date().toISOString(),
      })
      .eq("id", debtorId)
      .eq("user_id", userId);

    if (updErr) {
      return errResponse(500, { success: false, error: `Falha ao atualizar o registro: ${updErr.message}`, status: "erro_interno" });
    }

    return okResponse({ success: true, status: "success", fileName: driveFileName, fileUrl: publicUrl });
  } catch (err) {
    return errResponse(500, {
      success: false,
      error: err instanceof Error ? err.message : "Erro interno.",
      status: "erro_interno",
    });
  }
});
