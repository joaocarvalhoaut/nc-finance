import type { User } from "@supabase/supabase-js";
import type { AccountProfile } from "../types";
import { getSupabaseClient } from "./supabaseClient";
import { isValidCPF } from "../utils/cpf";

export interface UserProfileData {
  full_name: string;
  cpf: string;
  phone: string;
  cep: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  created_at?: string;
}

/** Busca o perfil (KYC) do usuário logado — dados cadastrais. */
export async function getMyProfile(userId: string): Promise<UserProfileData | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("user_profiles")
    .select("full_name, cpf, phone, cep, address, city, state, created_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return null;
  return (data as UserProfileData) ?? null;
}

/**
 * Como getMyProfile, mas distingue "não tem perfil" (null) de "não deu para
 * ler" (lança) — falha de rede não pode mandar a conta preencher tudo de novo.
 */
export async function fetchMyProfileOrThrow(userId: string): Promise<UserProfileData | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("user_profiles")
    .select("full_name, cpf, phone, cep, address, city, state, created_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message || "Falha ao carregar o cadastro.");
  return (data as UserProfileData) ?? null;
}

/**
 * Cadastro completo = os dados que o formulário de cadastro exige. Conta sem
 * eles (criada antes da correção do cadastro, ou sem perfil) precisa completar
 * antes de usar o sistema.
 */
export const isProfileComplete = (p: UserProfileData | null): boolean => {
  if (!p) return false;
  const digitos = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");
  return Boolean(
    p.full_name?.trim() &&
    isValidCPF(digitos(p.cpf)) &&
    digitos(p.phone).length >= 10 &&
    digitos(p.cep).length === 8 &&
    p.address?.trim() && p.city?.trim() && p.state?.trim(),
  );
};

/**
 * Grava (ou completa) o perfil do usuário logado. `accepted_terms_at` vem do
 * aceite marcado no cadastro (user_metadata); sem ele, o valor já gravado fica.
 */
export async function saveMyProfile(userId: string, data: {
  full_name: string; cpf: string; phone: string; cep: string; address: string; city: string; state: string;
  accepted_terms_at?: string;
}): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from("user_profiles").upsert(
    {
      user_id: userId,
      full_name: data.full_name.trim(),
      cpf: data.cpf.replace(/\D/g, ""),
      phone: data.phone.replace(/\D/g, ""),
      cep: data.cep.replace(/\D/g, ""),
      address: data.address.trim(),
      city: data.city.trim(),
      state: data.state.trim().toUpperCase(),
      ...(data.accepted_terms_at ? { accepted_terms_at: data.accepted_terms_at } : {}),
    },
    { onConflict: "user_id" },
  );
  if (error) {
    // 23505 = CPF já usado em outra conta (índice único user_profiles_cpf_unique).
    if (error.code === "23505") throw new Error("Este CPF já está cadastrado em outra conta. Fale com o suporte.");
    throw new Error("Não foi possível salvar seus dados. Tente novamente.");
  }
}

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

/**
 * Exportação de dados (LGPD — portabilidade). Baixa um JSON com todos os dados
 * do usuário. Dispara o download no navegador.
 */
export async function exportMyData(): Promise<void> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.functions.invoke("export-user-data", { method: "POST" });
  if (error) throw new Error(error.message || "Falha ao exportar os dados.");

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `nc-finance-dados-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
