import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || "").trim();
const supabaseAnonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();

const missingEnvKeys: string[] = [];

if (!supabaseUrl) {
  missingEnvKeys.push("VITE_SUPABASE_URL");
}

if (!supabaseAnonKey) {
  missingEnvKeys.push("VITE_SUPABASE_ANON_KEY");
}

export const hasSupabaseConfig = missingEnvKeys.length === 0;

export const supabaseConfigError = hasSupabaseConfig
  ? ""
  : `Supabase nao configurado. Defina ${missingEnvKeys.join(" e ")} no arquivo .env antes de acessar o painel.`;

let supabaseClient: SupabaseClient | null = null;

export const getSupabaseClient = () => {
  if (!hasSupabaseConfig) {
    throw new Error(supabaseConfigError || "Supabase nao configurado.");
  }

  if (!supabaseClient) {
    supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });
  }

  return supabaseClient;
};

export const getSupabaseConfigStatus = () => ({
  hasSupabaseConfig,
  supabaseConfigError,
  missingEnvKeys: [...missingEnvKeys]
});
