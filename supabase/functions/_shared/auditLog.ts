// deno-lint-ignore-file no-explicit-any
/**
 * Trilha de auditoria para Edge Functions — grava ações sensíveis em
 * user_audit_log (ver migration 20260811120000_audit_log.sql).
 *
 * FAIL-OPEN: se a gravação do log falhar, NÃO interrompe a operação principal
 * (um erro no log de auditoria não pode impedir o usuário de, por exemplo,
 * excluir a própria conta). A falha é apenas registrada no console.
 */

export interface AuditEntry {
  userId:    string | null;
  userEmail?: string | null;
  action:    string;              // ex.: "account.deleted", "data.exported"
  resource?: string | null;
  details?:  Record<string, unknown>;
}

/** Extrai o IP do cliente dos headers de proxy (Supabase/Vercel). */
function clientIp(req: Request): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip");
}

export async function writeAudit(
  admin: any,
  req: Request | null,
  entry: AuditEntry,
): Promise<void> {
  try {
    await admin.from("user_audit_log").insert({
      user_id:    entry.userId,
      user_email: entry.userEmail ?? null,
      action:     entry.action,
      resource:   entry.resource ?? null,
      details:    entry.details ?? {},
      ip:         req ? clientIp(req) : null,
      user_agent: req ? (req.headers.get("user-agent") ?? null) : null,
    });
  } catch (e) {
    console.warn(`[auditLog] falha ao gravar '${entry.action}': ${e instanceof Error ? e.message : String(e)}`);
  }
}
