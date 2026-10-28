/**
 * Nome da empresa que assina as cobranças (user_profiles.company_name), para
 * preencher {empresa} nos modelos — ver assinatura.ts.
 *
 * Nunca derruba o envio: sem perfil, sem nome ou com erro de leitura devolve
 * null e a assinatura sai sem nome ("Equipe financeira.").
 */
import { createClient } from "npm:@supabase/supabase-js@2.49.8";

// deno-lint-ignore no-explicit-any
type AdminClient = ReturnType<typeof createClient<any, any, any>>;

export async function loadCompanyName(admin: AdminClient, userId: string): Promise<string | null> {
  try {
    const { data, error } = await admin
      .from("user_profiles")
      .select("company_name")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) return null;
    const nome = (data as { company_name?: string | null } | null)?.company_name;
    return typeof nome === "string" && nome.trim() ? nome.trim() : null;
  } catch {
    return null;
  }
}
