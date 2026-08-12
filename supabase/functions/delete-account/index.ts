/**
 * delete-account — Direito de exclusão (LGPD art. 18, VI).
 *
 * Apaga TODOS os dados do usuário autenticado:
 *   1. Grava a auditoria "account.deleted" (com ON DELETE SET NULL, o registro
 *      sobrevive à exclusão — é a prova de que/quando a conta foi apagada).
 *   2. Remove os PDFs do usuário no Storage (bucket charge-pdfs/<userId>/…).
 *   3. Deleta o usuário de auth.users → CASCADE apaga todas as tabelas user_*.
 *
 * Requer JWT válido (verify_jwt padrão = true). O usuário só pode excluir a si
 * mesmo: o userId vem do token, nunca do corpo da requisição.
 */

import { createClient } from "npm:@supabase/supabase-js@2.49.8";
import { corsHeaders } from "../_shared/cors.ts";
import { writeAudit } from "../_shared/auditLog.ts";

const SUPABASE_URL      = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const SERVICE_ROLE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const BUCKET            = "charge-pdfs";

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/** Remove recursivamente os arquivos do usuário no Storage (best-effort). */
async function purgeStorage(admin: ReturnType<typeof createClient>, userId: string): Promise<number> {
  const store = admin.storage.from(BUCKET);
  const toRemove: string[] = [];
  try {
    // Estrutura: <userId>/<debtorId>/boleto.<ext>
    const { data: subfolders } = await store.list(userId, { limit: 1000 });
    for (const sub of subfolders ?? []) {
      const { data: files } = await store.list(`${userId}/${sub.name}`, { limit: 1000 });
      for (const f of files ?? []) toRemove.push(`${userId}/${sub.name}/${f.name}`);
    }
    // Arquivos soltos direto em <userId>/
    const { data: rootFiles } = await store.list(userId, { limit: 1000 });
    for (const f of rootFiles ?? []) {
      if (f.id) toRemove.push(`${userId}/${f.name}`); // f.id != null → é arquivo, não pasta
    }
    if (toRemove.length > 0) await store.remove(toRemove);
  } catch (e) {
    console.warn(`[delete-account] purgeStorage best-effort falhou: ${e instanceof Error ? e.message : String(e)}`);
  }
  return toRemove.length;
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return json(405, { error: "Método não permitido." });
  }

  try {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader) return json(401, { error: "Não autenticado.", status: "nao_autenticado" });

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) return json(401, { error: "Sessão inválida.", status: "sessao_invalida" });

    const userId = user.id;
    const userEmail = user.email ?? null;

    // 1. Auditoria ANTES de excluir (registro sobrevive via ON DELETE SET NULL).
    await writeAudit(admin, request, {
      userId,
      userEmail,
      action: "account.deleted",
      resource: "auth.users",
      details: { self_service: true },
    });

    // 2. Storage
    const filesRemoved = await purgeStorage(admin, userId);

    // 3. Deleta o usuário → CASCADE em todas as tabelas user_*
    const { error: delErr } = await admin.auth.admin.deleteUser(userId);
    if (delErr) {
      console.error(`[delete-account] falha ao deletar auth user: ${delErr.message}`);
      return json(500, { error: "Falha ao excluir a conta. Tente novamente ou contate o suporte.", status: "erro_exclusao" });
    }

    return json(200, {
      success: true,
      status: "conta_excluida",
      filesRemoved,
      message: "Conta e todos os dados excluídos.",
    });
  } catch (e) {
    console.error(`[delete-account] erro: ${e instanceof Error ? e.message : String(e)}`);
    return json(500, { error: "Erro interno.", status: "erro_interno" });
  }
});
