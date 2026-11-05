/**
 * protecaoNumeroService — limite diário de mensagens e aquecimento do número.
 *
 * Colunas próprias em user_configuracoes (RLS: só a própria linha). Lidas à
 * parte do restante da configuração: se a migração ainda não rodou, só esta
 * parte fica indisponível. As regras estão em _shared/protecaoNumero.ts, as
 * mesmas que o servidor aplica em todo envio.
 */

import type { ProtecaoNumero } from "../../supabase/functions/_shared/protecaoNumero.ts";
import { getSupabaseClient } from "./supabaseClient";

const TABELA = "user_configuracoes";

export const protecaoNumeroService = {
  /** null quando não dá para ler (ex.: migração pendente). */
  async ler(userId: string): Promise<ProtecaoNumero | null> {
    const { data, error } = await getSupabaseClient()
      .from(TABELA)
      .select("limite_diario_envios, aquecimento_ativo, aquecimento_inicio")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) return null;
    const row = data as { limite_diario_envios: number | null; aquecimento_ativo: boolean | null; aquecimento_inicio: string | null } | null;
    return {
      limiteDiario: row?.limite_diario_envios ?? null,
      aquecimentoAtivo: row?.aquecimento_ativo !== false,
      aquecimentoInicio: row?.aquecimento_inicio ?? null,
    };
  },

  async salvar(userId: string, p: ProtecaoNumero): Promise<void> {
    const { error } = await getSupabaseClient()
      .from(TABELA)
      .upsert({
        user_id: userId,
        limite_diario_envios: p.limiteDiario,
        aquecimento_ativo: p.aquecimentoAtivo,
        aquecimento_inicio: p.aquecimentoInicio,
      }, { onConflict: "user_id" });
    if (error) throw new Error("Não foi possível salvar a proteção do número. Tente de novo.");
  },
};
