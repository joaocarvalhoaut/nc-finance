/**
 * encargos.ts — valor atualizado do título (multa + juros ao dia), o mesmo
 * cálculo do painel (App.tsx). É esse valor que vai na mensagem de cobrança.
 *
 * Calculado aqui, no envio, e não lido de updated_value: essa coluna só é
 * recalculada quando o painel abre, e a automação das 8h roda sem ninguém
 * com o app aberto — mandaria juros de dias atrás.
 */

import { createClient } from "npm:@supabase/supabase-js@2.49.8";

// deno-lint-ignore no-explicit-any
type AdminClient = ReturnType<typeof createClient<any, any, any>>;

export interface Encargos {
  multaPct:    number; // aplicada uma vez sobre o valor original
  jurosDiaPct: number; // por dia de atraso, sobre o valor original
}

/** Multa e juros configurados pela conta. Sem configuração (ou erro), zero. */
export async function lerEncargos(admin: AdminClient, userId: string): Promise<Encargos> {
  const { data } = await admin
    .from("user_configuracoes")
    .select("global_fine_pct, global_interest_day_pct")
    .eq("user_id", userId)
    .maybeSingle();
  const row = data as { global_fine_pct?: number | null; global_interest_day_pct?: number | null } | null;
  return {
    multaPct:    Number(row?.global_fine_pct ?? 0) || 0,
    jurosDiaPct: Number(row?.global_interest_day_pct ?? 0) || 0,
  };
}

/** "YYYY-MM-DD" de hoje no horário de Brasília. */
const hojeBrasilia = (): string =>
  new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);

/**
 * Valor com multa e juros. Só vencidos e recompra têm encargos (a vencer,
 * liquidado e desabilitado ficam no valor original), como no painel.
 * dueDate vem do banco em "YYYY-MM-DD".
 */
export function valorAtualizado(
  amount: number,
  dueDate: string,
  category: string,
  enc: Encargos,
  hoje: string = hojeBrasilia(),
): number {
  if (category !== "vencidos" && category !== "recompra") return amount;
  const venc = Date.parse(`${(dueDate || "").slice(0, 10)}T00:00:00Z`);
  const ref  = Date.parse(`${hoje}T00:00:00Z`);
  const dias = Number.isNaN(venc) ? 0 : Math.max(0, Math.floor((ref - venc) / 86_400_000));
  const multa = amount * (enc.multaPct / 100);
  const juros = amount * (enc.jurosDiaPct / 100) * dias;
  return Math.round((amount + multa + juros) * 100) / 100;
}
