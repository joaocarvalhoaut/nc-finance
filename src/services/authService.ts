import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import type { AuthCredentials, SignUpPayload } from "../types";
import { getSupabaseClient } from "./supabaseClient";

export const getSession = async () => {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.getSession();

  if (error) {
    throw new Error(error.message || "Falha ao carregar a sessao atual.");
  }

  return data.session;
};

export const signIn = async ({ email, password }: AuthCredentials) => {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    throw new Error(error.message || "Falha ao entrar com email e senha.");
  }

  return data;
};

/** Normaliza CPF removendo pontuação (ex: "123.456.789-09" → "12345678909") */
const normalizeCPF = (cpf: string) => cpf.replace(/\D/g, "");

export const signUp = async ({ email, password, name, cpf, phone, cep, address, city, state }: SignUpPayload) => {
  const supabase = getSupabaseClient();

  // 1. Verificar se o CPF já está cadastrado
  const cleanCPF = normalizeCPF(cpf);
  const { data: existing, error: checkError } = await supabase
    .from("user_profiles")
    .select("user_id")
    .eq("cpf", cleanCPF)
    .maybeSingle();

  if (checkError) {
    throw new Error("Erro ao verificar CPF. Tente novamente.");
  }
  if (existing) {
    throw new Error("CPF_JA_CADASTRADO");
  }

  // 2. Criar conta Auth
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: name }
    }
  });

  if (error) {
    throw new Error(error.message || "Falha ao criar a conta.");
  }

  // 3. Salvar perfil KYC (somente se a sessão foi criada imediatamente)
  if (data.user) {
    const { error: profileError } = await supabase
      .from("user_profiles")
      .insert({
        user_id: data.user.id,
        full_name: name,
        cpf: cleanCPF,
        phone: phone.replace(/\D/g, ""),
        cep: cep.replace(/\D/g, ""),
        address,
        city,
        state,
        accepted_terms_at: new Date().toISOString()
      });

    if (profileError && !profileError.message.includes("duplicate")) {
      console.error("[signUp] Erro ao salvar perfil KYC:", profileError.message);
    }
  }

  return data;
};

/**
 * resetPassword — envia o email de recuperação de senha.
 * O link no email leva de volta ao app (redirectTo) com um token de recovery;
 * o supabase-js dispara o evento PASSWORD_RECOVERY ao abrir, e o app mostra a
 * tela de nova senha.
 */
export const resetPassword = async (email: string) => {
  const supabase = getSupabaseClient();
  const redirectTo = typeof window !== "undefined" ? window.location.origin : undefined;
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });

  if (error) {
    throw new Error(error.message || "Falha ao enviar o email de recuperação.");
  }
};

/** updatePassword — define a nova senha do usuário autenticado (fluxo de recovery). */
export const updatePassword = async (newPassword: string) => {
  const supabase = getSupabaseClient();
  const { error } = await supabase.auth.updateUser({ password: newPassword });

  if (error) {
    throw new Error(error.message || "Falha ao atualizar a senha.");
  }
};

export const signOut = async () => {
  const supabase = getSupabaseClient();
  const { error } = await supabase.auth.signOut();

  if (error) {
    throw new Error(error.message || "Falha ao encerrar a sessao.");
  }
};

export const onAuthStateChange = (
  callback: (event: AuthChangeEvent, session: Session | null) => void,
) => {
  const supabase = getSupabaseClient();
  const {
    data: { subscription }
  } = supabase.auth.onAuthStateChange((event, session) => {
    callback(event, session);
  });

  return () => subscription.unsubscribe();
};
