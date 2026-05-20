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

export const signUp = async ({ email, password, name }: SignUpPayload) => {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: name
      }
    }
  });

  if (error) {
    throw new Error(error.message || "Falha ao criar a conta.");
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
