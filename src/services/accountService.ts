import type { User } from "@supabase/supabase-js";
import type { AccountProfile } from "../types";
import { getSupabaseClient } from "./supabaseClient";

const buildDisplayName = (user: User | null) => {
  if (!user) {
    return "";
  }

  const metadataName =
    typeof user.user_metadata?.full_name === "string"
      ? user.user_metadata.full_name.trim()
      : "";

  if (metadataName) {
    return metadataName;
  }

  const emailPrefix = (user.email || "").split("@")[0]?.trim();
  return emailPrefix || "Conta autenticada";
};

export const getAccountProfile = (user: User | null): AccountProfile | null => {
  if (!user?.id || !user.email) {
    return null;
  }

  return {
    userId: user.id,
    email: user.email,
    displayName: buildDisplayName(user)
  };
};

/**
 * Exclusão de conta (LGPD — direito de eliminação). Chama a Edge Function
 * delete-account, que apaga Storage + todas as tabelas (via cascade) + a conta
 * de auth. Irreversível.
 */
export async function deleteMyAccount(): Promise<{ success: boolean; filesRemoved?: number }> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.functions.invoke<{ success: boolean; filesRemoved?: number; error?: string }>(
    "delete-account",
    { method: "POST" },
  );
  if (error) throw new Error(error.message || "Falha ao excluir a conta.");
  if (!data?.success) throw new Error(data?.error || "Falha ao excluir a conta.");
  return { success: true, filesRemoved: data.filesRemoved };
}
