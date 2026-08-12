import { getSupabaseClient } from "./supabaseClient";

/**
 * Lista "não contatar" (opt-out) — controle manual pelo usuário.
 * A checagem no envio é feita no backend; aqui o usuário adiciona/remove
 * telefones. RLS garante que só mexe na própria lista.
 */

const onlyDigits = (s: string) => (s ?? "").replace(/\D/g, "");

/** Adiciona telefones à lista de não-contatar (idempotente). */
export async function addOptOuts(
  userId: string,
  entries: Array<{ phone: string; reason?: string }>,
): Promise<number> {
  const supabase = getSupabaseClient();
  const rows = entries
    .map((e) => ({
      user_id: userId,
      phone: onlyDigits(e.phone),
      reason: e.reason ?? "Marcado manualmente pelo usuário.",
      source: "manual" as const,
    }))
    .filter((r) => r.phone.length >= 8);
  if (rows.length === 0) return 0;

  const { error } = await supabase
    .from("user_do_not_contact")
    .upsert(rows, { onConflict: "user_id,phone", ignoreDuplicates: true });
  if (error) throw new Error(error.message);
  return rows.length;
}

/** Remove um telefone da lista. */
export async function removeOptOut(userId: string, phone: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("user_do_not_contact")
    .delete()
    .eq("user_id", userId)
    .eq("phone", onlyDigits(phone));
  if (error) throw new Error(error.message);
}

/** Conjunto de telefones em opt-out do usuário (para exibir status na tabela). */
export async function fetchOptOutPhones(userId: string): Promise<Set<string>> {
  const supabase = getSupabaseClient();
  const set = new Set<string>();
  const { data, error } = await supabase
    .from("user_do_not_contact")
    .select("phone")
    .eq("user_id", userId);
  if (error) return set;
  for (const r of data ?? []) set.add(onlyDigits(r.phone as string));
  return set;
}
