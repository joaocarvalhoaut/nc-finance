/**
 * export-user-data — Portabilidade de dados (LGPD art. 18, V).
 *
 * Reúne TODOS os dados do usuário autenticado num único JSON para download.
 * Só lê dados do próprio usuário (userId vem do token). Registra a exportação
 * na trilha de auditoria.
 */

import { createClient } from "npm:@supabase/supabase-js@2.49.8";
import { corsHeaders } from "../_shared/cors.ts";
import { writeAudit } from "../_shared/auditLog.ts";

const SUPABASE_URL      = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const SERVICE_ROLE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

// Tabelas exportadas (todas escopadas por user_id). Segredos/credenciais de
// integração (tokens Z-API etc.) são propositalmente OMITIDOS do export.
const EXPORT_TABLES = [
  "user_profiles",
  "user_registros_financeiros",
  "user_logs_cobranca",
  "user_automation_rules",
  "user_automation_runs",
  "user_contatos",
  "user_configuracoes",
  "user_representantes",
  "user_message_templates",
  "user_do_not_contact",
  "user_audit_log",
];

const json = (status: number, body: unknown, extraHeaders: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...extraHeaders },
  });

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader) return json(401, { error: "Não autenticado." });

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) return json(401, { error: "Sessão inválida." });
    const userId = user.id;

    const exportData: Record<string, unknown> = {
      exported_at: new Date().toISOString(),
      account: { id: userId, email: user.email, created_at: user.created_at },
    };

    for (const table of EXPORT_TABLES) {
      // Usa o client do usuário (RLS garante que só vêm as linhas dele).
      const { data, error } = await supabase.from(table).select("*");
      exportData[table] = error ? { _error: error.message } : (data ?? []);
    }

    await writeAudit(admin, request, {
      userId,
      userEmail: user.email ?? null,
      action: "data.exported",
      resource: "all",
      details: { tables: EXPORT_TABLES.length },
    });

    const filename = `nc-finance-dados-${new Date().toISOString().slice(0, 10)}.json`;
    return json(200, exportData, {
      "Content-Disposition": `attachment; filename="${filename}"`,
    });
  } catch (e) {
    console.error(`[export-user-data] erro: ${e instanceof Error ? e.message : String(e)}`);
    return json(500, { error: "Erro interno." });
  }
});
