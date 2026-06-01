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
