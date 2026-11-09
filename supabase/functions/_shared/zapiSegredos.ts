/**
 * zapiSegredos.ts — abre os tokens da Z-API guardados no Supabase Vault.
 *
 * As tabelas user_zapi_config e platform_integrations guardam só o id do
 * segredo (token_secret_id / client_token_secret_id); o valor fica
 * criptografado no Vault (migration 20261109150000). Uma trigger no banco
 * grava no Vault a cada insert/update, então quem grava não precisa mudar nada.
 *
 * Etapa 1: a coluna em texto puro ainda existe e vale de reserva — se o Vault
 * falhar ou a migration não tiver rodado, o envio segue com ela. Na etapa 2 o
 * texto puro some e o Vault passa a ser a única fonte.
 *
 * Nunca logar o valor aberto.
 */

import { createClient } from "npm:@supabase/supabase-js@2.49.8";

// deno-lint-ignore no-explicit-any
type AdminClient = ReturnType<typeof createClient<any, any, any>>;

export interface LinhaComTokens {
  token?: string | null;
  client_token?: string | null;
  token_secret_id?: string | null;
  client_token_secret_id?: string | null;
}

/**
 * Devolve as linhas com token/client_token abertos do Vault. Sem segredo (ou
 * com o Vault fora do ar) mantém o texto puro da própria linha.
 */
export async function abrirTokens<T extends LinhaComTokens>(admin: AdminClient, linhas: T[]): Promise<T[]> {
  const ids = [...new Set(
    linhas.flatMap((l) => [l.token_secret_id, l.client_token_secret_id]).filter((id): id is string => Boolean(id)),
  )];
  if (!ids.length) return linhas;

  const { data, error } = await admin.rpc("zapi_abrir_segredos", { p_ids: ids });
  if (error) {
    console.warn(JSON.stringify({ source: "zapi-segredos.falha", message: error.message }));
    return linhas;
  }

  const abertos = new Map<string, string>();
  for (const r of (data ?? []) as { id: string; valor: string | null }[]) {
    if (r.id && r.valor) abertos.set(r.id, r.valor);
  }

  return linhas.map((l) => ({
    ...l,
    token: (l.token_secret_id && abertos.get(l.token_secret_id)) || l.token || null,
    client_token: (l.client_token_secret_id && abertos.get(l.client_token_secret_id)) || l.client_token || null,
  }));
}

/** Atalho para uma linha só (ou nenhuma). */
export async function abrirTokensDaLinha<T extends LinhaComTokens>(admin: AdminClient, linha: T | null): Promise<T | null> {
  if (!linha) return null;
  const [aberta] = await abrirTokens(admin, [linha]);
  return aberta;
}
