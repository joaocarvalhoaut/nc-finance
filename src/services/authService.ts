import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import type { AuthCredentials, SignUpPayload } from "../types";
import { getSupabaseClient } from "./supabaseClient";
import { identifyUser, resetAnalytics, track } from "../lib/analytics";

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

  // Analytics (opt-in): vincula só o UUID e registra o login — sem e-mail/PII.
  if (data.user) { identifyUser(data.user.id); track("logged_in"); }

  return data;
};

/**
 * Cadastro curto (nome, e-mail, senha). Quem chega aqui já marcou o aceite dos
 * termos no formulário: a data vai em user_metadata.accepted_terms_at e é
 * copiada para user_profiles quando o CPF/endereço são preenchidos no primeiro
 * acesso (CompletarCadastro) — o gatilho on_auth_user_created_profile só cria
 * o perfil quando o CPF vem no cadastro.
 */
export const signUp = async ({ email, password, name }: SignUpPayload) => {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: name.trim(),
        accepted_terms_at: new Date().toISOString(),
      }
    }
  });

  if (error) throw new Error(error.message || "Falha ao criar a conta.");

  if (data.user) {
    // Analytics (opt-in): identifica pelo UUID e marca o cadastro — sem PII.
    identifyUser(data.user.id);
    track("signed_up");
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

  // Encerra a associação de analytics para não misturar sessões.
  resetAnalytics();
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
