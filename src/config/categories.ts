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
  vencidos:      "Vencido",
  a_vencer:      "A vencer",
  recompra:      "Recompra",
  em_negociacao: "Em negociação",
  liquidado:     "Liquidado",
  pago_banco:    "Pago pro banco",
  desabilitado:  "Desabilitado",
};

/** Selo com borda — tabela da Visão Geral. */
export const CATEGORY_BADGE: Record<Category, string> = {
  vencidos:      "bg-rose-500/10 text-rose-400 border border-rose-500/20",
  a_vencer:      "bg-amber-500/10 text-amber-400 border border-amber-500/20",
  recompra:      "bg-sky-500/10 text-sky-400 border border-sky-500/20",
  em_negociacao: "bg-violet-500/10 text-violet-300 border border-violet-500/20",
  liquidado:     "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
  pago_banco:    "bg-teal-500/10 text-teal-300 border border-teal-500/20",
  desabilitado:  "bg-zinc-600/20 text-zinc-400 border border-zinc-600/30",
};

/** Selo sem borda — listas compactas. */
export const CATEGORY_TINT: Record<Category, string> = {
  vencidos:      "bg-rose-500/10 text-rose-400",
  a_vencer:      "bg-amber-500/10 text-amber-400",
  recompra:      "bg-sky-500/10 text-sky-400",
  em_negociacao: "bg-violet-500/10 text-violet-300",
  liquidado:     "bg-emerald-500/10 text-emerald-400",
  pago_banco:    "bg-teal-500/10 text-teal-300",
  desabilitado:  "bg-zinc-600/20 text-zinc-400",
};

/** Cor sólida do tipo (gráficos, pontos de filtro). */
export const CATEGORY_COR: Record<Category, string> = {
  vencidos:      "#e11d48",
  a_vencer:      "#d97706",
  recompra:      "#0284c7",
  em_negociacao: "#8b5cf6",
  liquidado:     "#059669",
  pago_banco:    "#0d9488",
  desabilitado:  "#71717a",
};

/** Ordem do clique no selo "Tipo" (e das opções do campo Tipo no celular). */
export const CATEGORY_CYCLE: readonly Category[] = [
  "vencidos", "a_vencer", "recompra", "em_negociacao", "liquidado", "pago_banco", "desabilitado",
];

/**
 * Recompra é cobrada como vencido: com juros e multa, e entra nas regras de
 * automação de vencidos. Em negociação também corre juros e multa (o valor
 * segue vencido), mas fica fora de envio em massa — ver foraDoLote.
 */
export const cobraComoVencido = (c: Category): boolean => c === "vencidos" || c === "recompra";

/** Corre multa e juros: vencido, recompra e em negociação (a dívida segue vencida). */
export const correEncargos = (c: Category): boolean => cobraComoVencido(c) || c === "em_negociacao";

/** Já pago — ao credor (Liquidado) ou direto ao banco. Conta como recuperado. */
export const estaPago = (c: Category): boolean => c === "liquidado" || c === "pago_banco";

/** Nunca recebe cobrança, nem avulsa: pago ou desabilitado. Valor sem encargos. */
export const bloqueiaCobranca = (c: Category): boolean => estaPago(c) || c === "desabilitado";

/**
 * Fora de cobrança em massa (automação, "Enviar todos", envio em lote): o que
 * não recebe cobrança e quem está em negociação — este último só recebe
 * mensagem avulsa, para não pressionar quem está negociando.
 */
export const foraDoLote = (c: Category): boolean => bloqueiaCobranca(c) || c === "em_negociacao";
