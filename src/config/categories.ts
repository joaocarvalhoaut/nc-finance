/**
 * Categorias de título — fonte única de rótulo, cor e regra de cobrança.
 *
 * Antes cada tela tinha a própria cadeia de ifs. Uma tinha ramo padrão que
 * exibia como "LIQUIDADO" (verde) qualquer categoria desconhecida — uma nova
 * categoria apareceria como paga enquanto estava sendo cobrada.
 */

import type { Debtor } from "../types";

export type Category = Debtor["category"];

export const CATEGORY_LABEL: Record<Category, string> = {
  vencidos:     "Vencido",
  a_vencer:     "A vencer",
  recompra:     "Recompra",
  liquidado:    "Liquidado",
  desabilitado: "Desabilitado",
};

/** Selo com borda — tabela da Visão Geral. */
export const CATEGORY_BADGE: Record<Category, string> = {
  vencidos:     "bg-rose-500/10 text-rose-400 border border-rose-500/20",
  a_vencer:     "bg-amber-500/10 text-amber-400 border border-amber-500/20",
  recompra:     "bg-sky-500/10 text-sky-400 border border-sky-500/20",
  liquidado:    "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
  desabilitado: "bg-zinc-600/20 text-zinc-400 border border-zinc-600/30",
};

/** Selo sem borda — listas compactas. */
export const CATEGORY_TINT: Record<Category, string> = {
  vencidos:     "bg-rose-500/10 text-rose-400",
  a_vencer:     "bg-amber-500/10 text-amber-400",
  recompra:     "bg-sky-500/10 text-sky-400",
  liquidado:    "bg-emerald-500/10 text-emerald-400",
  desabilitado: "bg-zinc-600/20 text-zinc-400",
};

/** Ordem do clique no selo "Tipo". Desabilitado fica fora: muda pela lista própria. */
export const CATEGORY_CYCLE: readonly Category[] = ["vencidos", "a_vencer", "recompra", "liquidado"];

/**
 * Recompra é cobrada como vencido: com juros e multa, e entra nas regras de
 * automação de vencidos. As travas de cobrança (liquidado/desabilitado) não
 * mudam — continuam bloqueando só o que já está pago ou desativado.
 */
export const cobraComoVencido = (c: Category): boolean => c === "vencidos" || c === "recompra";
